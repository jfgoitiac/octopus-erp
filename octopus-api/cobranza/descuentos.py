"""
Fuente de verdad ÚNICA para decidir si una Mensualidad impaga tiene descuento
por pago dentro de rango, y de cuánto — simétrico a cobranza/recargos.py, con
la regla tipo='descuento' de ReglaRecargoPago (dia_desde/dia_hasta en vez de
dia_aplicacion).

Diferencia estructural clave con el recargo: el recargo es dinero EXTRA
cobrado en la misma operación (nunca toca Mensualidad.monto_usd/monto_pagado,
solo se registra en LineaRecargoPago para el desglose del recibo). El
descuento en cambio debe CERRAR la mensualidad aunque el representante pague
menos de monto_usd, así que RegistrarPagoView acredita el monto_descontado_usd
retornado acá como un "abono fantasma" adicional a monto_pagado (ver
LineaDescuentoPago) — Mensualidad.monto_usd nunca se modifica, por lo que
mora.py/solvencia_reportes.py/serializers.py siguen funcionando sin cambios.
"""
import calendar
from datetime import date, datetime
from decimal import ROUND_HALF_UP, Decimal

from .models import ReglaRecargoPago


def _regla_descuento_activa(cache=None):
    """
    Única regla activa de tipo='descuento' (configuración global, sin
    variación por sede). `cache` (dict opcional, compartido entre llamadas)
    evita repetir la query — usa la clave fija `'_regla_descuento'`, distinta
    de la que usa recargos.py::_regla_activa para no pisarla si se comparte
    el mismo dict entre ambas resoluciones (ver RegistrarPagoView).
    """
    if cache is not None and '_regla_descuento' in cache:
        return cache['_regla_descuento']

    regla = ReglaRecargoPago.objects.filter(activa=True, tipo='descuento').first()

    if cache is not None:
        cache['_regla_descuento'] = regla
    return regla


def resolver_descuento(mensualidad, fecha_referencia, _cache_reglas=None):
    """
    Decide si `mensualidad` (impaga) tiene descuento evaluado en
    `fecha_referencia` (date o datetime), y de cuánto.

    Retorna {'nombre': str, 'monto_final_usd': Decimal, 'monto_descontado_usd': Decimal}
    si aplica, o None.

    No aplica si:
      - No hay regla de descuento activa.
      - mensualidad.monto_personalizado es True (ya es un precio manual, no
        se combina con esta regla global).
      - `fecha_referencia` cae fuera de [dia_desde, dia_hasta] del MES PROPIO
        de la mensualidad (mismo criterio que recargo: no importa si se paga
        adelantado o atrasado, el rango es siempre el de mensualidad.mes/anio).
      - El monto final de la regla (`valor`) es mayor o igual al monto_usd
        actual de la mensualidad (que ya trae la beca aplicada) — nunca debe
        subirle el precio a una mensualidad ya becada o más barata.

    `_cache_reglas` es un detalle interno para uso bulk (dict compartido);
    los callers normales lo dejan en None.
    """
    if mensualidad.monto_personalizado:
        return None

    regla = _regla_descuento_activa(cache=_cache_reglas)
    if regla is None:
        return None

    fecha_cmp = fecha_referencia.date() if isinstance(fecha_referencia, datetime) else fecha_referencia

    # Mismo patrón de tope que recargos.py/mora.py: evita ValueError en
    # meses cortos (ej. dia_hasta=31 en febrero).
    ultimo_dia_mes = calendar.monthrange(mensualidad.anio, mensualidad.mes)[1]
    dia_desde = min(regla.dia_desde, ultimo_dia_mes)
    dia_hasta = min(regla.dia_hasta, ultimo_dia_mes)
    fecha_desde = date(mensualidad.anio, mensualidad.mes, dia_desde)
    fecha_hasta = date(mensualidad.anio, mensualidad.mes, dia_hasta)

    if not (fecha_desde <= fecha_cmp <= fecha_hasta):
        return None

    monto_final = regla.valor
    if monto_final >= mensualidad.monto_usd:
        return None

    monto_descontado = (mensualidad.monto_usd - monto_final).quantize(
        Decimal('0.01'), rounding=ROUND_HALF_UP
    )

    return {
        'nombre': regla.nombre,
        'monto_final_usd': monto_final,
        'monto_descontado_usd': monto_descontado,
    }
