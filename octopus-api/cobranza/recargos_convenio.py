"""Devengo auditable e idempotente de penalidades por convenio incumplido."""
from datetime import timedelta
from decimal import ROUND_HALF_UP, Decimal

from dateutil.relativedelta import relativedelta
from django.db import transaction
from django.utils import timezone

from .models import ConvenioPago, RecargoConvenio


CENTAVO = Decimal('0.01')


def _fecha_local(valor):
    if timezone.is_aware(valor):
        return timezone.localtime(valor).date()
    return valor.date()


def fecha_programada(convenio, numero_periodo):
    """Calcula cada período desde el ancla original, sin deriva mensual."""
    ancla = _fecha_local(convenio.incumplido_en)
    desplazamiento = (numero_periodo - 1) * convenio.intervalo_cantidad
    if convenio.intervalo_unidad == 'dia':
        return ancla + timedelta(days=desplazamiento)
    if convenio.intervalo_unidad == 'semana':
        return ancla + timedelta(days=desplazamiento * 7)
    return ancla + relativedelta(months=desplazamiento)


def saldo_principal_en(convenio, fecha):
    """Saldo al inicio del día programado, antes de sus pagos.

    Esta precedencia hace que un job atrasado reconstruya exactamente la
    misma base que uno ejecutado antes del pago durante el día programado.
    """
    saldo = Decimal('0.00')
    for cuota in convenio.cuotas.all():
        pagada_en_fecha = (
            cuota.pagada and cuota.pagada_en is not None
            and _fecha_local(cuota.pagada_en) < fecha
        )
        if not pagada_en_fecha:
            saldo += cuota.monto_usd
    return saldo.quantize(CENTAVO, rounding=ROUND_HALF_UP)


def _importe(convenio, saldo_base):
    if convenio.modo_recargo == 'monto_fijo_usd':
        return convenio.valor_recargo.quantize(CENTAVO, rounding=ROUND_HALF_UP)
    return (saldo_base * convenio.valor_recargo / Decimal('100')).quantize(
        CENTAVO, rounding=ROUND_HALF_UP,
    )


def _detener_automaticamente(convenio, motivo, momento):
    if convenio.recargos_detenidos_en:
        return
    convenio.recargos_detenidos_en = momento
    convenio.motivo_detencion_recargos = motivo
    convenio.save(update_fields=['recargos_detenidos_en', 'motivo_detencion_recargos'])


@transaction.atomic
def generar_recargos_convenio(convenio_id, fecha_referencia=None, momento=None):
    """Genera todos los períodos vencidos; repetir la llamada no duplica."""
    momento = momento or timezone.now()
    hoy = fecha_referencia or timezone.localdate(momento)
    convenio = (
        ConvenioPago.objects.select_for_update()
        .prefetch_related('cuotas', 'recargos_incumplimiento')
        .get(pk=convenio_id)
    )
    if (
        convenio.estado != ConvenioPago.INCUMPLIDO
        or not convenio.aplicar_recargo_incumplimiento
        or not convenio.incumplido_en
        or convenio.recargos_detenidos_en
    ):
        return []

    existentes = list(convenio.recargos_incumplimiento.all())
    cobrables = [r for r in existentes if r.estado != RecargoConvenio.ANULADO]
    # Una anulación libera importe y aplicaciones del límite, pero no borra
    # el lugar ocupado en el calendario ni permite volver a cobrarlo.
    cantidad_total = len(cobrables)
    episodio = [r for r in existentes if r.episodio_iniciado_en == convenio.incumplido_en]
    cantidad_episodio = len(episodio)
    ultimo_numero = max((recargo.numero_periodo for recargo in existentes), default=0)
    total = sum((recargo.monto_recargo_usd for recargo in cobrables), Decimal('0.00'))
    creados = []

    while True:
        if convenio.frecuencia_recargo == 'unico' and cantidad_episodio >= 1:
            break
        if convenio.maximo_aplicaciones and cantidad_total >= convenio.maximo_aplicaciones:
            _detener_automaticamente(convenio, 'maximo_aplicaciones', momento)
            break
        if convenio.tope_recargo_usd is not None and total >= convenio.tope_recargo_usd:
            _detener_automaticamente(convenio, 'tope_recargo', momento)
            break

        numero = ultimo_numero + 1
        programada = fecha_programada(convenio, cantidad_episodio + 1)
        if programada > hoy:
            break
        saldo_base = saldo_principal_en(convenio, programada)
        if saldo_base <= 0:
            _detener_automaticamente(convenio, 'sin_saldo_principal', momento)
            break

        monto = _importe(convenio, saldo_base)
        if convenio.tope_recargo_usd is not None:
            monto = min(monto, convenio.tope_recargo_usd - total)
        monto = monto.quantize(CENTAVO, rounding=ROUND_HALF_UP)
        if monto <= 0:
            _detener_automaticamente(convenio, 'tope_recargo', momento)
            break

        recargo, creado = RecargoConvenio.objects.get_or_create(
            convenio=convenio,
            numero_periodo=numero,
            defaults={
                'fecha_programada': programada,
                'episodio_iniciado_en': convenio.incumplido_en,
                'fecha_generada': momento,
                'modo_calculo': convenio.modo_recargo,
                'valor_configurado': convenio.valor_recargo,
                'saldo_base_usd': saldo_base,
                'monto_recargo_usd': monto,
            },
        )
        if creado:
            creados.append(recargo)
            total += monto
        cantidad_total += 1
        cantidad_episodio += 1
        ultimo_numero = numero

        if convenio.frecuencia_recargo == 'unico':
            break

    return creados


@transaction.atomic
def liquidar_recargos_antes_de_cierre(convenio, momento=None, *, pago_en_fecha=False):
    """Materializa pendientes antes de mutar el saldo, estado o detención.

    Los cargos se devengan al comienzo del día, antes de sus pagos. Tanto un
    pago como un cierre administrativo o renegociación incluyen el día de
    ejecución. ``pago_en_fecha`` identifica al llamador y conserva un contrato
    explícito; no cambia esa precedencia. No reactiva detenciones existentes.
    """
    momento = momento or timezone.now()
    fecha = timezone.localdate(momento)
    return generar_recargos_convenio(convenio.pk, fecha_referencia=fecha, momento=momento)


def generar_recargos_convenios_incumplidos(fecha_referencia=None, momento=None):
    ids = list(ConvenioPago.objects.filter(
        estado=ConvenioPago.INCUMPLIDO,
        aplicar_recargo_incumplimiento=True,
        recargos_detenidos_en__isnull=True,
    ).values_list('id', flat=True))
    total = 0
    for convenio_id in ids:
        total += len(generar_recargos_convenio(
            convenio_id, fecha_referencia=fecha_referencia, momento=momento,
        ))
    return total


@transaction.atomic
def detener_recargos_convenio(convenio, usuario, motivo='Detenido por un administrador'):
    convenio = ConvenioPago.objects.select_for_update().get(pk=convenio.pk)
    if convenio.recargos_detenidos_en:
        return convenio
    ahora = timezone.now()
    liquidar_recargos_antes_de_cierre(convenio, momento=ahora)
    convenio.refresh_from_db()
    # Si el devengo alcanzó un tope, registrar igualmente la decisión humana.
    convenio.recargos_detenidos_en = ahora
    convenio.recargos_detenidos_por = usuario
    convenio.motivo_detencion_recargos = (motivo or '').strip()[:200]
    convenio.save(update_fields=[
        'recargos_detenidos_en', 'recargos_detenidos_por',
        'motivo_detencion_recargos',
    ])
    return convenio
