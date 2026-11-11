"""Cálculo canónico de recargos temporales de mensualidades."""
import calendar
from collections import defaultdict
from datetime import date, datetime, timedelta
from decimal import ROUND_HALF_UP, Decimal

from django.db.models import Q, Sum
from django.utils import timezone

from .models import (
    IntervaloExoneracionRecargoConvenio, LineaRecargoPago, Mensualidad,
    ReglaRecargoPago,
)


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


def _fecha_local(valor):
    if isinstance(valor, datetime):
        if timezone.is_aware(valor):
            return timezone.localtime(valor).date()
        return valor.date()
    return valor


def precargar_contexto_recargos(mensualidades, cache=None):
    """Carga regla e intervalos de convenio para una colección sin N+1."""
    cache = cache if cache is not None else {}
    mensualidades = list(mensualidades)
    _regla_activa(cache)
    ids = [m.id for m in mensualidades if m.id]
    mapa = {mensualidad_id: [] for mensualidad_id in ids}
    if ids:
        filas = IntervaloExoneracionRecargoConvenio.objects.filter(
            convenio__exonera_recargos_durante_vigencia=True,
            convenio__ciclos__mensualidad_id__in=ids,
        ).values(
            'convenio__ciclos__mensualidad_id', 'iniciado_en', 'finalizado_en',
        ).distinct()
        for fila in filas:
            mensualidad_id = fila['convenio__ciclos__mensualidad_id']
            mapa.setdefault(mensualidad_id, []).append((
                _fecha_local(fila['iniciado_en']),
                _fecha_local(fila['finalizado_en']) if fila['finalizado_en'] else None,
            ))
    cache['_intervalos_exoneracion'] = mapa
    return cache


def _intervalos_exoneracion(mensualidad, cache=None):
    mapa = cache.get('_intervalos_exoneracion') if cache is not None else None
    if mapa is not None and mensualidad.id in mapa:
        return mapa[mensualidad.id]
    filas = IntervaloExoneracionRecargoConvenio.objects.filter(
        convenio__exonera_recargos_durante_vigencia=True,
        convenio__ciclos__mensualidad_id=mensualidad.id,
    ).values_list('iniciado_en', 'finalizado_en').distinct()
    intervalos = [
        (_fecha_local(inicio), _fecha_local(fin) if fin else None)
        for inicio, fin in filas
    ]
    if cache is not None:
        cache.setdefault('_intervalos_exoneracion', {})[mensualidad.id] = intervalos
    return intervalos


def _esta_en_intervalo(fecha, intervalo):
    inicio, fin = intervalo
    return inicio <= fecha and (fin is None or fecha <= fin)


def _programacion(regla, mensualidad, fecha_cmp, intervalos=()):
    if regla.ancla_recargo == 'vencimiento':
        calculada = fecha_vencimiento(mensualidad) + timedelta(days=regla.dias_desde_vencimiento or 0)
        primera = max(calculada, regla.vigente_desde)
        if fecha_cmp < primera:
            return 0, primera, 0
        if regla.frecuencia_recargo == 'recurrente':
            programados = ((fecha_cmp - primera).days // regla.cada_dias) + 1
            exonerados = sum(
                1 for indice in range(programados)
                if any(_esta_en_intervalo(
                    primera + timedelta(days=indice * regla.cada_dias), intervalo,
                ) for intervalo in intervalos)
            )
            return programados - exonerados, primera, exonerados
        exonerado = any(_esta_en_intervalo(primera, intervalo) for intervalo in intervalos)
        return (0 if exonerado else 1), primera, (1 if exonerado else 0)
    dia = min(regla.dia_aplicacion, calendar.monthrange(mensualidad.anio, mensualidad.mes)[1])
    calculada = date(mensualidad.anio, mensualidad.mes, dia)
    primera = max(calculada, regla.vigente_desde)
    exonerado = any(_esta_en_intervalo(primera, intervalo) for intervalo in intervalos)
    aplica = fecha_cmp >= primera and not exonerado
    return (1 if aplica else 0), primera, (1 if fecha_cmp >= primera and exonerado else 0)


def resolver_recargo(mensualidad, fecha_referencia, _cache_reglas=None, *, lineas_cobradas=None):
    """Cotiza el saldo de recargo pendiente para una mensualidad impaga."""
    if mensualidad.pagado:
        return None
    regla = _regla_activa(cache=_cache_reglas)
    if regla is None:
        return None
    fecha_cmp = _fecha_local(fecha_referencia)
    if (mensualidad.anio, mensualidad.mes) < (regla.vigente_desde.year, regla.vigente_desde.month):
        return None
    intervalos = _intervalos_exoneracion(mensualidad, _cache_reglas)
    # Mientras la referencia cae dentro de una vigencia exonerada, la
    # cotización completa se presenta sin recargo, incluso si existía un
    # período impago anterior al convenio.
    if any(_esta_en_intervalo(fecha_cmp, intervalo) for intervalo in intervalos):
        return None
    periodos, primera_fecha, periodos_exonerados = _programacion(
        regla, mensualidad, fecha_cmp, intervalos,
    )
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
        'periodos_exonerados': periodos_exonerados,
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
    mensualidades = list(mensualidades)
    cache_reglas = precargar_contexto_recargos(mensualidades)
    for m in mensualidades:
        resultado = resolver_recargo(m, hoy, _cache_reglas=cache_reglas)
        if resultado:
            totales[m.alumno_id] += resultado['monto_usd']
    return dict(totales)
