"""
Fuente de verdad ÚNICA para decidir si una Mensualidad impaga carga recargo
por pago tardío, y de cuánto.

Independiente por diseño de cobranza/mora.py: `mora.py` decide si un alumno
está en MORA (usa Alumno.dia_limite_pago); este módulo decide si una
mensualidad concreta ya generó RECARGO (usa ReglaRecargoPago.dia_aplicacion,
propio de cada regla, sin relación con el día de mora). Un alumno puede
estar en mora sin tener aún recargo — ej. dia_limite_pago=5,
dia_aplicacion=19: moroso desde el día 6, con recargo recién desde el 19.

Solo el camino tipo='recargo' está implementado. tipo='descuento' existe
como campo en el modelo pero no tiene lógica aquí todavía (ver
NOTAS_TECNICAS.md).
"""
import calendar
from collections import defaultdict
from datetime import date, datetime
from decimal import ROUND_HALF_UP, Decimal

from django.db.models import Q

from .models import Mensualidad, ReglaRecargoPago


def _regla_activa(cache=None):
    """
    Única regla activa de tipo='recargo' (configuración global, sin
    variación por sede). `cache` (dict opcional, compartido entre llamadas)
    evita repetir la query dentro de una corrida bulk (ver
    calcular_recargos_para_alumnos) — usa la clave fija `'_regla'`.
    """
    if cache is not None and '_regla' in cache:
        return cache['_regla']

    regla = ReglaRecargoPago.objects.filter(activa=True, tipo='recargo').first()

    if cache is not None:
        cache['_regla'] = regla
    return regla


def resolver_recargo(mensualidad, fecha_referencia, _cache_reglas=None):
    """
    Decide si `mensualidad` (impaga) carga recargo evaluado en
    `fecha_referencia` (date o datetime), y de cuánto.

    Retorna {'nombre': str, 'monto_usd': Decimal} si aplica, o None.

    Consumida por: mora.py (vía calcular_recargos_para_alumnos), la
    cotización del portal (MensualidadSerializer), y RegistrarPagoView al
    cobrar (autoridad real — el frontend puede replicar esta lógica en JS
    solo para preview, sin round-trip).

    `_cache_reglas` es un detalle interno para uso bulk (dict compartido);
    los callers normales lo dejan en None.
    """
    regla = _regla_activa(cache=_cache_reglas)
    if regla is None:
        return None

    fecha_cmp = fecha_referencia.date() if isinstance(fecha_referencia, datetime) else fecha_referencia

    # Mismo patrón de tope que mora.py::calcular_dias_atraso (línea ~230):
    # evita ValueError en meses cortos (ej. dia_aplicacion=30 en febrero).
    dia = min(regla.dia_aplicacion, calendar.monthrange(mensualidad.anio, mensualidad.mes)[1])
    fecha_aplicacion = date(mensualidad.anio, mensualidad.mes, dia)

    if fecha_cmp < fecha_aplicacion:
        return None

    if regla.modo_calculo == 'monto_fijo_usd':
        monto = regla.valor
    else:  # 'porcentaje' — sobre monto_usd YA con beca aplicada, no el original.
        monto = (mensualidad.monto_usd * regla.valor / Decimal('100')).quantize(
            Decimal('0.01'), rounding=ROUND_HALF_UP
        )

    return {'nombre': regla.nombre, 'monto_usd': monto}


def calcular_recargos_para_alumnos(alumno_ids, hoy):
    """
    Versión bulk (sin N+1): dado un iterable de alumno_id, retorna
    {alumno_id: Decimal(total_recargo_de_sus_mensualidades_vencidas_impagas)}.

    Usa UNA query para las mensualidades impagas vencidas (meses anteriores,
    o el mes actual si ya alcanzó/pasó su fin — mismo universo "vencido"
    que cobranza/mora.py::annotate_mora_detalle, overdue_q) de esos alumnos,
    cachea la única regla activa (a lo sumo 1 query total, no por alumno) y
    resuelve cada mensualidad con resolver_recargo() en Python.
    """
    alumno_ids = list(alumno_ids)
    totales = defaultdict(lambda: Decimal('0.00'))
    if not alumno_ids:
        return dict(totales)

    overdue_q = Q(anio__lt=hoy.year) | Q(anio=hoy.year, mes__lte=hoy.month)
    mensualidades = Mensualidad.objects.filter(
        alumno_id__in=alumno_ids, pagado=False,
    ).filter(overdue_q)

    cache_reglas = {}
    for m in mensualidades:
        resultado = resolver_recargo(m, hoy, _cache_reglas=cache_reglas)
        if resultado:
            totales[m.alumno_id] += resultado['monto_usd']

    return dict(totales)
