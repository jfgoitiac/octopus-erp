"""Cálculo canónico de recargos temporales de mensualidades."""
import calendar
from collections import defaultdict
from datetime import date, datetime, timedelta
from decimal import ROUND_HALF_UP, Decimal

from django.db.models import Q, Sum

from .models import LineaRecargoPago, Mensualidad, ReglaRecargoPago


def _regla_activa(cache=None):
    if cache is not None and '_regla' in cache:
        return cache['_regla']
    regla = ReglaRecargoPago.objects.filter(activa=True, tipo='recargo').first()
    if cache is not None:
        cache['_regla'] = regla
    return regla


def fecha_vencimiento(mensualidad):
    """Fecha inmutable de la cuota, con fallback para datos anteriores."""
    if mensualidad.fecha_vencimiento:
        return mensualidad.fecha_vencimiento
    dia_limite = getattr(mensualidad.alumno, 'dia_limite_pago', None) or 5
    dia = min(dia_limite, calendar.monthrange(mensualidad.anio, mensualidad.mes)[1])
    return date(mensualidad.anio, mensualidad.mes, dia)


def _monto_cobrado(mensualidad, lineas_cobradas=None):
    if lineas_cobradas is None:
        lineas_cobradas = getattr(mensualidad, '_prefetched_objects_cache', {}).get('lineas_recargo')
    if lineas_cobradas is not None:
        return sum((linea.monto_usd for linea in lineas_cobradas), Decimal('0.00'))
    return LineaRecargoPago.objects.filter(mensualidad_id=mensualidad.id).aggregate(total=Sum('monto_usd'))['total'] or Decimal('0.00')


def _importe_unitario(mensualidad, regla):
    if regla.modo_calculo == 'monto_fijo_usd':
        return regla.valor
    return (mensualidad.monto_usd * regla.valor / Decimal('100')).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)


def _programacion(regla, mensualidad, fecha_cmp):
    if regla.ancla_recargo == 'vencimiento':
        primera = fecha_vencimiento(mensualidad) + timedelta(days=regla.dias_desde_vencimiento or 0)
        if fecha_cmp < primera:
            return 0, primera
        if regla.frecuencia_recargo == 'recurrente':
            return ((fecha_cmp - primera).days // regla.cada_dias) + 1, primera
        return 1, primera
    dia = min(regla.dia_aplicacion, calendar.monthrange(mensualidad.anio, mensualidad.mes)[1])
    primera = date(mensualidad.anio, mensualidad.mes, dia)
    return (1 if fecha_cmp >= primera else 0), primera


def resolver_recargo(mensualidad, fecha_referencia, _cache_reglas=None, *, lineas_cobradas=None):
    """Cotiza el saldo de recargo pendiente para una mensualidad impaga."""
    if mensualidad.pagado:
        return None
    regla = _regla_activa(cache=_cache_reglas)
    if regla is None:
        return None
    fecha_cmp = fecha_referencia.date() if isinstance(fecha_referencia, datetime) else fecha_referencia
    periodos, primera_fecha = _programacion(regla, mensualidad, fecha_cmp)
    if not periodos:
        return None
    monto_unitario = _importe_unitario(mensualidad, regla)
    monto_devengado = (monto_unitario * periodos).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
    monto_cobrado = _monto_cobrado(mensualidad, lineas_cobradas)
    monto_pendiente = max(monto_devengado - monto_cobrado, Decimal('0.00'))
    if not monto_pendiente:
        return None
    periodos_cobrados = int(monto_cobrado / monto_unitario) if monto_unitario > 0 else 0
    return {
        'nombre': regla.nombre, 'monto_usd': monto_pendiente,
        'monto_unitario_usd': monto_unitario, 'monto_devengado_usd': monto_devengado,
        'monto_cobrado_usd': monto_cobrado, 'periodos_devengados': periodos,
        'periodos_cobrados': min(periodos_cobrados, periodos),
        'fecha_primera_aplicacion': primera_fecha,
        'recurrente': regla.frecuencia_recargo == 'recurrente',
    }


def calcular_recargos_para_alumnos(alumno_ids, hoy):
    """Totales pendientes por alumno sin consultas por cada mensualidad."""
    alumno_ids = list(alumno_ids)
    totales = defaultdict(lambda: Decimal('0.00'))
    if not alumno_ids:
        return dict(totales)
    overdue_q = Q(anio__lt=hoy.year) | Q(anio=hoy.year, mes__lte=hoy.month)
    mensualidades = (Mensualidad.objects.filter(alumno_id__in=alumno_ids, pagado=False)
                     .filter(overdue_q).select_related('alumno').prefetch_related('lineas_recargo'))
    cache_reglas = {}
    for m in mensualidades:
        resultado = resolver_recargo(m, hoy, _cache_reglas=cache_reglas)
        if resultado:
            totales[m.alumno_id] += resultado['monto_usd']
    return dict(totales)
