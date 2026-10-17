"""Vistas de cuentas por cobrar (CxC) a representantes — PROMPT_CANTINA_CXC.md §3.3."""
import logging
from datetime import datetime
from decimal import Decimal
from io import BytesIO

from django.db import IntegrityError, transaction
from types import SimpleNamespace

from django.db.models import Exists, OuterRef, Q
from django.http import FileResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.dateparse import parse_date, parse_datetime
from reportlab.lib.colors import HexColor
from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch
from reportlab.pdfgen import canvas
from rest_framework import permissions, status
from rest_framework.exceptions import ValidationError
from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response
from rest_framework.views import APIView

from cobranza.exports import ExcelExporter
from common.busqueda import filtrar_busqueda
from secretaria.models import Alumno, Representante

from . import services_cxc
from .models import (
    AREAS,
    AbonoCantina,
    AperturaCajaCantina,
    CargoCantina,
    ClienteCantina,
    CreditoRepresentanteCantina,
)
from .permissions import EsAdminCantina, EsCajeroOAdmin
from .serializers_cxc import (
    AREAS_VALIDAS,
    AbonoInputSerializer,
    AnularAbonoInputSerializer,
    ClienteInputSerializer,
    CreditoInputSerializer,
    a_ves,
    agrupar_abonos,
    anotar_saldos,
    anotar_saldos_clientes,
    limite_default,
    nombre_usuario,
    prefetch_alumnos,
    serializar_cargo,
    serializar_cliente_resumen,
    serializar_linea_abono,
    serializar_representante_resumen,
    tasa_vigente_valor,
)

logger = logging.getLogger(__name__)

MAX_RESULTADOS_BUSCADOR = 20
LONGITUD_MINIMA_BUSQUEDA = 2


def _area_param(request):
    area = (request.query_params.get('area') or '').strip()
    if not area:
        return None
    if area not in AREAS_VALIDAS:
        raise ValidationError({'area': "Área inválida; use 'cantina' o 'libreria'."})
    return area


TIPOS_CLIENTE = {t[0] for t in ClienteCantina.TIPOS}
TIPOS_FILTRO = {'representante'} | TIPOS_CLIENTE


def _tipo_param(request):
    tipo = (request.query_params.get('tipo') or '').strip()
    if not tipo:
        return None
    if tipo not in TIPOS_FILTRO:
        raise ValidationError({'tipo': "Tipo inválido; use 'representante', 'personal' u 'otro'."})
    return tipo


def _cliente_anotado(pk, area=None):
    cli = anotar_saldos_clientes(ClienteCantina.objects.filter(pk=pk), area).first()
    if cli is None:
        from django.http import Http404
        raise Http404('Cliente no encontrado.')
    return cli


def _representante_anotado(pk, area=None):
    qs = anotar_saldos(Representante.objects.filter(pk=pk), area).prefetch_related(prefetch_alumnos())
    rep = qs.first()
    if rep is None:
        from django.http import Http404
        raise Http404('Representante no encontrado.')
    return rep


# ─────────────────────────────────────────────
# Buscador
# ─────────────────────────────────────────────
class BuscarRepresentanteCxcView(APIView):
    """GET ?q=: cada palabra debe coincidir (sin tildes) con cédula/nombre/apellido
    del representante o nombre/apellido/cédula escolar de uno de sus alumnos activos."""
    permission_classes = [permissions.IsAuthenticated, EsCajeroOAdmin]

    def get(self, request):
        q = (request.query_params.get('q') or '').strip()
        if len(q) < LONGITUD_MINIMA_BUSQUEDA:
            raise ValidationError({'q': f'Escriba al menos {LONGITUD_MINIMA_BUSQUEDA} caracteres.'})

        # Activos, más cualquier inactivo que todavía tenga saldo pendiente.
        con_saldo = Exists(CargoCantina.objects.filter(representante=OuterRef('pk'), estado='pendiente'))
        qs = Representante.objects.filter(Q(activo=True) | con_saldo)
        # Cada palabra puede caer en el representante o en un alumno activo
        # (tolerante a tildes/mayúsculas; palabras en cualquier orden).
        for palabra in q.split():
            por_rep = filtrar_busqueda(
                Representante.objects.all(), palabra, ['cedula', 'nombre', 'apellido']
            ).values('pk')
            por_alumno = filtrar_busqueda(
                Alumno.objects.filter(activo=True), palabra, ['nombre', 'apellido', 'cedula_escolar']
            ).values('representante_id')
            qs = qs.filter(Q(pk__in=por_rep) | Q(pk__in=por_alumno))
        # Se filtra por ids para que el distinct() no choque con las anotaciones.
        ids = list(qs.order_by('apellido', 'nombre').values_list('pk', flat=True).distinct()[:MAX_RESULTADOS_BUSCADOR * 5])
        ids = list(dict.fromkeys(ids))[:MAX_RESULTADOS_BUSCADOR]
        reps = anotar_saldos(Representante.objects.filter(pk__in=ids)).prefetch_related(prefetch_alumnos()).order_by('apellido', 'nombre')
        default = limite_default()
        resultados = [serializar_representante_resumen(r, default) for r in reps]

        # Clientes generales. `para_venta=1` excluye inactivos (no admiten ventas nuevas);
        # sin él, un inactivo con saldo pendiente sigue apareciendo para poder cobrarle.
        clientes = ClienteCantina.objects.all()
        if request.query_params.get('para_venta') in ('1', 'true', 'True'):
            clientes = clientes.filter(activo=True)
        else:
            con_saldo_cli = Exists(CargoCantina.objects.filter(cliente=OuterRef('pk'), estado='pendiente'))
            clientes = clientes.filter(Q(activo=True) | con_saldo_cli)
        for palabra in q.split():
            clientes = clientes.filter(
                pk__in=filtrar_busqueda(ClienteCantina.objects.all(), palabra, ['documento', 'nombre', 'apellido']).values('pk')
            )
        clis = anotar_saldos_clientes(clientes).order_by('apellido', 'nombre')[:MAX_RESULTADOS_BUSCADOR]
        resultados.extend(serializar_cliente_resumen(c, default) for c in clis)
        return Response(resultados)


# ─────────────────────────────────────────────
# Cuentas (lista paginada) y Excel
# ─────────────────────────────────────────────
class _PaginacionCuentas(PageNumberPagination):
    page_size = 25
    page_size_query_param = 'page_size'
    max_page_size = 100


def _filas_cuentas(request):
    """Cuentas con cargos (representantes y/o clientes según `tipo`), ordenadas por
    deuda descendente. Devuelve tuplas ligeras (tipo, pk, saldo, apellido, nombre);
    la hidratación completa se hace solo para la página pedida."""
    area = _area_param(request)
    tipo = _tipo_param(request)
    solo_deuda = request.query_params.get('con_deuda') in ('1', 'true', 'True')
    filas = []

    if tipo in (None, 'representante'):
        cargos_rep = CargoCantina.objects.filter(representante=OuterRef('pk')).exclude(estado='anulado')
        if area:
            cargos_rep = cargos_rep.filter(area=area)
        qs = Representante.objects.annotate(tiene_cargos=Exists(cargos_rep)).filter(tiene_cargos=True)
        qs = anotar_saldos(qs, area)
        if solo_deuda:
            qs = qs.filter(saldo_total__gt=0)
        filas += [('representante', r.pk, r.saldo_total, r.apellido, r.nombre) for r in qs]

    if tipo in (None, 'personal', 'otro'):
        cargos_cli = CargoCantina.objects.filter(cliente=OuterRef('pk')).exclude(estado='anulado')
        if area:
            cargos_cli = cargos_cli.filter(area=area)
        qs = ClienteCantina.objects.annotate(tiene_cargos=Exists(cargos_cli)).filter(tiene_cargos=True)
        if tipo:
            qs = qs.filter(tipo=tipo)
        qs = anotar_saldos_clientes(qs, area)
        if solo_deuda:
            qs = qs.filter(saldo_total__gt=0)
        filas += [(c.tipo, c.pk, c.saldo_total, c.apellido, c.nombre) for c in qs]

    filas.sort(key=lambda f: (-f[2], f[3], f[4]))
    return filas, area


def _hidratar_cuentas(filas, area):
    """Carga representantes/clientes de las filas y conserva el orden recibido."""
    ids_rep = [f[1] for f in filas if f[0] == 'representante']
    ids_cli = [f[1] for f in filas if f[0] != 'representante']
    reps = {
        r.pk: r for r in anotar_saldos(Representante.objects.filter(pk__in=ids_rep), area)
        .prefetch_related(prefetch_alumnos())
    }
    clis = {c.pk: c for c in anotar_saldos_clientes(ClienteCantina.objects.filter(pk__in=ids_cli), area)}
    return [reps[f[1]] if f[0] == 'representante' else clis[f[1]] for f in filas]


class CuentasCxcView(APIView):
    permission_classes = [permissions.IsAuthenticated, EsCajeroOAdmin]

    def get(self, request):
        filas, area = _filas_cuentas(request)
        paginador = _PaginacionCuentas()
        pagina = paginador.paginate_queryset(filas, request, view=self)
        default = limite_default()
        tasa = tasa_vigente_valor()
        data = [
            serializar_representante_resumen(t, default, tasa, con_totales=True)
            if isinstance(t, Representante)
            else serializar_cliente_resumen(t, default, tasa, con_totales=True)
            for t in _hidratar_cuentas(pagina, area)
        ]
        return paginador.get_paginated_response(data)


class CuentasCxcExcelView(APIView):
    permission_classes = [permissions.IsAuthenticated, EsAdminCantina]

    def get(self, request):
        filas, area = _filas_cuentas(request)
        ahora = timezone.now()
        etiquetas = {'representante': 'Representante', 'personal': 'Personal', 'otro': 'Otro'}
        titulares = [
            SimpleNamespace(
                tipo=etiquetas[f[0]], t=t,
                documento=t.cedula if f[0] == 'representante' else (t.documento or ''),
            )
            for f, t in zip(filas, _hidratar_cuentas(filas, area))
        ]
        columns = [
            ('Tipo', 'tipo'),
            ('Cédula / Documento', 'documento'),
            ('Titular', lambda r: f'{r.t.nombre} {r.t.apellido}'.strip()),
            ('Teléfono', lambda r: r.t.telefono),
            ('Deuda USD', lambda r: r.t.saldo_total),
            ('Deuda Cantina USD', lambda r: r.t.saldo_cantina),
            ('Deuda Librería USD', lambda r: r.t.saldo_libreria),
            ('Días de la deuda más antigua', lambda r: max((ahora - r.t.deuda_mas_antigua).days, 0) if r.t.deuda_mas_antigua else ''),
        ]
        return ExcelExporter.export(titulares, columns, 'cuentas_por_cobrar_cantina')


# ─────────────────────────────────────────────
# Estado de cuenta y crédito
# ─────────────────────────────────────────────
class EstadoCuentaCxcView(APIView):
    permission_classes = [permissions.IsAuthenticated, EsCajeroOAdmin]

    def get(self, request, representante_id):
        area = _area_param(request)
        rep = _representante_anotado(representante_id, area)
        tasa = tasa_vigente_valor()

        cargos = CargoCantina.objects.filter(representante=rep).select_related('alumno', 'venta').prefetch_related(
            'venta__detalles__producto',
        ).order_by('creado_en', 'id')
        abonos = AbonoCantina.objects.filter(representante=rep).select_related('cajero', 'banco_receptor')
        if area:
            cargos = cargos.filter(area=area)
            abonos = abonos.filter(area=area)

        resumen = serializar_representante_resumen(rep, limite_default())
        return Response({
            'representante': {
                'id': rep.id, 'cedula': rep.cedula, 'nombre': rep.nombre, 'apellido': rep.apellido,
                'telefono': rep.telefono, 'alumnos': resumen['alumnos'],
            },
            'saldo_usd': str(rep.saldo_total),
            'saldo_ves_tasa_vigente': a_ves(rep.saldo_total, tasa),
            'limite_usd': resumen['limite_usd'],
            'limite_personalizado': rep.limite_override is not None,
            'bloqueado': resumen['bloqueado'],
            'cargos': [serializar_cargo(c) for c in cargos],
            'abonos': agrupar_abonos(abonos),
        })


class EstadoCuentaClienteView(APIView):
    permission_classes = [permissions.IsAuthenticated, EsCajeroOAdmin]

    def get(self, request, cliente_id):
        area = _area_param(request)
        cli = _cliente_anotado(cliente_id, area)
        tasa = tasa_vigente_valor()

        cargos = CargoCantina.objects.filter(cliente=cli).select_related('alumno', 'venta').prefetch_related(
            'venta__detalles__producto',
        ).order_by('creado_en', 'id')
        abonos = AbonoCantina.objects.filter(cliente=cli).select_related('cajero', 'banco_receptor')
        if area:
            cargos = cargos.filter(area=area)
            abonos = abonos.filter(area=area)

        resumen = serializar_cliente_resumen(cli, limite_default())
        return Response({
            'tipo': cli.tipo,
            'cliente': {
                'id': cli.id, 'tipo': cli.tipo, 'cedula': cli.documento or '', 'nombre': cli.nombre,
                'apellido': cli.apellido, 'telefono': cli.telefono, 'email': cli.email,
                'activo': cli.activo, 'alumnos': [],
            },
            'saldo_usd': str(cli.saldo_total),
            'saldo_ves_tasa_vigente': a_ves(cli.saldo_total, tasa),
            'limite_usd': resumen['limite_usd'],
            'limite_personalizado': cli.limite_override is not None,
            'bloqueado': resumen['bloqueado'],
            'cargos': [serializar_cargo(c) for c in cargos],
            'abonos': agrupar_abonos(abonos),
        })


# ─────────────────────────────────────────────
# Clientes generales (alta, edición, listado y crédito)
# ─────────────────────────────────────────────
class ClientesCxcView(APIView):
    """GET ?q=&tipo=&activo=: listado paginado. POST: alta (cajero o admin)."""
    permission_classes = [permissions.IsAuthenticated, EsCajeroOAdmin]

    def get(self, request):
        qs = ClienteCantina.objects.all()
        tipo = _tipo_param(request)
        if tipo == 'representante':
            qs = qs.none()
        elif tipo:
            qs = qs.filter(tipo=tipo)
        activo = request.query_params.get('activo')
        if activo in ('1', 'true', 'True'):
            qs = qs.filter(activo=True)
        elif activo in ('0', 'false', 'False'):
            qs = qs.filter(activo=False)
        q = (request.query_params.get('q') or '').strip()
        for palabra in q.split():
            qs = qs.filter(
                pk__in=filtrar_busqueda(ClienteCantina.objects.all(), palabra, ['documento', 'nombre', 'apellido']).values('pk')
            )
        qs = anotar_saldos_clientes(qs).order_by('apellido', 'nombre')
        paginador = _PaginacionCuentas()
        pagina = paginador.paginate_queryset(qs, request, view=self)
        default = limite_default()
        return paginador.get_paginated_response([serializar_cliente_resumen(c, default) for c in pagina])

    def post(self, request):
        ser = ClienteInputSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        try:
            cli = ser.save()
        except IntegrityError:
            # Carrera entre dos altas con el mismo documento.
            raise ValidationError({'documento': 'Ya existe un cliente con ese documento.'})
        return Response(serializar_cliente_resumen(_cliente_anotado(cli.pk), limite_default()), status=status.HTTP_201_CREATED)


class ClienteCxcDetalleView(APIView):
    """PATCH: edita datos y activa/desactiva (cajero o admin). El límite y el bloqueo
    se cambian por `credito/` (solo admin), igual que en representantes."""
    permission_classes = [permissions.IsAuthenticated, EsCajeroOAdmin]

    def get(self, request, cliente_id):
        return Response(serializar_cliente_resumen(_cliente_anotado(cliente_id), limite_default()))

    def patch(self, request, cliente_id):
        cli = get_object_or_404(ClienteCantina, pk=cliente_id)
        ser = ClienteInputSerializer(cli, data=request.data, partial=True)
        ser.is_valid(raise_exception=True)
        try:
            ser.save()
        except IntegrityError:
            raise ValidationError({'documento': 'Ya existe un cliente con ese documento.'})
        return Response(serializar_cliente_resumen(_cliente_anotado(cli.pk), limite_default()))


class CreditoClienteView(APIView):
    """PATCH {limite_usd, bloqueado}: override del límite del cliente (null → usa el default)."""
    permission_classes = [permissions.IsAuthenticated, EsAdminCantina]

    def patch(self, request, cliente_id):
        ser = CreditoInputSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        datos = ser.validated_data
        if not datos:
            raise ValidationError({'detail': "Indique 'limite_usd' y/o 'bloqueado'."})
        with transaction.atomic():
            cli = services_cxc.lock_cliente(get_object_or_404(ClienteCantina, pk=cliente_id))
            if 'limite_usd' in datos:
                cli.limite_usd = datos['limite_usd']
            if 'bloqueado' in datos:
                cli.bloqueado = datos['bloqueado']
            cli.save(update_fields=['limite_usd', 'bloqueado'])
        return Response({
            'cliente_id': cli.id,
            'limite_usd': str(services_cxc.limite_credito(cli)),
            'limite_personalizado': cli.limite_usd is not None,
            'bloqueado': cli.bloqueado,
        })


class CreditoRepresentanteView(APIView):
    """PATCH {limite_usd, bloqueado}: override del límite de crédito (limite_usd=null → usa el default)."""
    permission_classes = [permissions.IsAuthenticated, EsAdminCantina]

    def patch(self, request, representante_id):
        rep = get_object_or_404(Representante, pk=representante_id)
        ser = CreditoInputSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        datos = ser.validated_data
        if not datos:
            raise ValidationError({'detail': "Indique 'limite_usd' y/o 'bloqueado'."})

        try:
            credito, _ = CreditoRepresentanteCantina.objects.get_or_create(representante=rep)
        except IntegrityError:
            # Carrera: otra petición lo creó entre el get y el create.
            credito = CreditoRepresentanteCantina.objects.get(representante=rep)
        if 'limite_usd' in datos:
            credito.limite_usd = datos['limite_usd']
        if 'bloqueado' in datos:
            credito.bloqueado = datos['bloqueado']
        credito.save()
        return Response({
            'representante_id': rep.id,
            'limite_usd': str(services_cxc.limite_credito(rep)),
            'limite_personalizado': credito.limite_usd is not None,
            'bloqueado': credito.bloqueado,
        })


# ─────────────────────────────────────────────
# Abonos
# ─────────────────────────────────────────────
def _parsear_fecha_pago(valor):
    if not valor:
        return None
    dt = parse_datetime(valor)
    if dt is None:
        d = parse_date(valor)
        if d is None:
            raise ValidationError({'fecha_pago': 'Formato inválido; use YYYY-MM-DD o ISO 8601.'})
        return d
    return dt


def _es_fecha_pasada(fecha):
    if fecha is None:
        return False
    if isinstance(fecha, datetime):
        if timezone.is_naive(fecha):
            fecha = timezone.make_aware(fecha)
        fecha = timezone.localtime(fecha).date()
    return fecha < timezone.localdate()


def _respuesta_operacion(abonos, titular):
    primero = abonos[0]
    saldo = services_cxc.saldo_titular(titular)
    return {
        'operacion_uuid': str(primero.operacion_uuid),
        'representante_id': None if services_cxc.es_cliente(titular) else titular.id,
        'cliente_id': titular.id if services_cxc.es_cliente(titular) else None,
        'area': primero.area,
        'fecha_pago': primero.fecha_pago,
        'es_retroactivo': primero.es_retroactivo,
        'motivo': primero.motivo,
        'lineas': [serializar_linea_abono(a) for a in abonos],
        'total_usd': str(sum((a.monto_usd for a in abonos), Decimal('0.00'))),
        'saldo_usd': str(saldo),
        'saldo_ves_tasa_vigente': a_ves(saldo, tasa_vigente_valor()),
    }


class RegistrarAbonoView(APIView):
    """POST: abono mixto. Sin `fecha_pago` pasada → abono de caja (exige apertura
    abierta del cajero, D9). Con fecha pasada → retroactivo (solo admin, D8)."""
    permission_classes = [permissions.IsAuthenticated, EsCajeroOAdmin]

    def post(self, request):
        ser = AbonoInputSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        datos = ser.validated_data
        if datos.get('cliente_id'):
            titular = get_object_or_404(ClienteCantina, pk=datos['cliente_id'])
            titular_kw = {'cliente': titular}
        else:
            titular = get_object_or_404(Representante, pk=datos['representante_id'])
            titular_kw = {'representante': titular}

        fecha_pago = _parsear_fecha_pago(datos.get('fecha_pago'))
        retroactivo = _es_fecha_pasada(fecha_pago)

        if retroactivo:
            if not EsAdminCantina().has_permission(request, self):
                return Response(
                    {'detail': 'Solo el administrador o director puede registrar pagos retroactivos.'},
                    status=status.HTTP_403_FORBIDDEN,
                )
            apertura = None
        else:
            apertura = AperturaCajaCantina.objects.filter(cajero=request.user, estado='abierta').first()
            if apertura is None:
                raise ValidationError({'detail': 'Debe tener una caja abierta para registrar abonos.'})

        abonos = services_cxc.registrar_abono(
            **titular_kw,
            lineas=datos['lineas'],
            cajero=request.user,
            apertura=apertura,
            fecha_pago=fecha_pago if retroactivo else None,
            motivo=datos.get('motivo') or '',
            area=datos.get('area'),
        )
        return Response(_respuesta_operacion(abonos, titular), status=status.HTTP_201_CREATED)


class AnularAbonoView(APIView):
    permission_classes = [permissions.IsAuthenticated, EsAdminCantina]

    def post(self, request, operacion_uuid):
        ser = AnularAbonoInputSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        services_cxc.anular_abono(operacion_uuid, request.user, motivo=ser.validated_data['motivo'])
        abono = AbonoCantina.objects.filter(operacion_uuid=operacion_uuid).first()
        saldo = services_cxc.saldo_titular(abono.cliente or abono.representante)
        return Response({
            'operacion_uuid': str(operacion_uuid),
            'estatus': 'anulado',
            'saldo_usd': str(saldo),
        })


# ─────────────────────────────────────────────
# Recibo PDF
# ─────────────────────────────────────────────
def generar_pdf_recibo_abono(abonos):
    """Recibo de una operación de abono (todas sus líneas), mismo estilo que el
    ticket de venta (`cantina.utils.generar_pdf_ticket`)."""
    from .utils import _get_config_colegio

    primero = abonos[0]
    es_cli = primero.cliente_id is not None
    rep = primero.cliente if es_cli else primero.representante
    nombre_colegio, rif_colegio = _get_config_colegio()
    metodo_labels = dict(AbonoCantina._meta.get_field('metodo_pago').choices)
    area_label = dict(AREAS).get(primero.area, primero.area)
    anulado = primero.estatus == 'anulado'

    buffer = BytesIO()
    c = canvas.Canvas(buffer, pagesize=letter)
    width, height = letter
    margin = 0.8 * inch
    azul, oro, gris, red = HexColor('#1e293b'), HexColor('#f59e0b'), HexColor('#64748b'), HexColor('#dc2626')

    c.setFillColor(azul)
    c.setFont('Helvetica-Bold', 16)
    c.drawString(margin, height - 1 * inch, nombre_colegio.upper())
    c.setFillColor(gris)
    c.setFont('Helvetica', 9)
    if rif_colegio:
        c.drawString(margin, height - 1.2 * inch, rif_colegio)
    c.setFillColor(azul)
    c.setFont('Helvetica-Bold', 12)
    c.drawRightString(width - margin, height - 1 * inch, f'RECIBO DE ABONO — {area_label.upper()}')
    c.setFont('Helvetica', 9)
    c.drawRightString(width - margin, height - 1.25 * inch, f'Operación {str(primero.operacion_uuid)[:8].upper()}')
    c.setStrokeColor(oro)
    c.setLineWidth(2)
    c.line(margin, height - 1.6 * inch, width - margin, height - 1.6 * inch)

    c.setFillColor(azul)
    c.setFont('Helvetica', 10)
    y = height - 2.0 * inch
    if es_cli:
        doc = f'  ({rep.documento})' if rep.documento else ''
        c.drawString(margin, y, f'Cliente: {rep.nombre_completo}{doc}')
    else:
        c.drawString(margin, y, f'Representante: {rep.nombre} {rep.apellido}  ({rep.cedula})')
    y -= 0.22 * inch
    c.drawString(margin, y, f'Cajero: {nombre_usuario(primero.cajero)}')
    c.setFont('Helvetica', 9)
    fecha = timezone.localtime(primero.fecha_pago)
    c.drawRightString(width - margin, height - 2.0 * inch, f"Fecha: {fecha.strftime('%d/%m/%Y')}")
    c.drawRightString(width - margin, height - 2.22 * inch, f"Hora: {fecha.strftime('%H:%M')}")
    if primero.es_retroactivo:
        y -= 0.22 * inch
        c.setFont('Helvetica-Oblique', 9)
        c.drawString(margin, y, f'Pago retroactivo — {primero.motivo[:90]}')

    y -= 0.5 * inch
    c.setFillColor(azul)
    c.rect(margin, y, width - 2 * margin, 0.28 * inch, fill=1, stroke=0)
    c.setFillColor(HexColor('#ffffff'))
    c.setFont('Helvetica-Bold', 9)
    c.drawString(margin + 0.1 * inch, y + 0.08 * inch, 'MÉTODO')
    c.drawString(margin + 2.3 * inch, y + 0.08 * inch, 'REFERENCIA')
    c.drawRightString(width - margin - 1.3 * inch, y + 0.08 * inch, 'USD')
    c.drawRightString(width - margin, y + 0.08 * inch, 'BS')

    total = Decimal('0.00')
    y -= 0.3 * inch
    for ab in abonos:
        c.setFillColor(azul)
        c.setFont('Helvetica', 9)
        c.drawString(margin + 0.1 * inch, y + 0.1 * inch, metodo_labels.get(ab.metodo_pago, ab.metodo_pago))
        c.drawString(margin + 2.3 * inch, y + 0.1 * inch, (ab.referencia or '—')[:30])
        c.drawRightString(width - margin - 1.3 * inch, y + 0.1 * inch, f'$ {ab.monto_usd:,.2f}')
        c.drawRightString(width - margin, y + 0.1 * inch, f'Bs. {ab.monto_ves:,.2f}')
        total += ab.monto_usd
        y -= 0.3 * inch

    c.setStrokeColor(oro)
    c.setLineWidth(1.5)
    c.line(margin, y + 0.3 * inch, width - margin, y + 0.3 * inch)
    c.setFillColor(azul)
    c.setFont('Helvetica-Bold', 11)
    c.drawString(margin + 0.1 * inch, y + 0.08 * inch, 'TOTAL ABONADO (USD):')
    c.drawRightString(width - margin, y + 0.08 * inch, f'$ {total:,.2f}')

    saldo = services_cxc.saldo_titular(rep)
    y -= 0.35 * inch
    c.setFont('Helvetica', 9)
    c.setFillColor(gris)
    c.drawString(margin, y, f'Saldo pendiente actual de la cuenta: $ {saldo:,.2f}')
    y -= 0.2 * inch
    c.setFont('Helvetica-Oblique', 8)
    c.drawString(margin, y, f'* Tasa aplicada: Bs. {primero.tasa_aplicada} — El monto en Bs. es referencial.')

    if anulado:
        c.saveState()
        c.setFillColor(red)
        c.setFillAlpha(0.35)
        c.translate(width / 2, height / 2)
        c.rotate(45)
        c.setFont('Helvetica-Bold', 90)
        c.drawCentredString(0, 0, 'ANULADO')
        c.restoreState()

    c.setFont('Helvetica', 7)
    c.setFillColor(HexColor('#94a3b8'))
    c.drawCentredString(width / 2, 0.6 * inch, 'Recibo generado automáticamente')
    c.showPage()
    c.save()
    buffer.seek(0)
    return buffer


class ReciboAbonoPDFView(APIView):
    permission_classes = [permissions.IsAuthenticated, EsCajeroOAdmin]

    def get(self, request, operacion_uuid):
        abonos = list(
            AbonoCantina.objects.filter(operacion_uuid=operacion_uuid)
            .select_related('representante', 'cliente', 'cajero', 'banco_receptor').order_by('id')
        )
        if not abonos:
            return Response({'detail': 'No existe un abono con ese identificador.'}, status=status.HTTP_404_NOT_FOUND)
        try:
            pdf = generar_pdf_recibo_abono(abonos)
        except Exception:
            logger.exception('Error generando recibo de abono %s', operacion_uuid)
            return Response({'error': 'No se pudo generar el recibo PDF.'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        return FileResponse(
            pdf, as_attachment=False,
            filename=f'Recibo_Abono_{str(operacion_uuid)[:8]}.pdf',
            content_type='application/pdf',
        )
