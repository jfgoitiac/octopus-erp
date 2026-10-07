"""
Conciliación semiautomática: cruza una línea del estado de cuenta bancario
contra la base de datos (pagos registrados y comprobantes pendientes del
portal) y deja constancia en un lote de revisión abierto por usuario.

Decisiones (ver PROMPT_MODULO_CONCILIADOR.md):
  - Match por los últimos 4–6 dígitos de la referencia, mismo banco receptor.
  - La unidad conciliable es la OPERACIÓN (operacion_uuid): una transferencia
    puede cubrir a varios hermanos.
  - La diferencia (banco - sistema) se recalcula en el servidor. Si supera la
    tolerancia se exige una observación; igual se puede conciliar.
  - El excedente solo se registra: no se toca ningún saldo.
  - Un comprobante pendiente del portal se aprueba al conciliarlo, con los
    mismos efectos que la aprobación manual (portal.services).
"""
import logging
import re
import uuid
from datetime import date
from decimal import Decimal, InvalidOperation

from django.db import IntegrityError, transaction
from django.db.models import Max, Min
from django.utils import timezone
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import BancoInstitucional, ConciliacionBancaria, LoteRevisionCaja, Pago, TasaCambio
from .permissions import filtrar_por_sede

logger = logging.getLogger(__name__)

ROLES_PERMITIDOS = ('director', 'sistemas', 'administrador', 'cobranza', 'cajero')
TOLERANCIA_DEFECTO = Decimal('200.00')
CENT = Decimal('0.01')
MAX_RESULTADOS = 50


# ─────────────────────────────────────────────────────────────────────────────
# Utilidades
# ─────────────────────────────────────────────────────────────────────────────

def _tiene_permiso(user):
    rol = getattr(getattr(user, 'perfil', None), 'rol', '')
    return user.is_superuser or rol in ROLES_PERMITIDOS


def tolerancia_global():
    from secretaria.models import ConfiguracionSistema
    config = ConfiguracionSistema.objects.first()
    valor = getattr(config, 'tolerancia_conciliacion_ves', None)
    return Decimal(valor) if valor is not None else TOLERANCIA_DEFECTO


def _dec(valor, campo):
    try:
        texto = str(valor).strip()
        if ',' in texto and '.' not in texto:
            texto = texto.replace(',', '.')
        d = Decimal(texto)
    except (InvalidOperation, AttributeError):
        raise ValueError(f'{campo} inválido.')
    if not d.is_finite():
        raise ValueError(f'{campo} inválido.')
    return d.quantize(CENT)


def _fecha(valor):
    if isinstance(valor, date):
        return valor
    try:
        return date.fromisoformat(str(valor)[:10])
    except (TypeError, ValueError):
        raise ValueError('transaccion.fecha inválida (use AAAA-MM-DD).')


def _fecha_pago(pago):
    return timezone.localtime(pago.fecha_pago).date()


def _recalcular_fechas(lote):
    """fecha_inicio/fecha_fin = mín/máx de fecha_pago de los pagos del lote."""
    agg = lote.pagos.aggregate(mn=Min('fecha_pago'), mx=Max('fecha_pago'))
    if agg['mn'] and agg['mx']:
        lote.fecha_inicio = timezone.localtime(agg['mn']).date()
        lote.fecha_fin = timezone.localtime(agg['mx']).date()
        lote.save(update_fields=['fecha_inicio', 'fecha_fin'])


def serializar_conciliacion(c):
    return {
        'id': c.id,
        'lote_id': c.lote_id,
        'operacion_uuid': str(c.operacion_uuid),
        'banco': c.banco.nombre,
        'banco_id': c.banco_id,
        'referencia_banco': c.referencia_banco,
        'fecha_banco': c.fecha_banco.isoformat(),
        'monto_banco_ves': str(c.monto_banco_ves),
        'monto_sistema_ves': str(c.monto_sistema_ves),
        'diferencia_ves': str(c.diferencia_ves),
        'tolerancia_aplicada_ves': str(c.tolerancia_aplicada_ves),
        'fuera_tolerancia': c.fuera_tolerancia,
        'observacion': c.observacion,
        'archivo_estado_cuenta': c.archivo_estado_cuenta,
        'comprobante_aprobado_id': c.comprobante_aprobado_id,
    }


def serializar_lote(lote, con_conciliaciones=False):
    data = {
        'id': lote.id,
        'estado': lote.estado,
        'fecha_inicio': lote.fecha_inicio.isoformat(),
        'fecha_fin': lote.fecha_fin.isoformat(),
        'total_operaciones': lote.conciliaciones.count(),
    }
    if con_conciliaciones:
        data['conciliaciones'] = [
            serializar_conciliacion(c)
            for c in lote.conciliaciones.select_related('banco').order_by('creado_en')
        ]
    return data


def _lote_abierto(user):
    return LoteRevisionCaja.objects.filter(usuario=user, estado='abierto').first()


def _obtener_o_crear_lote_abierto(user):
    lote = _lote_abierto(user)
    if lote:
        return lote
    hoy = timezone.localdate()
    return LoteRevisionCaja.objects.create(
        usuario=user, estado='abierto', fecha_inicio=hoy, fecha_fin=hoy,
    )


# ─────────────────────────────────────────────────────────────────────────────
# GET candidatos
# ─────────────────────────────────────────────────────────────────────────────

class CandidatosConciliacionView(APIView):
    """
    GET cobranza/conciliacion/candidatos/?banco=<id>&ref=<4-6 dígitos>

    Operaciones candidatas del banco receptor cuya referencia termina en los
    dígitos indicados: pagos `completado` agrupados por operación y
    comprobantes `pendiente` del portal (que se aprobarán al conciliar).
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        if not _tiene_permiso(request.user):
            return Response({'error': 'Sin permiso.'}, status=status.HTTP_403_FORBIDDEN)

        ref = (request.query_params.get('ref') or '').strip()
        if not re.fullmatch(r'\d{4,6}', ref):
            return Response({'error': 'ref debe tener entre 4 y 6 dígitos.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            banco_id = int(request.query_params.get('banco'))
        except (TypeError, ValueError):
            return Response({'error': 'banco inválido.'}, status=status.HTTP_400_BAD_REQUEST)
        if not BancoInstitucional.objects.filter(id=banco_id).exists():
            return Response({'error': 'Banco no encontrado.'}, status=status.HTTP_400_BAD_REQUEST)

        resultados = []

        # ── Pagos registrados, agrupados por operación ──
        pagos = list(
            filtrar_por_sede(request.user, Pago.objects.filter(
                banco_receptor_id=banco_id,
                estatus='completado',
                referencia__endswith=ref,
            ), campo='sede')
            .select_related('alumno__representante')
            .order_by('-fecha_pago')
        )
        grupos = {}
        for p in pagos:
            grupos.setdefault(p.operacion_uuid, []).append(p)

        conciliadas = {
            c.operacion_uuid: c.lote_id
            for c in ConciliacionBancaria.objects.filter(operacion_uuid__in=list(grupos))
        }

        for uuid_op, items in grupos.items():
            primero = items[0]
            rep = primero.alumno.representante
            alumnos = []
            for p in items:
                nombre = f'{p.alumno.nombre} {p.alumno.apellido}'.strip()
                if nombre not in alumnos:
                    alumnos.append(nombre)
            resultados.append({
                'operacion_uuid': str(uuid_op),
                'comprobante_id': None,
                'tipo': 'pago',
                'referencia': primero.referencia,
                'fecha': _fecha_pago(primero).isoformat(),
                'monto_ves': str(sum((p.monto_ves for p in items), Decimal('0')).quantize(CENT)),
                'representante': f'{rep.nombre} {rep.apellido}'.strip(),
                'alumnos': alumnos,
                'pagos_ids': [p.id for p in items],
                'conciliado': uuid_op in conciliadas,
                'lote_id': conciliadas.get(uuid_op),
                'se_aprobara': False,
            })

        # ── Comprobantes pendientes del portal ──
        from portal.models import ComprobantePago

        comprobantes = (
            filtrar_por_sede(request.user, ComprobantePago.objects.filter(
                banco_receptor_id=banco_id,
                estatus='pendiente',
                referencia_bancaria__endswith=ref,
            ), campo='mensualidad__alumno__sede')
            .select_related('mensualidad__alumno__representante')
            .order_by('-fecha_subida')
        )
        tasa = TasaCambio.objects.order_by('-fecha').first()
        tasa_valor = tasa.valor_bs if tasa else Decimal('1')
        for c in comprobantes:
            alumno = c.mensualidad.alumno
            rep = alumno.representante
            resultados.append({
                'operacion_uuid': None,
                'comprobante_id': c.id,
                'tipo': 'comprobante_pendiente',
                'referencia': c.referencia_bancaria,
                'fecha': timezone.localtime(c.fecha_subida).date().isoformat(),
                'monto_ves': str((c.mensualidad.monto_usd * tasa_valor).quantize(CENT)),
                'representante': f'{rep.nombre} {rep.apellido}'.strip(),
                'alumnos': [f'{alumno.nombre} {alumno.apellido}'.strip()],
                'pagos_ids': [],
                'conciliado': False,
                'lote_id': None,
                'se_aprobara': True,
            })

        return Response({'resultados': resultados[:MAX_RESULTADOS]})


# ─────────────────────────────────────────────────────────────────────────────
# POST conciliar
# ─────────────────────────────────────────────────────────────────────────────

class ErrorConciliacion(Exception):
    """Error de negocio al conciliar un ítem (mensaje en español + código HTTP)."""

    def __init__(self, mensaje, http_status=status.HTTP_400_BAD_REQUEST):
        super().__init__(mensaje)
        self.mensaje = mensaje
        self.http_status = http_status


def parsear_transaccion(tx):
    """Valida {referencia, fecha, monto} → (referencia, fecha, monto)."""
    tx = tx if isinstance(tx, dict) else {}
    referencia = str(tx.get('referencia') or '').strip()
    if not referencia:
        raise ErrorConciliacion('transaccion.referencia es requerida.')
    try:
        return referencia, _fecha(tx.get('fecha')), _dec(tx.get('monto'), 'transaccion.monto')
    except ValueError as exc:
        raise ErrorConciliacion(str(exc))


def parsear_tolerancia(valor):
    """Tolerancia explícita (valor absoluto) o la global si viene vacía."""
    if valor in (None, ''):
        return tolerancia_global()
    try:
        return abs(_dec(valor, 'tolerancia'))
    except ValueError as exc:
        raise ErrorConciliacion(str(exc))


def conciliar_item(user, banco, *, operacion_uuid, comprobante_id, referencia_banco,
                   fecha_banco, monto_banco, tolerancia, observacion='', archivo=''):
    """
    Concilia UNA operación (o aprueba un comprobante pendiente y lo concilia).
    Lógica única compartida por `conciliar/` y `auto/confirmar/`.

    Atómica por sí misma (savepoint si ya hay una transacción abierta): ante
    cualquier ErrorConciliacion no queda ningún efecto. Devuelve
    (conciliacion, lote, advertencias).
    """
    if bool(operacion_uuid) == bool(comprobante_id):
        raise ErrorConciliacion('Indique operacion_uuid o comprobante_id (solo uno).')
    if operacion_uuid:
        try:
            operacion_uuid = uuid.UUID(str(operacion_uuid))
        except ValueError:
            raise ErrorConciliacion('operacion_uuid inválido.')
    observacion = str(observacion or '').strip()
    archivo = str(archivo or '').strip()[:255]

    # La línea del banco no puede reutilizarse (verificación temprana; la
    # restricción única de la BD cubre la carrera).
    if ConciliacionBancaria.objects.filter(
        banco=banco, referencia_banco=referencia_banco, fecha_banco=fecha_banco,
    ).exists():
        raise ErrorConciliacion('Esa transacción del estado de cuenta ya fue usada en otra conciliación.')

    advertencias = []
    pago_notificar = None
    try:
        with transaction.atomic():
            comprobante = None
            if comprobante_id:
                comprobante, pagos, advertencias, pago_notificar = _aprobar_comprobante(
                    user, banco, comprobante_id,
                )
                operacion_uuid = pagos[0].operacion_uuid
            else:
                pagos = list(filtrar_por_sede(user, Pago.objects.filter(
                    operacion_uuid=operacion_uuid, banco_receptor=banco, estatus='completado',
                ), campo='sede'))
                if not pagos:
                    raise ErrorConciliacion('Operación no encontrada para ese banco.', status.HTTP_404_NOT_FOUND)
                if ConciliacionBancaria.objects.filter(operacion_uuid=operacion_uuid).exists():
                    raise ErrorConciliacion('Esta operación ya fue conciliada.')

            monto_sistema = sum((p.monto_ves for p in pagos), Decimal('0')).quantize(CENT)
            diferencia = (monto_banco - monto_sistema).quantize(CENT)
            fuera = abs(diferencia) > tolerancia
            if fuera and not observacion:
                # Al propagar la excepción se revierte la aprobación del comprobante.
                raise ErrorConciliacion('La diferencia supera la tolerancia: la observación es obligatoria.')

            lote = _obtener_o_crear_lote_abierto(user)
            conciliacion = ConciliacionBancaria.objects.create(
                lote=lote,
                operacion_uuid=operacion_uuid,
                banco=banco,
                referencia_banco=referencia_banco,
                fecha_banco=fecha_banco,
                monto_banco_ves=monto_banco,
                monto_sistema_ves=monto_sistema,
                diferencia_ves=diferencia,
                tolerancia_aplicada_ves=tolerancia,
                fuera_tolerancia=fuera,
                observacion=observacion,
                archivo_estado_cuenta=archivo,
                comprobante_aprobado=comprobante,
                usuario=user,
            )
            lote.pagos.add(*pagos)
            _recalcular_fechas(lote)

            if pago_notificar:
                mensualidad, pago = pago_notificar
                from portal.services import notificar_pago_aprobado
                transaction.on_commit(lambda: notificar_pago_aprobado(mensualidad, pago))
    except IntegrityError:
        raise ErrorConciliacion('La operación o la línea del estado de cuenta ya fue conciliada.')
    return conciliacion, lote, advertencias


def _aprobar_comprobante(user, banco, comprobante_id):
    """Aprueba el comprobante vía servicio. Devuelve
    (comprobante, [pago], advertencias, (mensualidad, pago)) o lanza ErrorConciliacion."""
    from portal.models import ComprobantePago
    from portal.services import ComprobanteNoEncontrado, ComprobanteYaProcesado, aprobar_comprobante

    try:
        comprobante_id = int(comprobante_id)
    except (TypeError, ValueError):
        raise ErrorConciliacion('Comprobante no encontrado.', status.HTTP_404_NOT_FOUND)
    visible = filtrar_por_sede(
        user, ComprobantePago.objects.filter(id=comprobante_id),
        campo='mensualidad__alumno__sede',
    ).first()
    if not visible:
        raise ErrorConciliacion('Comprobante no encontrado.', status.HTTP_404_NOT_FOUND)
    if visible.banco_receptor_id != banco.id:
        raise ErrorConciliacion('El comprobante pertenece a otro banco receptor.')
    try:
        comprobante, pago, mensualidad, advertencias = aprobar_comprobante(
            comprobante_id, user,
            observaciones='Aprobado automáticamente por conciliación bancaria',
        )
    except ComprobanteNoEncontrado:
        raise ErrorConciliacion('Comprobante no encontrado.', status.HTTP_404_NOT_FOUND)
    except ComprobanteYaProcesado as exc:
        raise ErrorConciliacion(f'Este comprobante ya fue procesado (estatus actual: {exc.estatus}).')
    return comprobante, [pago], advertencias, (mensualidad, pago)


class ConciliarOperacionView(APIView):
    """
    POST cobranza/conciliacion/conciliar/

    Body: { operacion_uuid | comprobante_id, banco,
            transaccion: {referencia, fecha, monto},
            tolerancia?, observacion?, archivo? }
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        if not _tiene_permiso(request.user):
            return Response({'error': 'Sin permiso.'}, status=status.HTTP_403_FORBIDDEN)

        data = request.data
        operacion_uuid = data.get('operacion_uuid') or None
        comprobante_id = data.get('comprobante_id') or None
        if bool(operacion_uuid) == bool(comprobante_id):
            return Response(
                {'error': 'Indique operacion_uuid o comprobante_id (solo uno).'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            banco = BancoInstitucional.objects.get(id=int(data.get('banco')))
        except (TypeError, ValueError, BancoInstitucional.DoesNotExist):
            return Response({'error': 'Banco inválido.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            referencia_banco, fecha_banco, monto_banco = parsear_transaccion(data.get('transaccion'))
            tolerancia = parsear_tolerancia(data.get('tolerancia'))
            conciliacion, lote, advertencias = conciliar_item(
                request.user, banco,
                operacion_uuid=operacion_uuid, comprobante_id=comprobante_id,
                referencia_banco=referencia_banco, fecha_banco=fecha_banco,
                monto_banco=monto_banco, tolerancia=tolerancia,
                observacion=data.get('observacion'), archivo=data.get('archivo'),
            )
        except ErrorConciliacion as exc:
            return Response({'error': exc.mensaje}, status=exc.http_status)

        respuesta = {
            'conciliacion': serializar_conciliacion(conciliacion),
            'lote': serializar_lote(lote),
        }
        if advertencias:
            respuesta['advertencias'] = advertencias
        return Response(respuesta, status=status.HTTP_201_CREATED)


# ─────────────────────────────────────────────────────────────────────────────
# Lote abierto
# ─────────────────────────────────────────────────────────────────────────────

class LoteAbiertoView(APIView):
    """GET cobranza/conciliacion/lotes/abierto/ → lote abierto del usuario (o null)."""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        if not _tiene_permiso(request.user):
            return Response({'error': 'Sin permiso.'}, status=status.HTTP_403_FORBIDDEN)
        lote = _lote_abierto(request.user)
        return Response({'lote': serializar_lote(lote, con_conciliaciones=True) if lote else None})


class FinalizarLoteAbiertoView(APIView):
    """POST cobranza/conciliacion/lotes/abierto/finalizar/ → cierra el lote abierto."""
    permission_classes = [permissions.IsAuthenticated]

    @transaction.atomic
    def post(self, request):
        if not _tiene_permiso(request.user):
            return Response({'error': 'Sin permiso.'}, status=status.HTTP_403_FORBIDDEN)
        lote = LoteRevisionCaja.objects.select_for_update().filter(
            usuario=request.user, estado='abierto',
        ).first()
        if not lote:
            return Response({'error': 'No tiene un lote abierto.'}, status=status.HTTP_404_NOT_FOUND)
        if not lote.pagos.exists():
            return Response({'error': 'El lote abierto no tiene operaciones.'}, status=status.HTTP_400_BAD_REQUEST)

        _recalcular_fechas(lote)
        lote.estado = 'finalizado'
        lote.save(update_fields=['estado'])
        return Response(serializar_lote(lote, con_conciliaciones=True))
