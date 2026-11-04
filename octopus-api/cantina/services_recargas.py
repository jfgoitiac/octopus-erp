"""Anulación segura de recargas de tarjeta.

Las recargas nunca se borran. El reverso bloquea tanto la recarga como la
tarjeta, crea un movimiento negativo y deja trazabilidad de caja y auditoría.
"""
from decimal import Decimal

from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone

from .auditoria.bitacora import registrar_evento, snapshot
from .models import AperturaCajaCantina, RecargaTarjeta
from .services_tarjeta import SaldoInsuficienteError, aplicar_movimiento_tarjeta


class ReversoRequiereAutorizacion(ValidationError):
    def __init__(self, saldo_actual, saldo_proyectado, limite_credito):
        self.saldo_actual = saldo_actual
        self.saldo_proyectado = saldo_proyectado
        self.limite_credito = limite_credito
        super().__init__('El reverso dejaría la tarjeta por debajo de su límite de crédito.')


def es_admin_cantina(user):
    if getattr(user, 'is_superuser', False):
        return True
    perfil = getattr(user, 'perfil', None)
    return bool(perfil and perfil.esta_activo and perfil.rol in {'administrador', 'director'})


def apertura_abierta_usuario(user):
    return AperturaCajaCantina.objects.filter(cajero=user, estado='abierta').order_by('-fecha_hora_apertura').first()


def _cierre_de(apertura):
    if not apertura:
        return None
    try:
        return apertura.cierre
    except Exception:
        return None


def evaluar_anulacion(recarga, user):
    apertura = recarga.apertura
    cierre = _cierre_de(apertura)
    admin = es_admin_cantina(user)
    propia = recarga.cajero_id == getattr(user, 'id', None)
    caja_abierta = bool(apertura and apertura.estado == 'abierta' and cierre is None)
    historica_o_portal = apertura is None
    puede = recarga.estatus == 'aprobado' and (
        admin or (propia and caja_abierta)
    )
    saldo_actual = recarga.tarjeta.saldo
    saldo_proyectado = saldo_actual - recarga.monto_usd
    return {
        'puede_anular': puede,
        'puede_corregir': puede and caja_abierta,
        'requiere_admin': recarga.estatus == 'aprobado' and not (propia and caja_abierta),
        'caja_cerrada': bool(cierre or (apertura and apertura.estado == 'cerrada')),
        'registro_historico_o_portal': historica_o_portal,
        'saldo_actual': saldo_actual,
        'saldo_proyectado': saldo_proyectado,
        'requiere_forzar_saldo': saldo_proyectado < -recarga.tarjeta.limite_credito,
        'cierre': cierre,
    }


@transaction.atomic
def anular_recarga(
    recarga_id, *, user, motivo, devolucion_dinero=False,
    forzar_saldo_negativo=False, request=None, tipo_evento='anulacion_recarga',
):
    recarga = (
        RecargaTarjeta.objects.select_for_update()
        .select_related('tarjeta', 'apertura', 'cajero')
        .get(pk=recarga_id)
    )
    if recarga.estatus != 'aprobado':
        raise ValidationError('La recarga ya fue revisada, rechazada o anulada; no puede revertirse otra vez.')

    evaluacion = evaluar_anulacion(recarga, user)
    if not evaluacion['puede_anular']:
        if evaluacion['requiere_admin']:
            raise PermissionError('Esta recarga requiere autorización de un administrador o director.')
        raise ValidationError('La recarga no admite anulación en su estado actual.')

    apertura_reverso = recarga.apertura if recarga.apertura and recarga.apertura.estado == 'abierta' else apertura_abierta_usuario(user)
    if (
        (evaluacion['caja_cerrada'] or evaluacion['registro_historico_o_portal'])
        and devolucion_dinero and not apertura_reverso
    ):
        raise ValidationError(
            'Abra una caja antes de registrar la devolución de dinero de una recarga cerrada o histórica.'
        )

    if evaluacion['requiere_forzar_saldo'] and not (es_admin_cantina(user) and forzar_saldo_negativo):
        raise ReversoRequiereAutorizacion(
            evaluacion['saldo_actual'], evaluacion['saldo_proyectado'], recarga.tarjeta.limite_credito,
        )

    antes = snapshot(recarga, ['estatus', 'monto_usd', 'metodo_pago'])
    try:
        aplicar_movimiento_tarjeta(
            recarga.tarjeta, 'anulacion_recarga', recarga.monto_usd,
            recarga=recarga, usuario=user,
            permitir_exceder_limite=bool(es_admin_cantina(user) and forzar_saldo_negativo),
        )
    except SaldoInsuficienteError as exc:
        raise ReversoRequiereAutorizacion(
            evaluacion['saldo_actual'], evaluacion['saldo_proyectado'], recarga.tarjeta.limite_credito,
        ) from exc

    recarga.estatus = 'anulado'
    recarga.anulada_en = timezone.now()
    recarga.anulada_por = user
    recarga.motivo_anulacion = motivo
    recarga.devolucion_dinero = bool(devolucion_dinero)
    recarga.apertura_reverso = apertura_reverso
    recarga.cierre_afectado = evaluacion['cierre']
    recarga.save(update_fields=[
        'estatus', 'anulada_en', 'anulada_por', 'motivo_anulacion',
        'devolucion_dinero', 'apertura_reverso', 'cierre_afectado',
    ])
    registrar_evento(
        tipo_evento, objeto=recarga, usuario=user, request=request,
        area=recarga.apertura.area if recarga.apertura else None,
        antes=antes,
        despues={
            **snapshot(recarga, ['estatus', 'monto_usd', 'metodo_pago']),
            'saldo_despues': str(evaluacion['saldo_proyectado']),
            'devolucion_dinero': recarga.devolucion_dinero,
            'cierre_afectado_id': recarga.cierre_afectado_id,
        },
        motivo=motivo,
    )
    return recarga
