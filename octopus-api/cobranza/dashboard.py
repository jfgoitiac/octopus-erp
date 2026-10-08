"""
Dashboard del director de Cobranza Inteligente
(PLAN_COBRANZA_INTELIGENTE.md, Fase 4, semana 9).

Todas las cifras se calculan sobre las sedes con el módulo encendido a las
que el usuario tiene acceso (`sedes`: set de sede_id, None = sin sede).

Aproximaciones declaradas (ver NOTAS_TECNICAS.md):
  - "Cobrado al vencimiento" y "mora a N días" cuentan como cobrada una
    mensualidad solo cuando quedó PAGADA POR COMPLETO dentro del plazo; un
    abono parcial anterior al plazo no suma (Mensualidad no guarda la fecha de
    cada abono).
  - La regla de atribución es la del plan: un pago se atribuye a Cobranza
    Inteligente si llega dentro de los 7 días siguientes a un mensaje o una
    gestión registrada sobre esa deuda.
"""
from datetime import date, datetime, timedelta
from decimal import Decimal

from django.db.models import Count, Q, Sum
from django.utils import timezone

from .ciclos import calcular_fecha_vencimiento
from .gestion import calcular_bandeja, pagos_en_revision
from .models import (
    CicloCobranza, ConfiguracionCobranzaInteligente, EnvioCobranza, EventoCiclo,
    LineaBaseCobranza, Mensualidad,
)

DIAS_ATRIBUCION = 7
EVENTOS_DE_GESTION = ('mensaje_enviado', 'llamada_registrada', 'whatsapp_manual', 'nota', 'convenio_creado')
REGLA_ATRIBUCION = (
    f'Se atribuye a Cobranza Inteligente un pago que llega dentro de los {DIAS_ATRIBUCION} días '
    'siguientes a un mensaje o una gestión registrada sobre esa deuda.'
)


def q_sedes(sedes, prefijo):
    """Q sobre `<prefijo>sede` para un set de sede_id (None = sin sede)."""
    q = Q(**{f'{prefijo}sede_id__in': [s for s in sedes if s is not None]})
    if None in sedes:
        q |= Q(**{f'{prefijo}sede__isnull': True})
    return q


def _pct(parte, total):
    if not total:
        return None
    return round(float(parte) / float(total) * 100, 2)


def _meses_atras(hoy, n):
    """[(mes, anio)] del mes actual y los n-1 anteriores."""
    resultado, mes, anio = [], hoy.month, hoy.year
    for _ in range(n):
        resultado.append((mes, anio))
        mes -= 1
        if mes == 0:
            mes, anio = 12, anio - 1
    return resultado


def _efectividad(sedes, hoy):
    """Cobrado al vencimiento y mora a 7/15/30 días sobre los últimos 3 meses."""
    filtro = Q()
    for mes, anio in _meses_atras(hoy, 3):
        filtro |= Q(mes=mes, anio=anio)
    mensualidades = (
        Mensualidad.objects.filter(filtro, alumno__activo=True)
        .exclude(alumno__estatus_financiero='becado')
        .filter(q_sedes(sedes, 'alumno__'))
        .select_related('alumno')
    )
    # [facturado elegible, cobrado a tiempo]
    acum = {'venc': [Decimal(0), Decimal(0)], 7: [Decimal(0), Decimal(0)],
            15: [Decimal(0), Decimal(0)], 30: [Decimal(0), Decimal(0)]}
    for m in mensualidades:
        venc = calcular_fecha_vencimiento(m)
        pago = m.fecha_pago.date() if m.pagado and m.fecha_pago else None
        if venc <= hoy:
            acum['venc'][0] += m.monto_usd
            if pago and pago <= venc:
                acum['venc'][1] += m.monto_usd
        for n in (7, 15, 30):
            if venc + timedelta(days=n) <= hoy:
                acum[n][0] += m.monto_usd
                if pago and pago <= venc + timedelta(days=n):
                    acum[n][1] += m.monto_usd

    def mora(n):
        cobrado = _pct(acum[n][1], acum[n][0])
        return None if cobrado is None else round(100 - cobrado, 2)

    return {
        'cobrado_al_vencimiento_pct': _pct(acum['venc'][1], acum['venc'][0]),
        'mora_7_pct': mora(7), 'mora_15_pct': mora(15), 'mora_30_pct': mora(30),
        'base_meses': 3,
    }


def _linea_base(sedes):
    """Línea base de la primera sede que la tenga (o la global)."""
    for sede_id in list(sedes) + [None]:
        lb = LineaBaseCobranza.objects.filter(sede_id=sede_id).first()
        if lb:
            return lb
    return None


def _num(valor):
    return None if valor is None else float(valor)


def _comparacion(efectividad, lb):
    if not lb:
        return None

    def delta(actual, base):
        return None if actual is None or base is None else round(float(actual) - float(base), 2)

    return {
        'linea_base': {
            'cobrado_al_vencimiento_pct': _num(lb.cobrado_al_vencimiento_pct),
            'mora_7_pct': _num(lb.mora_7_pct), 'mora_15_pct': _num(lb.mora_15_pct),
            'mora_30_pct': _num(lb.mora_30_pct),
            'horas_semanales_cobranza': _num(lb.horas_semanales_cobranza),
            'periodo_desde': lb.periodo_desde, 'periodo_hasta': lb.periodo_hasta,
        },
        # puntos porcentuales: positivo en cobrado = mejora; negativo en mora = mejora
        'delta_cobrado_al_vencimiento_pp': delta(efectividad['cobrado_al_vencimiento_pct'], lb.cobrado_al_vencimiento_pct),
        'delta_mora_7_pp': delta(efectividad['mora_7_pct'], lb.mora_7_pct),
        'delta_mora_15_pp': delta(efectividad['mora_15_pct'], lb.mora_15_pct),
        'delta_mora_30_pp': delta(efectividad['mora_30_pct'], lb.mora_30_pct),
    }


def _recuperado(sedes, hoy):
    """Pagos que cerraron un ciclo en el mes y cuánto de eso se atribuye a la gestión."""
    inicio = timezone.make_aware(datetime(hoy.year, hoy.month, 1))
    cerrados = list(
        CicloCobranza.objects.filter(
            q_sedes(sedes, 'mensualidad__alumno__'), estado=CicloCobranza.CERRADA,
            motivo_cierre='pagada', cerrado_en__gte=inicio)
        .select_related('mensualidad'))
    total = sum((c.mensualidad.monto_usd for c in cerrados), Decimal('0.00'))
    atribuido, casos = Decimal('0.00'), 0
    for c in cerrados:
        desde = c.cerrado_en - timedelta(days=DIAS_ATRIBUCION)
        if EventoCiclo.objects.filter(
                ciclo=c, tipo__in=EVENTOS_DE_GESTION, creado_en__gte=desde, creado_en__lte=c.cerrado_en).exists():
            atribuido += c.mensualidad.monto_usd
            casos += 1
    return {
        'total_recuperado_usd': str(total),
        'atribuido_usd': str(atribuido),
        'casos_atribuidos': casos,
        'casos_totales': len(cerrados),
        'regla': REGLA_ATRIBUCION,
    }


def _modulo(sedes):
    filas = []
    for cfg in ConfiguracionCobranzaInteligente.objects.all():
        if cfg.sede_id not in sedes:
            continue
        ultimo = EventoCiclo.objects.filter(
            sede_id=cfg.sede_id, tipo__in=('modulo_encendido', 'modulo_apagado')
        ).order_by('-creado_en').first()
        filas.append({
            'sede': cfg.sede_id, 'activo': cfg.activo, 'modo_sombra': cfg.modo_sombra,
            'etapas_envio_activas': cfg.etapas_envio_activas,
            'ultimo_cambio': ultimo.creado_en if ultimo else None,
            'ultimo_cambio_tipo': ultimo.tipo if ultimo else None,
        })
    return filas


def calcular_dashboard(sedes, hoy=None, ahora=None):
    hoy = hoy or date.today()
    ahora = ahora or timezone.now()
    ciclos = CicloCobranza.objects.filter(q_sedes(sedes, 'mensualidad__alumno__'))
    abiertos = ciclos.filter(estado__in=CicloCobranza.ESTADOS_ABIERTOS).select_related('mensualidad')

    mes = (
        Mensualidad.objects.filter(mes=hoy.month, anio=hoy.year, alumno__activo=True)
        .exclude(alumno__estatus_financiero='becado').filter(q_sedes(sedes, 'alumno__'))
    )
    agregados = mes.aggregate(facturado=Sum('monto_usd'), cobrado=Sum('monto_pagado'))
    facturado = agregados['facturado'] or Decimal('0.00')
    cobrado = agregados['cobrado'] or Decimal('0.00')

    distribucion = {e: {'casos': 0, 'saldo_usd': Decimal('0.00')}
                    for e in (*CicloCobranza.ETAPAS_CALCULADAS, CicloCobranza.PAUSADA)}
    for c in abiertos:
        d = distribucion[c.estado]
        d['casos'] += 1
        d['saldo_usd'] += c.mensualidad.monto_usd - c.mensualidad.monto_pagado

    cambios = {}
    for detalle in EventoCiclo.objects.filter(
            ciclo__in=ciclos, tipo='cambio_etapa', creado_en__gte=ahora - timedelta(days=7)
    ).values_list('detalle', flat=True):
        cambios[detalle.get('a')] = cambios.get(detalle.get('a'), 0) + 1

    bandeja = calcular_bandeja(ciclos, hoy, ahora)
    efectividad = _efectividad(sedes, hoy)
    envios = (
        EnvioCobranza.objects.filter(creado_en__gte=ahora - timedelta(days=7))
        .filter(q_sedes(sedes, 'regla__')).values('estado').annotate(n=Count('id'))
    )
    return {
        'fecha': hoy,
        'cartera_mes': {
            'facturado_usd': str(facturado), 'cobrado_usd': str(cobrado),
            'pendiente_usd': str(facturado - cobrado), 'cobrado_pct': _pct(cobrado, facturado),
        },
        'efectividad': efectividad,
        'comparacion_linea_base': _comparacion(efectividad, _linea_base(sedes)),
        'distribucion_por_etapa': {
            k: {'casos': v['casos'], 'saldo_usd': str(v['saldo_usd'])} for k, v in distribucion.items()},
        'cambios_de_etapa_7_dias': cambios,
        'bandeja': {
            'casos_abiertos': len(bandeja),
            'antiguedad_max_dias': max((f['dias_mora_max'] for f in bandeja), default=0),
            'casos_mas_de_15_dias': sum(1 for f in bandeja if f['dias_mora_max'] > 15),
        },
        'pagos_por_conciliar': len(pagos_en_revision(sedes, ahora)),
        'envios_7_dias': {e['estado']: e['n'] for e in envios},
        'recuperado': _recuperado(sedes, hoy),
        'modulo': _modulo(sedes),
    }
