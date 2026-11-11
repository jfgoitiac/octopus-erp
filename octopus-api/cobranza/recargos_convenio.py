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
    """Saldo de cuotas que seguían pendientes en la fecha programada."""
    saldo = Decimal('0.00')
    for cuota in convenio.cuotas.all():
        pagada_en_fecha = (
            cuota.pagada and cuota.pagada_en is not None
            and _fecha_local(cuota.pagada_en) <= fecha
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

    existentes = list(
        convenio.recargos_incumplimiento.exclude(estado=RecargoConvenio.ANULADO)
        .order_by('numero_periodo')
    )
    cantidad_total = len(existentes)
    ancla_actual = _fecha_local(convenio.incumplido_en)
    cantidad_episodio = sum(1 for recargo in existentes if recargo.fecha_programada >= ancla_actual)
    ultimo_numero = max((recargo.numero_periodo for recargo in existentes), default=0)
    total = sum((recargo.monto_recargo_usd for recargo in existentes), Decimal('0.00'))
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
    convenio.recargos_detenidos_en = timezone.now()
    convenio.recargos_detenidos_por = usuario
    convenio.motivo_detencion_recargos = (motivo or '').strip()[:200]
    convenio.save(update_fields=[
        'recargos_detenidos_en', 'recargos_detenidos_por',
        'motivo_detencion_recargos',
    ])
    return convenio
