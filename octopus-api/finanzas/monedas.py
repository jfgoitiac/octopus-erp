"""Conversión monetaria centralizada para Finanzas y Egresos."""
from decimal import Decimal, ROUND_HALF_UP

from cobranza.models import TasaCambio

CENTAVO = Decimal('0.01')


def redondear(valor):
    """Redondea importes monetarios con la regla comercial requerida."""
    return Decimal(str(valor)).quantize(CENTAVO, rounding=ROUND_HALF_UP)


def convertir(monto, moneda_origen, moneda_destino, tasa):
    """Convierte USD/VES usando una tasa VES por USD y redondeo comercial."""
    monto = Decimal(str(monto))
    tasa = Decimal(str(tasa))
    if tasa <= 0:
        raise ValueError('La tasa debe ser mayor que cero.')
    if moneda_origen == moneda_destino:
        return redondear(monto)
    if moneda_origen == 'USD' and moneda_destino == 'VES':
        return redondear(monto * tasa)
    if moneda_origen == 'VES' and moneda_destino == 'USD':
        return redondear(monto / tasa)
    raise ValueError('Solo se admiten las monedas USD y VES.')


def tasa_para_fecha(fecha):
    """Retorna la última tasa BCV de la fecha o, si falta, la última anterior."""
    tasa = TasaCambio.objects.filter(fecha__date=fecha).order_by('-fecha').first()
    if tasa is None:
        tasa = TasaCambio.objects.filter(fecha__date__lt=fecha).order_by('-fecha').first()
    if tasa is None:
        raise TasaCambio.DoesNotExist('No existe una tasa BCV para la fecha indicada ni una anterior.')
    return tasa
