import io
import logging
import zipfile
from datetime import date, datetime
from decimal import Decimal

import qrcode
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import IntegrityError, transaction
from django.db.models import Count, F, Sum
from django.db.models.functions import TruncDate
from django.http import FileResponse, HttpResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from cobranza.exports import ExcelExporter
from cobranza.models import BancoInstitucional, TasaCambio
from secretaria.models import Alumno, Representante
from .mora_cantina import dias_en_negativo
from .models import (
    CategoriaProducto,
    CierreCajaCantina,
    DetalleVentaCantina,
    HistorialCodigoTarjeta,
    LoteTarjetas,
    ParametroCantina,
    ProductoCantina,
    RecargaTarjeta,
    TarjetaPrepago,
    VentaCantina,
)
from .permissions import EsCajeroOAdmin
from .serializers import (
    AjustarCreditoSerializer,
    CategoriaProductoSerializer,
    CierreCajaCantinaSerializer,
    MovimientoInventarioSerializer,
    ParametroCantinaSerializer,
    ProductoCantinaSerializer,
    RecargaTarjetaSerializer,
    TarjetaMorosaSerializer,
    TarjetaPrepagoSerializer,
    VentaCantinaSerializer,
)
from .services_inventario import aplicar_movimiento_inventario
from .services_tarjeta import aplicar_movimiento_tarjeta, generar_codigo_tarjeta
from .utils import generar_pdf_ticket

logger = logging.getLogger(__name__)

CANTIDAD_MAXIMA_LOTE = 500
MOTIVOS_REPOSICION = ('extravio', 'dano')


# ─────────────────────────────────────────────
# AUTENTICACIÓN DEL MÓDULO CANTINA
# ─────────────────────────────────────────────
# NOTA: el login del cajero se unificó con el del resto del staff — ver
# POST /api/token/ (authentication/cookie_views.py::CookieTokenObtainPairView).
# Ya no existe un login propio en cantina (antes CantinaTokenView).
class CategoriasListCreateView(APIView):
    """
    GET: lista de categorías (para poblar el selector en ProductoFormModal.jsx).
    POST: crea una categoría nueva.

    No estaba en la tabla original de vistas de §5.6 de cantina.md —
    se agrega en Fase 1 porque el frontend necesita poblar el selector de
    categorías al crear/editar un producto y no tiene otra forma de hacerlo.
    """
    permission_classes = [permissions.IsAuthenticated, EsCajeroOAdmin]

    def get(self, request):
        categorias = CategoriaProducto.objects.all()
        return Response(CategoriaProductoSerializer(categorias, many=True).data)

    def post(self, request):
        serializer = CategoriaProductoSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class ProductosListCreateView(APIView):
    """
    GET: listado de productos, con filtro opcional por categoria/activo.
    POST: crea un producto nuevo. Cajero y administrador/director tienen el
    mismo nivel de acceso en todo el módulo (decisión explícita del
    cliente), así que ambos métodos usan el mismo permiso.
    """
    permission_classes = [permissions.IsAuthenticated, EsCajeroOAdmin]

    def get(self, request):
        productos = ProductoCantina.objects.select_related('categoria').all()

        categoria_id = request.query_params.get('categoria')
        if categoria_id:
            productos = productos.filter(categoria_id=categoria_id)

        activo = request.query_params.get('activo')
        if activo is not None:
            activo_bool = activo.lower() in ('1', 'true', 'si', 'sí')
            productos = productos.filter(activo=activo_bool)

        return Response(ProductoCantinaSerializer(productos, many=True).data)

    def post(self, request):
        serializer = ProductoCantinaSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class ProductoDetailView(APIView):
    """GET/PUT/PATCH/DELETE de un producto por pk — cajero/admin/director (mismo nivel de acceso)."""
    permission_classes = [permissions.IsAuthenticated, EsCajeroOAdmin]

    def get_object(self, pk):
        return get_object_or_404(ProductoCantina, pk=pk)

    def get(self, request, pk):
        producto = self.get_object(pk)
        return Response(ProductoCantinaSerializer(producto).data)

    def put(self, request, pk):
        producto = self.get_object(pk)
        serializer = ProductoCantinaSerializer(producto, data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    def patch(self, request, pk):
        producto = self.get_object(pk)
        serializer = ProductoCantinaSerializer(producto, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    def delete(self, request, pk):
        producto = self.get_object(pk)
        producto.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class ProductoBuscarPorCodigoView(APIView):
    """
    GET ?codigo=<codigo_barras> — usado por el POS (y por el cajero desde
    inventario) para resolver un producto escaneado. 404 claro si no existe.
    """
    permission_classes = [permissions.IsAuthenticated, EsCajeroOAdmin]

    def get(self, request):
        codigo = request.query_params.get('codigo')
        if not codigo:
            return Response(
                {'detail': "Debe indicar el parámetro 'codigo'."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        producto = ProductoCantina.objects.filter(codigo_barras=codigo).first()
        if not producto:
            return Response(
                {'detail': f"No se encontró ningún producto con código de barras '{codigo}'."},
                status=status.HTTP_404_NOT_FOUND,
            )

        return Response(ProductoCantinaSerializer(producto).data)


class MovimientoInventarioCreateView(APIView):
    """
    POST: registra un movimiento de inventario (entrada/salida/ajuste)
    delegando toda la lógica a `aplicar_movimiento_inventario` (servicio
    puro con select_for_update dentro de transaction.atomic). Nunca
    reimplementa esa lógica aquí.
    """
    permission_classes = [permissions.IsAuthenticated, EsCajeroOAdmin]

    def post(self, request):
        producto_id = request.data.get('producto')
        tipo = request.data.get('tipo')
        cantidad = request.data.get('cantidad')
        motivo = request.data.get('motivo', '') or ''

        if not producto_id or not tipo or cantidad in (None, ''):
            return Response(
                {'detail': "Los campos 'producto', 'tipo' y 'cantidad' son obligatorios."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        producto = get_object_or_404(ProductoCantina, pk=producto_id)

        try:
            cantidad = int(cantidad)
        except (TypeError, ValueError):
            return Response(
                {'detail': "El campo 'cantidad' debe ser un número entero."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            movimiento = aplicar_movimiento_inventario(
                producto, tipo, cantidad, motivo=motivo, usuario=request.user,
            )
        except DjangoValidationError as exc:
            mensaje = exc.messages[0] if hasattr(exc, 'messages') and exc.messages else str(exc)
            return Response({'detail': mensaje}, status=status.HTTP_400_BAD_REQUEST)

        return Response(
            MovimientoInventarioSerializer(movimiento).data,
            status=status.HTTP_201_CREATED,
        )


class ReporteStockCriticoView(APIView):
    """GET: productos activos donde stock_actual <= stock_minimo."""
    permission_classes = [permissions.IsAuthenticated, EsCajeroOAdmin]

    def get(self, request):
        productos = ProductoCantina.objects.select_related('categoria').filter(
            activo=True, stock_actual__lte=F('stock_minimo'),
        )
        return Response(ProductoCantinaSerializer(productos, many=True).data)


# ─────────────────────────────────────────────
# FASE 2 — Generación y asignación de tarjetas QR (§5.1/§8 FASE 2 de cantina.md)
# ─────────────────────────────────────────────

class GenerarLoteTarjetasView(APIView):
    """
    POST {cantidad}: crea un `LoteTarjetas` y N filas de `TarjetaPrepago`
    en estado 'sin_asignar', cada una con un `serial` humano secuencial
    (f'L{lote.id:03d}-{i:04d}') y un `codigo` QR aleatorio (nunca deriva de
    datos del alumno — no hay alumno todavía). Devuelve un .zip con un PNG
    por tarjeta (nombrado por `serial`), cada PNG codificando EXCLUSIVAMENTE
    `tarjeta.codigo` — ver §5.1/§10 checklist de cantina.md.
    """
    permission_classes = [permissions.IsAuthenticated, EsCajeroOAdmin]

    def post(self, request):
        cantidad_raw = request.data.get('cantidad')
        try:
            cantidad = int(cantidad_raw)
        except (TypeError, ValueError):
            return Response(
                {'detail': "El campo 'cantidad' debe ser un número entero."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if cantidad <= 0:
            return Response(
                {'detail': "La cantidad debe ser un entero positivo."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if cantidad > CANTIDAD_MAXIMA_LOTE:
            return Response(
                {'detail': f'No se pueden generar más de {CANTIDAD_MAXIMA_LOTE} tarjetas por lote.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        with transaction.atomic():
            lote = LoteTarjetas.objects.create(cantidad=cantidad, generado_por=request.user)

            tarjetas = []
            # Códigos ya asignados en ESTE mismo lote (aún no persistidos) —
            # generar_codigo_tarjeta() solo valida contra la BD, así que sin
            # este set dos códigos generados en la misma pasada podrían
            # coincidir (extremadamente improbable con el espacio de 32^10,
            # pero el chequeo es gratis y evita que un bulk_create reviente
            # por colisión intra-lote).
            codigos_usados = set()
            for i in range(1, cantidad + 1):
                codigo = generar_codigo_tarjeta()
                while codigo in codigos_usados:
                    codigo = generar_codigo_tarjeta()
                codigos_usados.add(codigo)
                tarjetas.append(TarjetaPrepago(
                    serial=f'L{lote.id:03d}-{i:04d}',
                    codigo=codigo,
                    lote=lote,
                    estado='sin_asignar',
                ))
            TarjetaPrepago.objects.bulk_create(tarjetas)

            zip_buffer = io.BytesIO()
            with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zip_file:
                for tarjeta in tarjetas:
                    img = qrcode.make(tarjeta.codigo)
                    png_buffer = io.BytesIO()
                    img.save(png_buffer, format='PNG')
                    zip_file.writestr(f'{tarjeta.serial}.png', png_buffer.getvalue())

        response = HttpResponse(zip_buffer.getvalue(), content_type='application/zip')
        response['Content-Disposition'] = f'attachment; filename="lote_{lote.id}.zip"'
        return response


class BuscarTarjetaSinAsignarView(APIView):
    """
    GET ?codigo= o ?serial=: resuelve una `TarjetaPrepago` en estado
    'sin_asignar' — primer paso del wizard de asignación (§7.3bis).
    404 con mensaje distinto según la tarjeta no exista o ya esté asignada.
    """
    permission_classes = [permissions.IsAuthenticated, EsCajeroOAdmin]

    def get(self, request):
        codigo = request.query_params.get('codigo')
        serial = request.query_params.get('serial')

        if not codigo and not serial:
            return Response(
                {'detail': "Debe indicar el parámetro 'codigo' o 'serial'."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        tarjeta = TarjetaPrepago.objects.filter(codigo=codigo).first() if codigo \
            else TarjetaPrepago.objects.filter(serial=serial).first()

        if not tarjeta:
            return Response(
                {'detail': 'No se encontró ninguna tarjeta con ese código/serial.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        if tarjeta.estado != 'sin_asignar':
            return Response(
                {'detail': f'Esta tarjeta ya fue asignada (estado actual: {tarjeta.get_estado_display()}).'},
                status=status.HTTP_404_NOT_FOUND,
            )

        return Response(TarjetaPrepagoSerializer(tarjeta).data)


class BuscarTarjetaParaReponerView(APIView):
    """
    GET ?codigo= o ?serial=: resuelve una `TarjetaPrepago` SIN filtrar por
    estado — a diferencia de `BuscarTarjetaSinAsignarView` (que exige
    'sin_asignar'), la tarjeta a reponer está justamente 'activa' (o
    'bloqueada'/'extraviada'). Solo se usa desde el flujo standalone de
    `ReponerTarjetaModal.jsx` (cuando no llega ya resuelta desde el
    conflicto de asignación). 'sin_asignar' se rechaza explícitamente:
    una tarjeta sin entregar no tiene nada que reponer todavía.
    """
    permission_classes = [permissions.IsAuthenticated, EsCajeroOAdmin]

    def get(self, request):
        codigo = request.query_params.get('codigo')
        serial = request.query_params.get('serial')

        if not codigo and not serial:
            return Response(
                {'detail': "Debe indicar el parámetro 'codigo' o 'serial'."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        tarjeta = TarjetaPrepago.objects.filter(codigo=codigo).first() if codigo \
            else TarjetaPrepago.objects.filter(serial=serial).first()

        if not tarjeta:
            return Response(
                {'detail': 'No se encontró ninguna tarjeta con ese código/serial.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        if tarjeta.estado == 'sin_asignar':
            return Response(
                {'detail': 'Esta tarjeta todavía no fue entregada a ningún alumno — no hay nada que reponer.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        return Response(TarjetaPrepagoSerializer(tarjeta).data)


class BuscarRepresentantePorCedulaView(APIView):
    """
    GET ?cedula=: busca un `Representante` activo por cédula y devuelve sus
    datos + sus alumnos activos (id, nombre, apellido, grado/sección) para
    que el frontend arme el selector del wizard de asignación (§7.3bis).
    Mismo criterio de búsqueda que `BuscarAlumnoCobranzaView` de `cobranza`
    (no se reimplementa su lógica de mensualidades, solo el patrón de
    búsqueda por cédula).
    """
    permission_classes = [permissions.IsAuthenticated, EsCajeroOAdmin]

    def get(self, request):
        cedula = request.query_params.get('cedula')
        if not cedula:
            return Response(
                {'detail': "Debe indicar el parámetro 'cedula'."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        representante = Representante.objects.filter(cedula=cedula, activo=True).first()
        if not representante:
            return Response(
                {'detail': f"No se encontró ningún representante activo con cédula '{cedula}'."},
                status=status.HTTP_404_NOT_FOUND,
            )

        alumnos = Alumno.objects.filter(representante=representante, activo=True)

        return Response({
            'representante': {
                'id': representante.id,
                'cedula': representante.cedula,
                'nombre': representante.nombre,
                'apellido': representante.apellido,
                'telefono': representante.telefono,
                'correo': representante.correo,
            },
            'alumnos': [
                {
                    'id': alumno.id,
                    'nombre': alumno.nombre,
                    'apellido': alumno.apellido,
                    'grado_seccion': alumno.grado_seccion,
                    'tiene_tarjeta': TarjetaPrepago.objects.filter(alumno_id=alumno.id).exists(),
                }
                for alumno in alumnos
            ],
        })


class AsignarTarjetaView(APIView):
    """
    POST <tarjeta_id>/asignar/ {alumno_id}: vincula una tarjeta
    'sin_asignar' a un alumno. Verifica ANTES de guardar si el alumno ya
    tiene una tarjeta (viola el OneToOneField) para responder 409 con un
    conflicto explícito en vez de dejar reventar un IntegrityError sin
    capturar — ver §5.1 punto 5 / §10 checklist de cantina.md.
    """
    permission_classes = [permissions.IsAuthenticated, EsCajeroOAdmin]

    def post(self, request, tarjeta_id):
        alumno_id = request.data.get('alumno_id')
        if not alumno_id:
            return Response(
                {'detail': "El campo 'alumno_id' es obligatorio."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        get_object_or_404(TarjetaPrepago, pk=tarjeta_id)  # 404 temprano si el id no existe, antes de tomar el lock
        alumno = get_object_or_404(Alumno, pk=alumno_id)

        with transaction.atomic():
            # select_for_update() bloquea la fila de la tarjeta durante toda
            # la transacción — sin esto, dos requests casi simultáneas
            # asignando la MISMA tarjeta (doble clic, dos admins en el mismo
            # lote) podían leer ambas 'sin_asignar' antes de que ninguna
            # confirmara, y la segunda escritura pisaba silenciosamente a la
            # primera sin ningún error (hallazgo de auditoría, alta severidad).
            tarjeta = TarjetaPrepago.objects.select_for_update().get(pk=tarjeta_id)
            if tarjeta.estado != 'sin_asignar':
                return Response(
                    {'detail': f'La tarjeta {tarjeta.serial} no está disponible para asignar (estado actual: {tarjeta.get_estado_display()}).'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            tarjeta_existente = TarjetaPrepago.objects.filter(alumno_id=alumno.id).first()
            if tarjeta_existente:
                return Response(
                    {
                        'conflicto': True,
                        'detail': f'{alumno.nombre} {alumno.apellido} ya tiene una tarjeta asignada ({tarjeta_existente.serial}). '
                                  'Si la tarjeta actual se extravió o dañó, use el flujo de reposición en vez de asignar una nueva.',
                        'tarjeta_existente_id': tarjeta_existente.id,
                    },
                    status=status.HTTP_409_CONFLICT,
                )

            tarjeta.alumno = alumno
            tarjeta.estado = 'activa'
            tarjeta.asignada_en = timezone.now()
            tarjeta.save(update_fields=['alumno', 'estado', 'asignada_en', 'actualizado_en'])

        return Response(TarjetaPrepagoSerializer(tarjeta).data, status=status.HTTP_200_OK)


class ReponerTarjetaView(APIView):
    """
    POST <tarjeta_id>/reponer/ {motivo}: reposición por extravío/daño.
    Genera un nuevo `codigo` (mismo alumno, mismo saldo — nunca se pierde),
    registra `HistorialCodigoTarjeta` con el código anterior, y actualiza
    `TarjetaPrepago.codigo`, todo dentro de la misma transacción — el
    código viejo deja de resolver a ninguna tarjeta apenas se confirma
    (§5.1/§10 checklist de cantina.md).
    """
    permission_classes = [permissions.IsAuthenticated, EsCajeroOAdmin]

    def post(self, request, tarjeta_id):
        motivo = request.data.get('motivo')
        if motivo not in MOTIVOS_REPOSICION:
            return Response(
                {'detail': f"El campo 'motivo' debe ser uno de: {', '.join(MOTIVOS_REPOSICION)}."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        tarjeta = get_object_or_404(TarjetaPrepago, pk=tarjeta_id)

        with transaction.atomic():
            tarjeta = TarjetaPrepago.objects.select_for_update().get(pk=tarjeta.pk)
            codigo_anterior = tarjeta.codigo
            nuevo_codigo = generar_codigo_tarjeta()

            HistorialCodigoTarjeta.objects.create(
                tarjeta=tarjeta,
                codigo_anterior=codigo_anterior,
                motivo=motivo,
                usuario=request.user,
            )

            tarjeta.codigo = nuevo_codigo
            tarjeta.save(update_fields=['codigo', 'actualizado_en'])

        return Response(TarjetaPrepagoSerializer(tarjeta).data, status=status.HTTP_200_OK)


# ─────────────────────────────────────────────
# FASE 3 — Recargas, moneda dual y validación de referencias cruzada
# (§5.6/§5.9/§8 FASE 3 de cantina.md)
# ─────────────────────────────────────────────

class BancosCantinaView(APIView):
    """
    GET: catálogo de `cobranza.BancoInstitucional` activos, para poblar el
    selector de banco en el formulario de recarga del cajero (no se
    duplica el modelo — mismo criterio que `PortalBancosView`).
    """
    permission_classes = [permissions.IsAuthenticated, EsCajeroOAdmin]

    def get(self, request):
        bancos = BancoInstitucional.objects.filter(activo=True).values(
            'id', 'nombre', 'numero_cuenta', 'tipos',
        )
        return Response(list(bancos))


class BuscarTarjetaView(APIView):
    """
    GET ?codigo= o ?serial=: busca una `TarjetaPrepago` en estado 'activa'
    por el código escaneado o por el serial impreso (respaldo si el QR no
    lee) — usado por el modal de recarga del cajero para resolver la
    tarjeta a recargar (y, a futuro, por el POS en Fase 4). Mismo criterio
    de doble búsqueda que `BuscarTarjetaSinAsignarView`/
    `BuscarTarjetaParaReponerView` (Fase 2). 404 claro si no existe o no
    está activa.
    """
    permission_classes = [permissions.IsAuthenticated, EsCajeroOAdmin]

    def get(self, request):
        codigo = request.query_params.get('codigo')
        serial = request.query_params.get('serial')
        if not codigo and not serial:
            return Response(
                {'detail': "Debe indicar el parámetro 'codigo' o 'serial'."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        tarjetas = TarjetaPrepago.objects.select_related('alumno').filter(estado='activa')
        tarjeta = tarjetas.filter(codigo=codigo).first() if codigo else tarjetas.filter(serial=serial).first()
        if not tarjeta:
            return Response(
                {'detail': f"No se encontró ninguna tarjeta activa con ese código/serial ('{codigo or serial}')."},
                status=status.HTTP_404_NOT_FOUND,
            )

        return Response(TarjetaPrepagoSerializer(tarjeta, context={'request': request}).data)


class TasaVigenteCantinaView(APIView):
    """
    GET: última `cobranza.TasaCambio` registrada — el cajero de cantina no
    tiene el JWT del panel admin (hook `useTasaBCV` no es reutilizable acá,
    ver §2 de cantina.md: JWT separado), así que se expone un endpoint
    propio y mínimo para que `RecargaCajeroModal.jsx` pueda convertir un
    monto ingresado en VES a USD antes de enviarlo (el backend solo acepta
    `monto_usd` en `RecargaTarjetaSerializer`, `monto_ves` es derivado).
    """
    permission_classes = [permissions.IsAuthenticated, EsCajeroOAdmin]

    def get(self, request):
        tasa = TasaCambio.objects.order_by('-fecha').first()
        if not tasa:
            return Response(
                {'detail': 'No se ha registrado ninguna tasa de cambio.'},
                status=status.HTTP_404_NOT_FOUND,
            )
        return Response({'valor_bs': str(tasa.valor_bs), 'fecha': tasa.fecha})


class TarjetasListView(APIView):
    """GET: listado de tarjetas (admin), con filtro opcional ?estado=."""
    permission_classes = [permissions.IsAuthenticated, EsCajeroOAdmin]

    def get(self, request):
        tarjetas = TarjetaPrepago.objects.select_related('alumno').all()

        estado = request.query_params.get('estado')
        if estado:
            tarjetas = tarjetas.filter(estado=estado)

        return Response(TarjetaPrepagoSerializer(tarjetas, many=True).data)


class RecargarTarjetaCajeroView(APIView):
    """
    POST: recarga en efectivo/transferencia/pago_movil/zelle registrada por
    el cajero, aprobada al instante (no pasa por 'pendiente' — a diferencia
    de las recargas del portal). El `RecargaTarjetaSerializer` valida la
    entrada (formato de referencia por método + deduplicación cruzada)
    ANTES de que se toque el saldo; el saldo se actualiza exclusivamente
    vía `aplicar_movimiento_tarjeta`, dentro de `transaction.atomic()`.
    """
    permission_classes = [permissions.IsAuthenticated, EsCajeroOAdmin]

    def post(self, request):
        serializer = RecargaTarjetaSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        archivo = request.FILES.get('comprobante')
        if archivo:
            error_comprobante = validar_comprobante(archivo)
            if error_comprobante:
                return Response({'detail': error_comprobante}, status=status.HTTP_400_BAD_REQUEST)

        try:
            tasa = TasaCambio.objects.latest('fecha')
        except TasaCambio.DoesNotExist:
            return Response(
                {'detail': 'No se ha registrado ninguna tasa de cambio.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        with transaction.atomic():
            recarga = serializer.save(
                tasa_aplicada=tasa.valor_bs,
                estatus='aprobado',
                registrado_por_portal=False,
                cajero=request.user,
                revisado_por=request.user,
                revisado_en=timezone.now(),
            )
            aplicar_movimiento_tarjeta(
                recarga.tarjeta, 'recarga', recarga.monto_usd,
                recarga=recarga, usuario=request.user,
            )

        return Response(RecargaTarjetaSerializer(recarga).data, status=status.HTTP_201_CREATED)


class RecargasPendientesView(APIView):
    """
    GET: recargas en estado 'pendiente' — las que llegaron desde el portal
    de representantes (construido por otro flujo en paralelo). Esta vista
    solo expone el listado; la aprobación/rechazo vive en las vistas de
    abajo.
    """
    permission_classes = [permissions.IsAuthenticated, EsCajeroOAdmin]

    def get(self, request):
        recargas = RecargaTarjeta.objects.select_related(
            'tarjeta__alumno', 'cajero', 'revisado_por',
        ).filter(estatus='pendiente')
        return Response(RecargaTarjetaSerializer(recargas, many=True).data)


class AprobarRecargaView(APIView):
    """
    POST <pk>/aprobar/: aprueba una recarga pendiente. Dentro de
    `transaction.atomic()` aplica el movimiento de saldo vía
    `aplicar_movimiento_tarjeta` (única puerta de entrada al saldo) y
    marca la recarga como aprobada.
    """
    permission_classes = [permissions.IsAuthenticated, EsCajeroOAdmin]

    def post(self, request, pk):
        recarga = get_object_or_404(RecargaTarjeta, pk=pk)

        if recarga.estatus != 'pendiente':
            return Response(
                {'detail': f'Esta recarga ya fue revisada (estado actual: {recarga.get_estatus_display()}).'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        with transaction.atomic():
            aplicar_movimiento_tarjeta(
                recarga.tarjeta, 'recarga', recarga.monto_usd,
                recarga=recarga, usuario=request.user,
            )
            recarga.estatus = 'aprobado'
            recarga.revisado_por = request.user
            recarga.revisado_en = timezone.now()
            recarga.save(update_fields=['estatus', 'revisado_por', 'revisado_en'])

        # La recarga ya quedó aprobada y el saldo ya se movió (transaction.atomic()
        # arriba) — un problema para encolar la notificación (ej. broker Celery
        # caído) no debe reportarse como falla de la aprobación en sí. Mismo
        # criterio del checklist §10 de cantina.md.
        from cantina.tasks import task_notificar_recarga_aprobada
        try:
            task_notificar_recarga_aprobada.delay(recarga.id)
        except Exception:
            logger.exception('No se pudo encolar la notificación de recarga aprobada id=%s', recarga.id)

        return Response(RecargaTarjetaSerializer(recarga).data, status=status.HTTP_200_OK)


class RechazarRecargaView(APIView):
    """
    POST <pk>/rechazar/: rechaza una recarga pendiente. No toca el saldo.
    Acepta opcionalmente `motivo` en el body solo para logging (el modelo
    actual no tiene un campo dedicado para esto — no se agrega una
    migración nueva únicamente para guardarlo, ver instrucciones de la
    tarea).
    """
    permission_classes = [permissions.IsAuthenticated, EsCajeroOAdmin]

    def post(self, request, pk):
        recarga = get_object_or_404(RecargaTarjeta, pk=pk)

        if recarga.estatus != 'pendiente':
            return Response(
                {'detail': f'Esta recarga ya fue revisada (estado actual: {recarga.get_estatus_display()}).'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        motivo = request.data.get('motivo')
        if motivo:
            logger.info('Recarga #%s rechazada por %s. Motivo: %s', recarga.pk, request.user, motivo)

        recarga.estatus = 'rechazado'
        recarga.revisado_por = request.user
        recarga.revisado_en = timezone.now()
        recarga.save(update_fields=['estatus', 'revisado_por', 'revisado_en'])

        return Response(RecargaTarjetaSerializer(recarga).data, status=status.HTTP_200_OK)


# ─────────────────────────────────────────────
# FASE 4 — POS y ventas (§5.6/§5.9/§8 FASE 4 de cantina.md)
# ─────────────────────────────────────────────

class RegistrarVentaView(APIView):
    """
    POST: crea una `VentaCantina` + sus `DetalleVentaCantina` a partir de un
    carrito. `alumno`/`tarjeta` son OPCIONALES salvo que `metodo_pago` sea
    'tarjeta_prepago' — una venta en efectivo (USD o VES) no exige NINGÚN
    dato del cliente (§5.2/§7.2/§10 checklist de cantina.md): es el "camino
    rápido por defecto" del POS.

    Contrato de request (acordado con el frontend, ver reporte de la tarea):
        {
          "items": [{"producto_id": 1, "cantidad": 2}, ...],
          "metodo_pago": "efectivo" | "efectivo_ves" | "tarjeta_prepago",
          "tarjeta_codigo": "CANT-XXXXXXXXXX"   # solo si metodo_pago == "tarjeta_prepago"
        }

    Orden de validaciones (checklist §10 — "si falla el stock de cualquier
    línea, no se toca el saldo de tarjeta, y viceversa"):
      1. Se valida el payload y se resuelven productos/tarjeta (solo lectura,
         nada se escribe todavía).
      2. Si el pago es con tarjeta, se hace un chequeo de crédito PROYECTADO
         *antes* de tocar stock o saldo — si ya se ve que excede el límite,
         se rechaza sin abrir siquiera la transacción de escritura.
      3. Dentro de `transaction.atomic()`: se descuenta stock línea por línea
         vía `aplicar_movimiento_inventario` (nunca dejar stock negativo) y,
         si aplica, se descuenta el saldo vía `aplicar_movimiento_tarjeta`
         (que repite la validación de crédito bajo `select_for_update`, como
         red de seguridad ante una carrera entre dos ventas simultáneas). Si
         cualquiera de los dos falla, la transacción completa se revierte —
         todo o nada.
    """
    permission_classes = [permissions.IsAuthenticated, EsCajeroOAdmin]

    def post(self, request):
        items = request.data.get('items')
        if not items or not isinstance(items, list):
            return Response(
                {'error': "Debe indicar 'items': una lista no vacía de {producto_id, cantidad}."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        metodo_pago = request.data.get('metodo_pago')
        if metodo_pago not in dict(VentaCantina.METODOS_PAGO):
            return Response(
                {'error': f"'metodo_pago' debe ser uno de: {', '.join(dict(VentaCantina.METODOS_PAGO))}."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # ── Resolver tarjeta/alumno (solo obligatorio con tarjeta_prepago) ──
        tarjeta = None
        alumno = None
        if metodo_pago == 'tarjeta_prepago':
            tarjeta_codigo = request.data.get('tarjeta_codigo')
            tarjeta_id = request.data.get('tarjeta_id')
            if not tarjeta_codigo and not tarjeta_id:
                return Response(
                    {'error': "El pago con tarjeta prepago requiere 'tarjeta_codigo' (o 'tarjeta_id')."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            tarjetas_activas = TarjetaPrepago.objects.select_related('alumno').filter(estado='activa')
            tarjeta = tarjetas_activas.filter(codigo=tarjeta_codigo).first() if tarjeta_codigo \
                else tarjetas_activas.filter(pk=tarjeta_id).first()
            if not tarjeta:
                return Response(
                    {'error': f"No se encontró ninguna tarjeta activa con ese código/id ('{tarjeta_codigo or tarjeta_id}')."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            alumno = tarjeta.alumno

        # ── Resolver productos y calcular total (solo lectura) ──────────────
        lineas = []
        total_usd = Decimal('0.00')
        for item in items:
            producto_id = item.get('producto_id')
            cantidad = item.get('cantidad')
            try:
                cantidad = int(cantidad)
            except (TypeError, ValueError):
                return Response(
                    {'error': "Cada línea del carrito requiere 'producto_id' y 'cantidad' (entero positivo)."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if cantidad <= 0:
                return Response(
                    {'error': "La cantidad de cada línea debe ser mayor a cero."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            producto = ProductoCantina.objects.filter(pk=producto_id, activo=True).first()
            if not producto:
                return Response(
                    {'error': f"No se encontró ningún producto activo con id '{producto_id}'."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if producto.stock_actual < cantidad:
                return Response(
                    {'error': f"Stock insuficiente de '{producto.nombre}' (disponible: {producto.stock_actual}, solicitado: {cantidad})."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            subtotal = (producto.precio * cantidad).quantize(Decimal('0.01'))
            total_usd += subtotal
            lineas.append((producto, cantidad, producto.precio, subtotal))

        if not lineas:
            return Response({'error': "El carrito no puede estar vacío."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            tasa = TasaCambio.objects.latest('fecha')
        except TasaCambio.DoesNotExist:
            return Response(
                {'error': 'No se ha registrado ninguna tasa de cambio.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        total_ves = (total_usd * tasa.valor_bs).quantize(Decimal('0.01'))

        # ── Chequeo de crédito PROYECTADO — antes de tocar stock o saldo ────
        if tarjeta is not None:
            saldo_proyectado = tarjeta.saldo - total_usd
            if saldo_proyectado < -tarjeta.limite_credito:
                disponible = tarjeta.saldo + tarjeta.limite_credito
                return Response(
                    {
                        'error': (
                            f"Saldo insuficiente en la tarjeta {tarjeta.serial}: el total de ${total_usd} "
                            f"excede el crédito disponible (${disponible}, límite ${tarjeta.limite_credito})."
                        )
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

        # ── Transacción: todo o nada ─────────────────────────────────────────
        try:
            with transaction.atomic():
                venta = VentaCantina.objects.create(
                    alumno=alumno,
                    tarjeta=tarjeta,
                    cajero=request.user,
                    metodo_pago=metodo_pago,
                    total_usd=total_usd,
                    tasa_aplicada=tasa.valor_bs,
                    total_ves=total_ves,
                )

                for producto, cantidad, precio_unitario, subtotal in lineas:
                    aplicar_movimiento_inventario(
                        producto, 'salida', cantidad,
                        motivo=f'Venta #{venta.id}', venta=venta, usuario=request.user,
                    )
                    DetalleVentaCantina.objects.create(
                        venta=venta, producto=producto, cantidad=cantidad,
                        precio_unitario=precio_unitario, subtotal=subtotal,
                    )

                if tarjeta is not None:
                    movimiento = aplicar_movimiento_tarjeta(
                        tarjeta, 'consumo', total_usd, venta=venta, usuario=request.user,
                    )
                    venta.saldo_tarjeta_despues = movimiento.saldo_despues
                    venta.save(update_fields=['saldo_tarjeta_despues'])
        except DjangoValidationError as exc:
            # Cubre tanto el ValidationError de stock insuficiente
            # (`aplicar_movimiento_inventario`) como `SaldoInsuficienteError`
            # (subclase de ValidationError, red de seguridad ante carrera de
            # dos ventas simultáneas) — la transacción atómica ya revirtió
            # TODO lo escrito (venta, detalles, stock) antes de llegar acá.
            mensaje = exc.messages[0] if hasattr(exc, 'messages') and exc.messages else str(exc)
            return Response({'error': mensaje}, status=status.HTTP_400_BAD_REQUEST)

        venta = VentaCantina.objects.select_related('alumno', 'tarjeta', 'cajero').prefetch_related(
            'detalles__producto',
        ).get(pk=venta.pk)
        return Response(VentaCantinaSerializer(venta).data, status=status.HTTP_201_CREATED)


class AnularVentaView(APIView):
    """
    POST <venta_id>/anular/: anula una venta ya completada. Reversa stock
    (entrada por cada línea) y, si fue con tarjeta, reversa el saldo
    (movimiento 'reverso') — todo dentro de `transaction.atomic()`. No
    permite anular una venta ya anulada (idempotencia — §10 checklist).

    DECISIÓN DE PERMISO: el cliente confirmó explícitamente que el cajero
    debe tener el mismo nivel de acceso que administrador/director en todo
    el módulo cantina (no se le restringe), así que esta vista usa
    `EsCajeroOAdmin` como el resto — ya no `EsAdminCantina`.
    """
    permission_classes = [permissions.IsAuthenticated, EsCajeroOAdmin]

    def post(self, request, venta_id):
        venta = get_object_or_404(
            VentaCantina.objects.select_related('tarjeta'), pk=venta_id,
        )

        if venta.estado == 'anulada':
            return Response(
                {'error': f'La venta #{venta.id} ya fue anulada anteriormente (no se puede anular dos veces).'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        with transaction.atomic():
            for detalle in venta.detalles.select_related('producto').all():
                aplicar_movimiento_inventario(
                    detalle.producto, 'entrada', detalle.cantidad,
                    motivo=f'Anulación de venta #{venta.id}', venta=venta, usuario=request.user,
                )

            if venta.tarjeta_id:
                aplicar_movimiento_tarjeta(
                    venta.tarjeta, 'reverso', venta.total_usd, venta=venta, usuario=request.user,
                )

            venta.estado = 'anulada'
            venta.anulada_en = timezone.now()
            venta.anulada_por = request.user
            venta.save(update_fields=['estado', 'anulada_en', 'anulada_por'])

        venta = VentaCantina.objects.select_related('alumno', 'tarjeta', 'cajero', 'anulada_por').prefetch_related(
            'detalles__producto',
        ).get(pk=venta.pk)
        return Response(VentaCantinaSerializer(venta).data, status=status.HTTP_200_OK)


class ReciboVentaPDFView(APIView):
    """
    GET <venta_id>/recibo/: genera (o regenera) el ticket de una venta en
    PDF vía `cantina/utils.py::generar_pdf_ticket` — sirve tanto para el
    ticket recién cobrado como para la reimpresión histórica de Fase 7
    (nunca se guarda un PDF estático, siempre se regenera desde
    `VentaCantina`/`DetalleVentaCantina`, así una venta anulada después
    siempre se reimprime mostrando "ANULADA").
    """
    permission_classes = [permissions.IsAuthenticated, EsCajeroOAdmin]

    def get(self, request, venta_id):
        venta = get_object_or_404(
            VentaCantina.objects.select_related('alumno', 'tarjeta', 'cajero', 'anulada_por').prefetch_related(
                'detalles__producto',
            ),
            pk=venta_id,
        )

        try:
            pdf_buffer = generar_pdf_ticket(venta)
        except Exception:
            logger.exception('Error generando PDF de ticket para venta id=%s', venta_id)
            return Response(
                {'error': 'No se pudo generar el ticket PDF.'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        return FileResponse(
            pdf_buffer,
            as_attachment=False,
            filename=f'Ticket_{venta.id:06d}.pdf',
            content_type='application/pdf',
        )


# ─────────────────────────────────────────────
# FASE 5 — Cierre de caja (§5.7/§8 FASE 5 de cantina.md)
# ─────────────────────────────────────────────

def _calcular_totales_dia_cajero(cajero, fecha):
    """
    Agrega ventas/recargas del `cajero` en la `fecha` dada. Usada tanto por
    el GET (resumen preliminar, nada se persiste) como por el POST
    (recálculo server-side antes de crear el `CierreCajaCantina` — nunca se
    confía en totales enviados por el cliente, mismo criterio que el resto
    del módulo con dinero, ver `RegistrarVentaView`).

    Devuelve un dict con los 4 `Decimal` ya redondeados a 2 decimales
    (`Decimal('0.00')` si `aggregate` no encuentra filas, para evitar
    `None`).
    """
    ventas_dia = VentaCantina.objects.filter(
        cajero=cajero, estado='completada', creado_en__date=fecha,
    )
    total_ventas = ventas_dia.aggregate(total=Sum('total_usd'))['total'] or Decimal('0.00')
    total_tarjeta = ventas_dia.filter(metodo_pago='tarjeta_prepago').aggregate(
        total=Sum('total_usd'),
    )['total'] or Decimal('0.00')
    total_efectivo = ventas_dia.filter(
        metodo_pago__in=['efectivo', 'efectivo_ves'],
    ).aggregate(total=Sum('total_usd'))['total'] or Decimal('0.00')

    total_recargas_efectivo = RecargaTarjeta.objects.filter(
        cajero=cajero, estatus='aprobado', registrado_por_portal=False, creado_en__date=fecha,
    ).aggregate(total=Sum('monto_usd'))['total'] or Decimal('0.00')

    return {
        'total_ventas': total_ventas,
        'total_tarjeta': total_tarjeta,
        'total_efectivo': total_efectivo,
        'total_recargas_efectivo': total_recargas_efectivo,
    }


class CierreCajaCantinaView(APIView):
    """
    GET/POST <sin parámetros>: cierre de caja diario del cajero autenticado
    (§5.7/§8 FASE 5 de cantina.md).

    GET:
      - Si `request.user` ya cerró caja HOY, devuelve ese `CierreCajaCantina`
        serializado + `"ya_cerrado": true`.
      - Si no, calcula (sin persistir) un resumen preliminar de sus ventas/
        recargas de hoy vía `_calcular_totales_dia_cajero` + `"ya_cerrado": false`.

    POST {conteo_fisico, observaciones}:
      - Recalcula los mismos 4 totales server-side (nunca confía en lo que
        mande el frontend) y crea el `CierreCajaCantina` dentro de
        `transaction.atomic()`.
      - Un segundo POST el mismo día devuelve 400 legible (el
        `unique_together` del modelo lo impediría con un IntegrityError sin
        capturar — se verifica ANTES para dar un mensaje claro, y además se
        envuelve el `.create()` en try/except como red de seguridad ante una
        carrera de dos POST simultáneos).
    """
    permission_classes = [permissions.IsAuthenticated, EsCajeroOAdmin]

    def get(self, request):
        hoy = timezone.localdate()
        cierre = CierreCajaCantina.objects.filter(cajero=request.user, fecha=hoy).first()
        if cierre:
            data = CierreCajaCantinaSerializer(cierre).data
            data['ya_cerrado'] = True
            return Response(data)

        totales = _calcular_totales_dia_cajero(request.user, hoy)
        return Response({
            'ya_cerrado': False,
            'total_ventas': str(totales['total_ventas']),
            'total_tarjeta': str(totales['total_tarjeta']),
            'total_efectivo': str(totales['total_efectivo']),
            'total_recargas_efectivo': str(totales['total_recargas_efectivo']),
        })

    def post(self, request):
        hoy = timezone.localdate()

        if CierreCajaCantina.objects.filter(cajero=request.user, fecha=hoy).exists():
            return Response(
                {'detail': 'Ya registraste el cierre de caja de hoy — no se puede cerrar dos veces el mismo día.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        conteo_fisico_raw = request.data.get('conteo_fisico')
        if conteo_fisico_raw in (None, ''):
            return Response(
                {'detail': "El campo 'conteo_fisico' es obligatorio."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            conteo_fisico = Decimal(str(conteo_fisico_raw))
        except Exception:
            return Response(
                {'detail': "El campo 'conteo_fisico' debe ser un número."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        observaciones = request.data.get('observaciones', '') or ''

        totales = _calcular_totales_dia_cajero(request.user, hoy)

        # La diferencia de caja se calcula contra el dinero que debería
        # estar FÍSICAMENTE en caja o en la cuenta del cajero: efectivo +
        # recargas cobradas en efectivo. El total de tarjeta prepago NO es
        # dinero físico (el saldo vive en la tarjeta, no en la caja), pero
        # sí entra en `total_ventas`/el registro para contexto administrativo.
        efectivo_esperado = totales['total_efectivo'] + totales['total_recargas_efectivo']
        diferencia = (conteo_fisico - efectivo_esperado).quantize(Decimal('0.01'))

        try:
            with transaction.atomic():
                cierre = CierreCajaCantina.objects.create(
                    cajero=request.user,
                    fecha=hoy,
                    total_ventas=totales['total_ventas'],
                    total_tarjeta=totales['total_tarjeta'],
                    total_efectivo=totales['total_efectivo'],
                    total_recargas_efectivo=totales['total_recargas_efectivo'],
                    conteo_fisico=conteo_fisico,
                    diferencia=diferencia,
                    observaciones=observaciones,
                )
        except IntegrityError:
            # Red de seguridad ante una carrera de dos POST simultáneos del
            # mismo cajero (el chequeo de arriba no es atómico por sí solo).
            return Response(
                {'detail': 'Ya registraste el cierre de caja de hoy — no se puede cerrar dos veces el mismo día.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        return Response(CierreCajaCantinaSerializer(cierre).data, status=status.HTTP_201_CREATED)


# ─────────────────────────────────────────────
# FASE 7 — Reportes y reimpresión de tickets (§5.6/§7.4/§8 FASE 7 de cantina.md)
# ─────────────────────────────────────────────

def _parsear_rango_fechas(request):
    """
    Resuelve `fecha_inicio`/`fecha_fin` desde query params, formato YYYY-MM-DD,
    default HOY para ambas si no se pasan — mismo criterio que
    `ExportarAuditoriaExcelView` (cobranza/views.py). Devuelve (fi, ff) como
    `date` o lanza `ValueError` con un mensaje ya listo para el 400.
    """
    fi_str = request.query_params.get('fecha_inicio')
    ff_str = request.query_params.get('fecha_fin')
    try:
        fi = datetime.strptime(fi_str, '%Y-%m-%d').date() if fi_str else date.today()
        ff = datetime.strptime(ff_str, '%Y-%m-%d').date() if ff_str else date.today()
    except ValueError:
        raise ValueError("Formato de fecha inválido. Use YYYY-MM-DD.")
    return fi, ff


def _ventas_del_rango(request):
    """
    Resuelve el queryset base de `VentaCantina` para el rango de fechas +
    filtro opcional `alumno_id` — reutilizado por `ReporteVentasView` y
    `ExportarVentasExcelView` para no duplicar el filtrado.
    """
    fi, ff = _parsear_rango_fechas(request)

    ventas = VentaCantina.objects.filter(
        creado_en__date__gte=fi, creado_en__date__lte=ff,
    )

    alumno_id = request.query_params.get('alumno_id')
    if alumno_id:
        ventas = ventas.filter(alumno_id=alumno_id)

    return fi, ff, ventas


class ReporteVentasView(APIView):
    """
    GET ?fecha_inicio=&fecha_fin=&alumno_id=: reporte de ventas del rango
    (default: hoy si no se pasan fechas, mismo criterio que
    `ExportarAuditoriaExcelView` de cobranza). Alimenta
    `HistorialVentasTable.jsx`, los totales agregados y el gráfico de
    ventas por día del frontend (§7.4 de cantina.md).

    Los totales/agregaciones ("productos más vendidos", "ventas por día",
    "total vendido") se calculan SIEMPRE sobre ventas en estado
    'completada' — una venta anulada no debe inflar ningún número del
    reporte, aunque sigue apareciendo en la lista `ventas` con su estado
    real (el frontend decide cómo mostrarla, ej. tachada).
    """
    permission_classes = [permissions.IsAuthenticated, EsCajeroOAdmin]

    def get(self, request):
        try:
            fi, ff, ventas = _ventas_del_rango(request)
        except ValueError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        ventas_lista = ventas.select_related('alumno', 'tarjeta', 'cajero').prefetch_related(
            'detalles__producto',
        )
        ventas_completadas = ventas.filter(estado='completada')

        totales = ventas_completadas.aggregate(
            total_vendido_usd=Sum('total_usd'), cantidad_ventas=Count('id'),
        )

        detalles = DetalleVentaCantina.objects.filter(
            venta__in=ventas_completadas,
        ).values('producto_id', 'producto__nombre').annotate(
            cantidad_total=Sum('cantidad'), monto_total=Sum('subtotal'),
        ).order_by('-monto_total')

        productos_mas_vendidos = [
            {
                'producto_id': d['producto_id'],
                'nombre': d['producto__nombre'],
                'cantidad_total': d['cantidad_total'] or 0,
                'monto_total': str(d['monto_total'] or Decimal('0.00')),
            }
            for d in detalles
        ]

        serie_diaria = ventas_completadas.annotate(
            dia=TruncDate('creado_en'),
        ).values('dia').annotate(total_usd=Sum('total_usd')).order_by('dia')

        ventas_por_dia = [
            {'fecha': str(fila['dia']), 'total_usd': str(fila['total_usd'] or Decimal('0.00'))}
            for fila in serie_diaria
        ]

        return Response({
            'fecha_inicio': str(fi),
            'fecha_fin': str(ff),
            'ventas': VentaCantinaSerializer(ventas_lista, many=True, context={'request': request}).data,
            'totales': {
                'total_vendido_usd': str(totales['total_vendido_usd'] or Decimal('0.00')),
                'cantidad_ventas': totales['cantidad_ventas'] or 0,
            },
            'productos_mas_vendidos': productos_mas_vendidos,
            'ventas_por_dia': ventas_por_dia,
        })


class ExportarVentasExcelView(APIView):
    """
    GET ?fecha_inicio=&fecha_fin=&alumno_id=: exporta a Excel las ventas del
    rango (mismos filtros que `ReporteVentasView`), reutilizando el helper
    `cobranza.exports.ExcelExporter` — no se reimplementa exportación a
    Excel (mismo patrón que `ExportarAuditoriaExcelView` de cobranza).
    """
    permission_classes = [permissions.IsAuthenticated, EsCajeroOAdmin]

    def get(self, request):
        try:
            fi, ff, ventas = _ventas_del_rango(request)
        except ValueError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        ventas = ventas.select_related('alumno', 'cajero').order_by('-creado_en')

        columns = [
            ('Fecha',          lambda x: x.creado_en.strftime('%d/%m/%Y %H:%M')),
            ('Alumno',         lambda x: f'{x.alumno.nombre} {x.alumno.apellido}' if x.alumno_id else 'Sin identificar'),
            ('Método de pago', lambda x: x.get_metodo_pago_display()),
            ('Total USD',      'total_usd'),
            ('Total VES',      'total_ves'),
            ('Estado',         lambda x: x.get_estado_display()),
            ('Cajero',         lambda x: x.cajero.username if x.cajero_id else ''),
        ]

        return ExcelExporter.export(ventas, columns, f'ventas_cantina_{fi}_{ff}')


# ─────────────────────────────────────────────
# Parámetros, ajuste de crédito y reporte de morosidad
# (agregado tras Fase 7 — el cliente pidió explícitamente: ver morosos,
# ajustar el crédito por tarjeta y configurar el crédito por defecto, todo
# vía frontend. DECISIÓN DE PERMISO: mismo criterio que el resto del módulo
# — el cajero tiene el mismo nivel de acceso que administrador/director
# (EsCajeroOAdmin), por decisión explícita del cliente.)
# ─────────────────────────────────────────────

class ParametroCantinaView(APIView):
    """
    GET/PUT: singleton `ParametroCantina` (límite de crédito por defecto y
    días de alerta de saldo negativo). Se usa `ParametroCantina.objects.first()`
    en vez de un pk fijo — si todavía no existe ninguna fila (primer arranque
    del módulo), se crea una con los defaults del modelo vía `get_or_create`.

    El PUT acepta actualización parcial de cualquiera de los dos campos
    (`partial=True`) aunque el verbo sea PUT — es un singleton simple, no
    tiene sentido exigir que el cliente reenvíe siempre ambos campos.
    """
    permission_classes = [permissions.IsAuthenticated, EsCajeroOAdmin]

    def _get_parametro(self):
        parametro = ParametroCantina.objects.first()
        if parametro is None:
            parametro, _ = ParametroCantina.objects.get_or_create()
        return parametro

    def get(self, request):
        parametro = self._get_parametro()
        return Response(ParametroCantinaSerializer(parametro).data)

    def put(self, request):
        parametro = self._get_parametro()
        serializer = ParametroCantinaSerializer(parametro, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


class AjustarCreditoTarjetaView(APIView):
    """
    PATCH <tarjeta_id>/credito/ {limite_credito}: ajusta el límite de
    crédito de UNA tarjeta puntual (a diferencia de `ParametroCantinaView`,
    que ajusta el default global). No pasa por `services_tarjeta.py` porque
    no toca `saldo` — pero sí usa `transaction.atomic()` + `select_for_update()`
    con el mismo criterio de concurrencia que `aplicar_movimiento_tarjeta`,
    para evitar una carrera con una venta concurrente que esté validando el
    límite de crédito en ese instante.
    """
    permission_classes = [permissions.IsAuthenticated, EsCajeroOAdmin]

    def patch(self, request, tarjeta_id):
        serializer = AjustarCreditoSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        nuevo_limite = serializer.validated_data['limite_credito']

        try:
            with transaction.atomic():
                tarjeta = TarjetaPrepago.objects.select_for_update().get(pk=tarjeta_id)
                tarjeta.limite_credito = nuevo_limite
                tarjeta.save(update_fields=['limite_credito', 'actualizado_en'])
        except TarjetaPrepago.DoesNotExist:
            return Response(
                {'detail': f"No se encontró ninguna tarjeta con id '{tarjeta_id}'."},
                status=status.HTTP_404_NOT_FOUND,
            )

        return Response(TarjetaPrepagoSerializer(tarjeta, context={'request': request}).data)


class ReporteMorosidadView(APIView):
    """
    GET ?dias_min=N: tarjetas con saldo negativo (`saldo < 0` y
    `saldo_negativo_desde__isnull=False`), con `dias_en_negativo` calculado
    vía `mora_cantina.dias_en_negativo` (fuente única de verdad para ese
    cálculo — no se reimplementa acá). El filtro `dias_min` se aplica en
    Python (no en el queryset) porque es sobre una propiedad calculada y el
    volumen de tarjetas en negativo de un colegio es chico. Ordena por
    `dias_en_negativo` descendente (los más morosos primero).
    """
    permission_classes = [permissions.IsAuthenticated, EsCajeroOAdmin]

    def get(self, request):
        tarjetas = TarjetaPrepago.objects.select_related('alumno__representante').filter(
            saldo__lt=0, saldo_negativo_desde__isnull=False,
        )

        filas = []
        for tarjeta in tarjetas:
            alumno = tarjeta.alumno
            representante = alumno.representante if alumno else None
            filas.append({
                'tarjeta_id': tarjeta.id,
                'serial': tarjeta.serial,
                'codigo': tarjeta.codigo,
                'alumno_id': alumno.id if alumno else None,
                'alumno_nombre': f'{alumno.nombre} {alumno.apellido}' if alumno else None,
                'grado_seccion': alumno.grado_seccion if alumno else None,
                'representante_nombre': f'{representante.nombre} {representante.apellido}' if representante else None,
                'representante_telefono': representante.telefono if representante else None,
                'representante_correo': representante.correo if representante else None,
                'saldo': tarjeta.saldo,
                'limite_credito': tarjeta.limite_credito,
                'saldo_negativo_desde': tarjeta.saldo_negativo_desde,
                'dias_en_negativo': dias_en_negativo(tarjeta),
            })

        dias_min_raw = request.query_params.get('dias_min')
        if dias_min_raw is not None:
            try:
                dias_min = int(dias_min_raw)
            except ValueError:
                return Response(
                    {'detail': "El parámetro 'dias_min' debe ser un número entero."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            filas = [fila for fila in filas if fila['dias_en_negativo'] >= dias_min]

        filas.sort(key=lambda fila: fila['dias_en_negativo'], reverse=True)

        return Response({
            'count': len(filas),
            'resultados': TarjetaMorosaSerializer(filas, many=True).data,
        })
