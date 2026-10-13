"""
Proyección de caja de la semana (PLAN_COBRANZA_INTELIGENTE_V4.md §1.7, fase D).

Qué se espera cobrar entre el lunes y el domingo de la semana de `hoy`, a partir de
lo que las familias YA se comprometieron a pagar: las cuotas pendientes de las
promesas de pago (`tipo=promesa`) y de los convenios (`tipo=convenio`) VIGENTES con
fecha dentro de la semana. Cada cuota se pondera con la probabilidad de que se
cumpla según el perfil de pagador del representante (cobranza/perfil_pagador.py):

  - Probabilidad HISTÓRICA: proporción de cuotas con fecha ya vencida (de convenios no
    cancelados) que sí se pagaron, entre representantes del mismo perfil de hoy. Se usa
    solo si hay al menos MUESTRA_MINIMA cuotas de ese perfil.
  - Si no hay muestra suficiente, la probabilidad por defecto (PROBABILIDAD_POR_DEFECTO).

No incluye mensualidades que vencen esta semana ni cuotas atrasadas de semanas
anteriores (esas son tarjetas `promesa_vencida` en Hoy). Los montos son USD.
"""
from collections import defaultdict
from datetime import date, timedelta
from decimal import Decimal

from . import perfil_pagador
from .dashboard import q_sedes
from .models import ConvenioPago, CuotaConvenio

MUESTRA_MINIMA = 10
PROBABILIDAD_POR_DEFECTO = {
    perfil_pagador.PUNTUAL: Decimal('0.95'),
    perfil_pagador.PAGA_TARDE: Decimal('0.75'),
    perfil_pagador.MOROSO_NUEVO: Decimal('0.55'),
    perfil_pagador.CRONICO: Decimal('0.25'),
    perfil_pagador.SIN_HISTORIAL: Decimal('0.60'),
}
CENT = Decimal('0.01')


def semana_de(fecha):
    """(lunes, domingo) de la semana de `fecha`."""
    lunes = fecha - timedelta(days=fecha.weekday())
    return lunes, lunes + timedelta(days=6)


def _cuotas(sedes, **filtros):
    return (
        CuotaConvenio.objects.filter(
            convenio__id__in=ConvenioPago.objects.filter(q_sedes(sedes, 'ciclos__mensualidad__alumno__'))
            .values('id'), **filtros)
        .select_related('convenio__representante')
    )


def _probabilidades(sedes, perfil_por_rep, hoy):
    """{perfil: {valor, fuente, muestra}} con la tasa histórica o la de por defecto."""
    totales, pagadas = defaultdict(int), defaultdict(int)
    historicas = _cuotas(sedes, fecha__lt=hoy).exclude(convenio__estado=ConvenioPago.CANCELADO)
    reps = {c.convenio.representante_id for c in historicas}
    perfiles = perfil_pagador.perfiles_de(reps - set(perfil_por_rep), hoy)
    perfiles.update({r: p for r, p in perfil_por_rep.items() if r in reps})
    for c in historicas:
        perfil = perfiles[c.convenio.representante_id]
        totales[perfil] += 1
        pagadas[perfil] += 1 if c.pagada else 0
    salida = {}
    for perfil in perfil_pagador.PERFILES:
        n = totales[perfil]
        if n >= MUESTRA_MINIMA:
            salida[perfil] = {'valor': (Decimal(pagadas[perfil]) / n).quantize(CENT),
                              'fuente': 'historica', 'muestra': n}
        else:
            salida[perfil] = {'valor': PROBABILIDAD_POR_DEFECTO[perfil],
                              'fuente': 'por_defecto', 'muestra': n}
    return salida


def calcular_proyeccion(sedes, hoy=None, fecha=None):
    """Proyección de la semana de `fecha` (por defecto la de `hoy`)."""
    hoy = hoy or date.today()
    desde, hasta = semana_de(fecha or hoy)
    cuotas = list(_cuotas(sedes, pagada=False, fecha__gte=desde, fecha__lte=hasta,
                          convenio__estado=ConvenioPago.VIGENTE).order_by('fecha', 'id'))
    reps = {c.convenio.representante_id for c in cuotas}
    perfil_por_rep = perfil_pagador.perfiles_de(reps, hoy)
    prob = _probabilidades(sedes, perfil_por_rep, hoy)

    def vacio():
        return {'casos': 0, 'comprometido_usd': Decimal('0.00'), 'esperado_usd': Decimal('0.00')}

    por_fuente = {'promesas': vacio(), 'convenios': vacio()}
    por_perfil = {p: vacio() for p in perfil_pagador.PERFILES}
    por_dia = {desde + timedelta(days=i): vacio() for i in range(7)}
    detalle = []
    for c in cuotas:
        rep = c.convenio.representante
        perfil = perfil_por_rep[rep.id]
        esperado = (c.monto_usd * prob[perfil]['valor']).quantize(CENT)
        fuente = 'promesas' if c.convenio.tipo == ConvenioPago.TIPO_PROMESA else 'convenios'
        for bolsa in (por_fuente[fuente], por_perfil[perfil], por_dia[c.fecha]):
            bolsa['casos'] += 1
            bolsa['comprometido_usd'] += c.monto_usd
            bolsa['esperado_usd'] += esperado
        detalle.append({
            'cuota': c.id, 'convenio': c.convenio_id, 'tipo': c.convenio.tipo, 'numero': c.numero,
            'fecha': c.fecha, 'monto_usd': str(c.monto_usd),
            'representante': {'id': rep.id, 'nombre': f'{rep.nombre} {rep.apellido}', 'cedula': rep.cedula},
            'perfil_pagador': perfil_pagador.descriptor(perfil),
            'probabilidad': str(prob[perfil]['valor']), 'esperado_usd': str(esperado),
        })

    def fmt(b):
        return {'casos': b['casos'], 'comprometido_usd': str(b['comprometido_usd']),
                'esperado_usd': str(b['esperado_usd'])}

    return {
        'semana': {'desde': desde, 'hasta': hasta},
        'casos': len(cuotas),
        'comprometido_usd': str(sum((c.monto_usd for c in cuotas), Decimal('0.00'))),
        'esperado_usd': str(sum((b['esperado_usd'] for b in por_fuente.values()), Decimal('0.00'))),
        'por_fuente': {k: fmt(v) for k, v in por_fuente.items()},
        'por_perfil': {k: {**fmt(v), 'etiqueta': perfil_pagador.ETIQUETAS[k],
                           'probabilidad': {'valor': str(prob[k]['valor']), 'fuente': prob[k]['fuente'],
                                            'muestra': prob[k]['muestra']}}
                       for k, v in por_perfil.items()},
        'por_dia': [{'fecha': d, **fmt(v)} for d, v in por_dia.items()],
        'detalle': detalle,
        'regla': 'Cuotas pendientes de promesas y convenios vigentes con fecha en la semana, '
                 'ponderadas por la probabilidad de cumplimiento del perfil de pagador.',
    }


def resumen_proyeccion(sedes, hoy):
    """Versión compacta para la pestaña Hoy."""
    p = calcular_proyeccion(sedes, hoy)
    return {k: p[k] for k in ('semana', 'casos', 'comprometido_usd', 'esperado_usd', 'por_fuente')}
