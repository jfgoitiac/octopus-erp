"""
Comparación A/B de plantillas de Meta (PLAN_COBRANZA_INTELIGENTE_V4.md §1.7, fase D).

Una regla con `plantilla_meta` y `plantilla_meta_b` reparte a los representantes entre
la variante A y la B (alterna por la paridad del id del representante; ver
motor.variante_para) y cada `EnvioCobranza` guarda su `variante`.

Medición "recuperado a 7 días": para cada envío ENVIADO, cuánto de su saldo se pagó en
los 7 días siguientes al envío = suma del saldo (al crear el envío) de los ciclos que se
cerraron por pago (`motivo_cierre='pagada'`) con `cerrado_en` entre `enviado_en` y
`enviado_en + 7 días`. Los pagos parciales no cuentan hasta que el ciclo cierra (criterio
conservador, igual que `dashboard._recuperado`).

Solo se miden los envíos MADUROS (ya pasaron los 7 días); el resto figura como `por_medir`.
No se declara ganadora hasta que ambas variantes tengan MUESTRA_MINIMA envíos maduros, y
la diferencia mínima es DIFERENCIA_MINIMA_PP puntos porcentuales; no hay prueba
estadística: es una lectura orientativa.
"""
from datetime import timedelta
from decimal import Decimal

from django.utils import timezone

from .dashboard import _pct, q_sedes
from .models import CicloCobranza, EnvioCobranza, ReglaCobranza

DIAS_MEDICION = 7
MUESTRA_MINIMA = 30
DIFERENCIA_MINIMA_PP = Decimal('2.0')
CENT = Decimal('0.01')


def _saldo_de(envio, ciclo):
    saldos = envio.detalle.get('saldos') or {}
    if str(ciclo.id) in saldos:
        return Decimal(saldos[str(ciclo.id)])
    if len(envio.detalle.get('ciclos', [])) == 1 and envio.detalle.get('saldo_total'):
        return Decimal(envio.detalle['saldo_total'])
    return ciclo.mensualidad.monto_usd   # envíos anteriores a la fase D: aproximación


def _medir(envio, ciclos_por_id):
    """(saldo_enviado, recuperado) de un envío maduro."""
    limite = envio.enviado_en + timedelta(days=DIAS_MEDICION)
    saldo = recuperado = Decimal('0.00')
    for cid in envio.detalle.get('ciclos', []):
        ciclo = ciclos_por_id.get(cid)
        if ciclo is None:
            continue
        monto = _saldo_de(envio, ciclo)
        saldo += monto
        if (ciclo.estado == CicloCobranza.CERRADA and ciclo.motivo_cierre == 'pagada'
                and ciclo.cerrado_en and envio.enviado_en <= ciclo.cerrado_en <= limite):
            recuperado += monto
    return saldo, recuperado


def _variante_vacia(plantilla):
    return {'plantilla': plantilla, 'enviados': 0, 'medidos': 0, 'por_medir': 0, 'pagaron': 0,
            'saldo_medido_usd': Decimal('0.00'), 'recuperado_usd': Decimal('0.00')}


def _formatear(v):
    return {
        'plantilla': v['plantilla'], 'enviados': v['enviados'], 'medidos': v['medidos'],
        'por_medir': v['por_medir'], 'pagaron': v['pagaron'],
        'tasa_pago_pct': _pct(v['pagaron'], v['medidos']),
        'saldo_medido_usd': str(v['saldo_medido_usd']),
        'recuperado_usd': str(v['recuperado_usd']),
        'recuperado_pct': _pct(v['recuperado_usd'], v['saldo_medido_usd']),
    }


def _veredicto(a, b):
    """('A'|'B'|'empate'|None, diferencia_pp) con las salvaguardas de muestra."""
    if a['medidos'] < MUESTRA_MINIMA or b['medidos'] < MUESTRA_MINIMA:
        return None, None
    pa, pb = Decimal(str(a['recuperado_pct'] or 0)), Decimal(str(b['recuperado_pct'] or 0))
    dif = (pa - pb).quantize(CENT)
    if abs(dif) < DIFERENCIA_MINIMA_PP:
        return 'empate', dif
    return ('A' if dif > 0 else 'B'), dif


def reporte_ab(sedes, ahora=None, regla_id=None, desde=None, hasta=None):
    """Una fila por regla con dos plantillas (o que tuvo envíos con variante)."""
    ahora = ahora or timezone.now()
    envios = (
        EnvioCobranza.objects.filter(q_sedes(sedes, 'regla__'), estado=EnvioCobranza.ENVIADO,
                                     enviado_en__isnull=False).exclude(variante='')
        .select_related('regla')
    )
    if regla_id:
        envios = envios.filter(regla_id=regla_id)
    if desde:
        envios = envios.filter(fecha__gte=desde)
    if hasta:
        envios = envios.filter(fecha__lte=hasta)
    envios = list(envios)

    reglas = ReglaCobranza.objects.filter(q_sedes(sedes, '')).exclude(plantilla_meta_b='')
    if regla_id:
        reglas = reglas.filter(pk=regla_id)
    por_regla = {r.id: r for r in reglas}
    for e in envios:
        por_regla.setdefault(e.regla_id, e.regla)

    ids_ciclos = {cid for e in envios for cid in e.detalle.get('ciclos', [])}
    ciclos = {c.id: c for c in CicloCobranza.objects.filter(id__in=ids_ciclos).select_related('mensualidad')}

    acumulado = {rid: {'A': _variante_vacia(r.plantilla_meta), 'B': _variante_vacia(r.plantilla_meta_b)}
                 for rid, r in por_regla.items()}
    for e in envios:
        v = acumulado[e.regla_id][e.variante]
        v['enviados'] += 1
        if e.enviado_en + timedelta(days=DIAS_MEDICION) > ahora:
            v['por_medir'] += 1
            continue
        saldo, recuperado = _medir(e, ciclos)
        v['medidos'] += 1
        v['saldo_medido_usd'] += saldo
        v['recuperado_usd'] += recuperado
        v['pagaron'] += 1 if recuperado > 0 else 0

    filas = []
    for rid, r in sorted(por_regla.items(), key=lambda x: x[1].dia_relativo):
        a, b = _formatear(acumulado[rid]['A']), _formatear(acumulado[rid]['B'])
        ganadora, dif = _veredicto(a, b)
        filas.append({
            'regla': {'id': r.id, 'nombre': r.nombre, 'dia_relativo': r.dia_relativo, 'sede': r.sede_id,
                      'ab_activo': bool(r.plantilla_meta and r.plantilla_meta_b)},
            'A': a, 'B': b,
            'muestra_suficiente': ganadora is not None,
            'ganadora': ganadora,
            'diferencia_recuperado_pp': None if dif is None else str(dif),
        })
    return {
        'dias_medicion': DIAS_MEDICION, 'muestra_minima': MUESTRA_MINIMA,
        'diferencia_minima_pp': str(DIFERENCIA_MINIMA_PP),
        'regla': 'Recuperado a 7 días = saldo de los ciclos cerrados por pago dentro de los 7 días '
                 'siguientes al envío, sobre el saldo enviado. Solo envíos con 7 días cumplidos.',
        'count': len(filas), 'results': filas,
    }
