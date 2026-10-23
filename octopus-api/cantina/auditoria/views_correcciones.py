"""
Correcciones del Director desde Auditoría — contrato §10.

- GET   ventas/                     buscar ventas (paginado).
- POST  ventas/<id>/corregir/       método de pago, descuento, observaciones.
- PATCH cierres/<id>/notas/         nota del Director en un cierre.

Reglas: exclusivo del Director (VistaAuditoria), sin DELETE, `motivo`
obligatorio (>= 5 caracteres) y evento en la bitácora dentro de la misma
transacción. Los totales de un cierre ya cerrado son un snapshot que NO se
recalcula: cambiar método o descuento de una venta de un turno cerrado se
rechaza con 409 (decisión de seguridad). Stock y saldo de tarjeta no se tocan.
"""
from decimal import Decimal, InvalidOperation

from django.db import transaction
from django.db.models import Q
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response

from cantina import services_cxc
from cantina.models import CargoCantina, CierreCajaCantina, RevisionCierre, VentaCantina
from cantina.serializers import VentaCantinaSerializer
from config.pagination import StandardResultsPagination

from .bitacora import registrar_evento, snapshot
from .serializers_cierres import dinero, fecha_hora, turno_dict, usuario_dict
from .views_base import VistaAuditoria
from .views_cierres import (
    ParametroInvalido,
    error,
    parsear_area,
    parsear_rango_fechas,
    respuesta_detalle,
)

MOTIVO_MIN = 5
MOTIVO_MAX = 500
NOTAS_MAX = 2000
METODOS_BANCARIOS = {'zelle', 'transferencia', 'pago_movil', 'punto_de_venta'}
METODOS_CORREGIBLES = METODOS_BANCARIOS | {'efectivo', 'efectivo_ves'}
METODOS_CON_SALDO = {'tarjeta_prepago', 'credito_representante'}
CAMPOS_CORREGIBLES = ('metodo_pago', 'descuento_usd', 'motivo_descuento', 'observaciones', 'referencia')
CAMPOS_SNAPSHOT = ['metodo_pago', 'referencia', 'descuento_usd', 'motivo_descuento',
                   'observaciones', 'total_usd', 'total_ves']
CENTAVO = Decimal('0.01')


class Conflicto(Exception):
    """Regla de negocio incumplida -> 409 con el mensaje."""


def _motivo(request):
    """Motivo validado o lanza ParametroInvalido."""
    motivo = str(request.data.get('motivo') or '').strip()
    if len(motivo) < MOTIVO_MIN:
        raise ParametroInvalido(f"El 'motivo' es obligatorio (mínimo {MOTIVO_MIN} caracteres).")
    if len(motivo) > MOTIVO_MAX:
        raise ParametroInvalido(f"El 'motivo' no puede superar {MOTIVO_MAX} caracteres.")
    return motivo


class VentaSerializer(VentaCantinaSerializer):
    class Meta(VentaCantinaSerializer.Meta):
        fields = VentaCantinaSerializer.Meta.fields + ('observaciones',)
        read_only_fields = fields


def _cierre_de_venta(venta):
    """CierreCajaCantina del turno de la venta, o None si el turno sigue abierto."""
    if venta.apertura_id:
        return CierreCajaCantina.objects.filter(apertura_id=venta.apertura_id).first()
    return CierreCajaCantina.objects.filter(
        apertura__isnull=True, cajero_id=venta.cajero_id, area=venta.area,
        fecha=venta.creado_en.date(),
    ).first()


# ─────────────────────────────────────────────
# GET ventas/
# ─────────────────────────────────────────────
def _cliente_dict(venta):
    if venta.representante_id:
        r = venta.representante
        return {'tipo': 'representante', 'id': r.id, 'nombre': f'{r.nombre} {r.apellido}'.strip()}
    if venta.cliente_id:
        return {'tipo': 'cliente', 'id': venta.cliente_id, 'nombre': venta.cliente.nombre_completo}
    if venta.alumno_id:
        a = venta.alumno
        return {'tipo': 'alumno', 'id': a.id, 'nombre': f'{a.nombre} {a.apellido}'.strip()}
    return None


def _fila_venta(venta, cierres_por_apertura):
    cierre = cierres_por_apertura.get(venta.apertura_id) if venta.apertura_id else None
    return {
        'id': venta.id,
        'fecha': fecha_hora(venta.creado_en),
        'area': venta.area,
        'cajero': usuario_dict(venta.cajero),
        'total_usd': dinero(venta.total_usd),
        'descuento_usd': dinero(venta.descuento_usd),
        'metodo_pago': venta.metodo_pago,
        'estado': venta.estado,
        'cliente': _cliente_dict(venta),
        'turno': turno_dict(venta.apertura, cierre),
        'cierre_id': cierre.id if cierre else None,
        'cierre_cerrado': cierre is not None,
        'corregible': venta.estado == 'completada',
    }


class VentasBuscarView(VistaAuditoria):
    """GET ?q=&fecha_inicio=&fecha_fin=&area=&estado=&page=&page_size="""

    def get(self, request):
        try:
            fi, ff = parsear_rango_fechas(request)
            area = parsear_area(request)
        except ParametroInvalido as exc:
            return error(str(exc))
        estado = request.query_params.get('estado') or None
        if estado is not None and estado not in {'completada', 'anulada'}:
            return error("El parámetro 'estado' debe ser 'completada' o 'anulada'.")

        ventas = (
            VentaCantina.objects
            .select_related('cajero', 'apertura', 'alumno', 'representante', 'cliente')
            .filter(creado_en__date__gte=fi, creado_en__date__lte=ff)
        )
        if area:
            ventas = ventas.filter(area=area)
        if estado:
            ventas = ventas.filter(estado=estado)
        q = (request.query_params.get('q') or '').strip()
        if q:
            filtro = (
                Q(cajero__username__icontains=q) | Q(cajero__first_name__icontains=q)
                | Q(cajero__last_name__icontains=q) | Q(referencia__icontains=q)
                | Q(alumno__nombre__icontains=q) | Q(alumno__apellido__icontains=q)
                | Q(representante__nombre__icontains=q) | Q(representante__apellido__icontains=q)
                | Q(cliente__nombre__icontains=q) | Q(cliente__apellido__icontains=q)
            )
            if q.lstrip('#').isdigit():
                filtro |= Q(pk=int(q.lstrip('#')))
            ventas = ventas.filter(filtro)
        ventas = ventas.order_by('-creado_en', '-id')

        paginador = StandardResultsPagination()
        pagina = paginador.paginate_queryset(ventas, request, view=self)
        aperturas = {v.apertura_id for v in pagina if v.apertura_id}
        cierres = {c.apertura_id: c for c in CierreCajaCantina.objects.filter(apertura_id__in=aperturas)}
        return paginador.get_paginated_response([_fila_venta(v, cierres) for v in pagina])


# ─────────────────────────────────────────────
# POST ventas/<id>/corregir/
# ─────────────────────────────────────────────
def _decimal(valor):
    try:
        d = Decimal(str(valor))
    except (InvalidOperation, ValueError):
        raise ParametroInvalido("El campo 'descuento_usd' debe ser un número válido.")
    if not d.is_finite():
        raise ParametroInvalido("El campo 'descuento_usd' debe ser un número válido.")
    return d.quantize(CENTAVO)


def _ajustar_cargo(venta, total_nuevo):
    """Mantiene coherente el CargoCantina de una venta a cuenta (vía services_cxc)."""
    titular = venta.cliente if venta.cliente_id else venta.representante
    if titular is None:
        return
    services_cxc.lock_titular(titular)  # orden global: titular -> cargo
    cargo = CargoCantina.objects.select_for_update().filter(venta=venta).first()
    if cargo is None or cargo.estado == 'anulado':
        return
    if total_nuevo <= 0:
        raise Conflicto('El descuento no puede dejar en cero una venta cargada a cuenta; anule la venta.')
    if cargo.monto_pagado > 0:
        raise Conflicto('El cargo de esta venta ya tiene abonos aplicados; anule primero el abono.')
    diferencia = total_nuevo - cargo.monto_usd
    if diferencia > 0:
        saldo = services_cxc.saldo_titular(titular)
        limite = services_cxc.limite_credito(titular)
        if saldo + diferencia > limite:
            raise Conflicto('El nuevo total excede el límite de crédito del titular de la cuenta.')
    cargo.monto_usd = total_nuevo
    cargo.save(update_fields=['monto_usd'])


class CorregirVentaView(VistaAuditoria):
    parser_classes = [JSONParser, FormParser, MultiPartParser]

    def post(self, request, pk):
        get_object_or_404(VentaCantina, pk=pk)
        try:
            motivo = _motivo(request)
            datos = self._parsear(request)
            with transaction.atomic():
                venta = (
                    VentaCantina.objects.select_for_update()
                    .select_related('cliente', 'representante', 'alumno', 'apertura')
                    .get(pk=pk)
                )
                if venta.estado == 'anulada':
                    raise Conflicto('Las ventas anuladas no se editan.')
                antes = snapshot(venta, CAMPOS_SNAPSHOT)
                cambios = self._aplicar(venta, datos)
                if not cambios:
                    raise ParametroInvalido('No hay ningún cambio respecto a los valores actuales.')
                venta.save(update_fields=cambios)
                despues = snapshot(venta, CAMPOS_SNAPSHOT)
                diff = [c for c in CAMPOS_SNAPSHOT if antes[c] != despues[c]]
                registrar_evento(
                    'correccion_venta', objeto=venta, request=request,
                    antes={c: antes[c] for c in diff},
                    despues={c: despues[c] for c in diff},
                    motivo=motivo, area=venta.area,
                )
        except ParametroInvalido as exc:
            return error(str(exc))
        except Conflicto as exc:
            return error(str(exc), status.HTTP_409_CONFLICT)

        return Response(VentaSerializer(VentaCantina.objects.get(pk=pk)).data)

    @staticmethod
    def _parsear(request):
        datos = {c: request.data.get(c) for c in CAMPOS_CORREGIBLES if request.data.get(c) is not None}
        if not any(c in datos for c in ('metodo_pago', 'descuento_usd', 'motivo_descuento', 'observaciones')):
            raise ParametroInvalido(
                'Indique al menos un campo a corregir: metodo_pago, descuento_usd, motivo_descuento u observaciones.'
            )
        if 'metodo_pago' in datos:
            datos['metodo_pago'] = str(datos['metodo_pago']).strip()
            if datos['metodo_pago'] not in METODOS_CORREGIBLES | METODOS_CON_SALDO:
                raise ParametroInvalido("El 'metodo_pago' indicado no es válido.")
        if 'descuento_usd' in datos:
            datos['descuento_usd'] = _decimal(datos['descuento_usd'])
            if datos['descuento_usd'] < 0:
                raise ParametroInvalido("El 'descuento_usd' no puede ser negativo.")
        for campo, maximo in (('motivo_descuento', 200), ('referencia', 100), ('observaciones', 1000)):
            if campo in datos:
                datos[campo] = str(datos[campo]).strip()
                if len(datos[campo]) > maximo:
                    raise ParametroInvalido(f"'{campo}' no puede superar {maximo} caracteres.")
        return datos

    @staticmethod
    def _aplicar(venta, datos):
        """Muta `venta` y devuelve la lista de campos que cambiaron."""
        cambia_metodo = 'metodo_pago' in datos and datos['metodo_pago'] != venta.metodo_pago
        cambia_descuento = 'descuento_usd' in datos and datos['descuento_usd'] != venta.descuento_usd

        if cambia_metodo or cambia_descuento:
            cierre = _cierre_de_venta(venta)
            if cierre is not None:
                raise Conflicto(
                    f'La venta pertenece al cierre #{cierre.id}, que ya está cerrado: sus totales no se '
                    'recalculan, por lo que no se puede cambiar el método de pago ni el descuento. '
                    'Solo se pueden editar el motivo del descuento y las observaciones.'
                )

        cambios = []
        if cambia_metodo:
            nuevo = datos['metodo_pago']
            if venta.metodo_pago in METODOS_CON_SALDO or nuevo in METODOS_CON_SALDO:
                raise Conflicto(
                    'No se puede cambiar desde/hacia tarjeta prepago o cargo a cuenta: afecta saldos. '
                    'Anule la venta y regístrela de nuevo.'
                )
            if nuevo in METODOS_BANCARIOS:
                referencia = datos.get('referencia') or venta.referencia
                if not referencia:
                    raise ParametroInvalido("El método bancario requiere una 'referencia'.")
                if referencia != venta.referencia:
                    venta.referencia = referencia
                    cambios.append('referencia')
            venta.metodo_pago = nuevo
            cambios.append('metodo_pago')

        if cambia_descuento:
            subtotal = venta.total_usd + venta.descuento_usd
            nuevo_desc = datos['descuento_usd']
            if nuevo_desc > subtotal:
                raise ParametroInvalido('El descuento no puede superar el subtotal de la venta.')
            motivo_desc = datos.get('motivo_descuento', venta.motivo_descuento)
            if nuevo_desc > 0 and not motivo_desc:
                raise ParametroInvalido("El descuento requiere 'motivo_descuento'.")
            if venta.metodo_pago == 'tarjeta_prepago':
                raise Conflicto('No se puede cambiar el descuento de una venta pagada con tarjeta prepago.')
            venta.descuento_usd = nuevo_desc
            venta.total_usd = subtotal - nuevo_desc
            venta.total_ves = (venta.total_usd * venta.tasa_aplicada).quantize(CENTAVO)
            cambios += ['descuento_usd', 'total_usd', 'total_ves']
            if venta.metodo_pago == 'credito_representante':
                _ajustar_cargo(venta, venta.total_usd)
            if nuevo_desc == 0 and 'motivo_descuento' not in datos and venta.motivo_descuento:
                venta.motivo_descuento = ''
                cambios.append('motivo_descuento')

        for campo in ('motivo_descuento', 'observaciones'):
            if campo in datos and campo not in cambios and datos[campo] != getattr(venta, campo):
                if campo == 'motivo_descuento' and venta.descuento_usd > 0 and not datos[campo]:
                    raise ParametroInvalido("Una venta con descuento requiere 'motivo_descuento'.")
                setattr(venta, campo, datos[campo])
                cambios.append(campo)
        return cambios


# ─────────────────────────────────────────────
# PATCH cierres/<id>/notas/
# ─────────────────────────────────────────────
class NotasCierreView(VistaAuditoria):
    parser_classes = [JSONParser, FormParser, MultiPartParser]

    def patch(self, request, pk):
        cierre = get_object_or_404(CierreCajaCantina, pk=pk)
        try:
            motivo = _motivo(request)
        except ParametroInvalido as exc:
            return error(str(exc))
        if request.data.get('notas_director') is None:
            return error("El campo 'notas_director' es obligatorio (puede ir vacío para limpiar la nota).")
        notas = str(request.data.get('notas_director')).strip()
        if len(notas) > NOTAS_MAX:
            return error(f"'notas_director' no puede superar {NOTAS_MAX} caracteres.")

        RevisionCierre.objects.get_or_create(cierre=cierre)
        with transaction.atomic():
            revision = RevisionCierre.objects.select_for_update().get(cierre=cierre)
            anterior = revision.comentario_director
            revision.comentario_director = notas
            revision.save(update_fields=['comentario_director', 'actualizado_en'])
            registrar_evento(
                'nota_cierre', objeto=cierre, request=request,
                antes={'notas_director': anterior}, despues={'notas_director': notas},
                motivo=motivo, area=cierre.area,
            )
        return Response(respuesta_detalle(pk))
