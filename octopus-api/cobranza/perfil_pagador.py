"""
Perfil de pagador (PLAN_COBRANZA_INTELIGENTE_V4.md §1.7, fase D).

Clasifica a un representante según sus últimos 6 meses de mensualidades YA
VENCIDAS (alumnos activos, sin becados). Es solo por reglas, sin IA, y se calcula
al vuelo (no se guarda): siempre refleja la realidad de `hoy`.

Para cada mensualidad vencida en la ventana:
  - pagada: días de atraso = fecha de pago - vencimiento (mínimo 0).
  - impaga: cuenta como atrasada solo si ya pasaron más de DIAS_GRACIA días desde
    el vencimiento (una impaga reciente todavía no define a nadie y se ignora).
  - "tarde" = pagó con más de DIAS_GRACIA días de atraso.

Perfiles (se evalúan en este orden):
  sin_historial  ninguna mensualidad vencida evaluable en la ventana.
  cronico        3 o más impagas atrasadas, o (4+ evaluables y la mitad o más impagas).
  moroso_nuevo   1 o 2 impagas atrasadas.
  paga_tarde     sin impagas atrasadas y 2 o más pagadas tarde, o 1/3 o más de las
                 evaluables pagadas tarde.
  puntual        todo lo demás.

Los umbrales son constantes de módulo, ajustables con el colegio piloto.
"""
import calendar
from datetime import date, datetime

from django.utils import timezone

from .ciclos import DIA_LIMITE_POR_DEFECTO
from .models import Mensualidad

VENTANA_MESES = 6
DIAS_GRACIA = 3
CRONICO_MIN_IMPAGAS = 3
CRONICO_MIN_EVALUABLES = 4
PAGA_TARDE_MIN_TARDES = 2

PUNTUAL = 'puntual'
PAGA_TARDE = 'paga_tarde'
MOROSO_NUEVO = 'moroso_nuevo'
CRONICO = 'cronico'
SIN_HISTORIAL = 'sin_historial'

ETIQUETAS = {
    PUNTUAL: 'Puntual',
    PAGA_TARDE: 'Paga tarde pero paga',
    MOROSO_NUEVO: 'Moroso nuevo',
    CRONICO: 'Crónico',
    SIN_HISTORIAL: 'Sin historial',
}
PERFILES = tuple(ETIQUETAS)


def _restar_meses(d, n):
    indice = d.year * 12 + (d.month - 1) - n
    anio, mes = divmod(indice, 12)
    return date(anio, mes + 1, min(d.day, calendar.monthrange(anio, mes + 1)[1]))


def _vencimiento(m):
    """Mismo criterio de cobranza/ciclos.calcular_fecha_vencimiento, sin tocar la BD de nuevo."""
    dia = m.alumno.dia_limite_pago or DIA_LIMITE_POR_DEFECTO
    return date(m.anio, m.mes, min(dia, calendar.monthrange(m.anio, m.mes)[1]))


def _fecha_pago(m):
    f = m.fecha_pago
    if f is None:
        return None
    if isinstance(f, datetime):
        return (timezone.localtime(f) if timezone.is_aware(f) else f).date()
    return f


def _fila(m, hoy):
    """Dict de una mensualidad evaluable o None si todavía no define nada."""
    venc = _vencimiento(m)
    if venc >= hoy:
        return None
    if m.pagado:
        pago = _fecha_pago(m)
        dias = max((pago - venc).days, 0) if pago else 0
        return {'mensualidad': m.id, 'periodo': f'{m.mes:02d}/{m.anio}', 'vencimiento': venc,
                'pagada': True, 'dias_atraso': dias, 'tarde': dias > DIAS_GRACIA}
    dias = (hoy - venc).days
    if dias <= DIAS_GRACIA:
        return None
    return {'mensualidad': m.id, 'periodo': f'{m.mes:02d}/{m.anio}', 'vencimiento': venc,
            'pagada': False, 'dias_atraso': dias, 'tarde': True}


def clasificar(filas):
    impagas = sum(1 for f in filas if not f['pagada'])
    tardes = sum(1 for f in filas if f['pagada'] and f['tarde'])
    n = len(filas)
    if n == 0:
        return SIN_HISTORIAL
    if impagas >= CRONICO_MIN_IMPAGAS or (n >= CRONICO_MIN_EVALUABLES and impagas * 2 >= n):
        return CRONICO
    if impagas >= 1:
        return MOROSO_NUEVO
    if tardes >= PAGA_TARDE_MIN_TARDES or tardes * 3 >= n:
        return PAGA_TARDE
    return PUNTUAL


def _mensualidades(representante_ids, hoy):
    desde = _restar_meses(hoy.replace(day=1), VENTANA_MESES)
    return (
        Mensualidad.objects.filter(alumno__representante_id__in=representante_ids, alumno__activo=True)
        .exclude(alumno__estatus_financiero='becado')
        .filter(anio__gte=desde.year)
        .select_related('alumno')
        .exclude(anio=desde.year, mes__lt=desde.month)
    )


def filas_de(representante_ids, hoy=None):
    """{representante_id: [fila]} con las mensualidades evaluables de la ventana."""
    hoy = hoy or date.today()
    ids = list(representante_ids)
    resultado = {i: [] for i in ids}
    if not ids:
        return resultado
    for m in _mensualidades(ids, hoy):
        fila = _fila(m, hoy)
        if fila:
            resultado[m.alumno.representante_id].append(fila)
    for filas in resultado.values():
        filas.sort(key=lambda f: f['vencimiento'])
    return resultado


def perfiles_de(representante_ids, hoy=None):
    """{representante_id: perfil}. Una sola consulta para todos."""
    return {rid: clasificar(filas) for rid, filas in filas_de(representante_ids, hoy).items()}


def perfil_de(representante_id, hoy=None):
    return perfiles_de([representante_id], hoy)[representante_id]


def detalle_de(representante_id, hoy=None):
    """Perfil + las mensualidades que lo explican (para la ficha)."""
    hoy = hoy or date.today()
    filas = filas_de([representante_id], hoy)[representante_id]
    perfil = clasificar(filas)
    return {
        'perfil': perfil,
        'etiqueta': ETIQUETAS[perfil],
        'ventana_meses': VENTANA_MESES,
        'dias_gracia': DIAS_GRACIA,
        'evaluadas': len(filas),
        'impagas_atrasadas': sum(1 for f in filas if not f['pagada']),
        'pagadas_tarde': sum(1 for f in filas if f['pagada'] and f['tarde']),
        'pagadas_a_tiempo': sum(1 for f in filas if f['pagada'] and not f['tarde']),
        'meses': filas,
    }


def descriptor(perfil):
    """Forma compacta para listas: {codigo, etiqueta}."""
    return {'codigo': perfil, 'etiqueta': ETIQUETAS[perfil]}
