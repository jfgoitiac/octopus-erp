"""Consultas de lectura para tablero, calendario y los ocho informes CxP."""
from collections import defaultdict
from datetime import date
from decimal import Decimal

from django.db.models import Sum
from django.utils import timezone
from cobranza.permissions import filtrar_por_sede

from .models import AplazamientoCxP, CuentaPorPagar, CuotaCuentaPagar, PagoCuentaPagar, PlantillaRecurrente

ZERO = Decimal('0.00')


def _fecha(valor, predeterminado):
    if not valor:
        return predeterminado
    return date.fromisoformat(str(valor)) if isinstance(valor, str) else valor


def _cuentas(sede=None, desde=None, hasta=None, incluir_cerradas=False, usuario=None):
    qs = CuentaPorPagar.objects.select_related('proveedor', 'categoria', 'sede').all()
    if usuario is not None:
        qs = filtrar_por_sede(usuario, qs)
    if not incluir_cerradas:
        qs = qs.exclude(estado='anulada')
    if sede:
        qs = qs.filter(sede_id=sede)
    if desde:
        qs = qs.filter(fecha_vencimiento__gte=_fecha(desde, timezone.localdate()))
    if hasta:
        qs = qs.filter(fecha_vencimiento__lte=_fecha(hasta, timezone.localdate()))
    return qs


def situacion(cuenta, hoy=None, ventana=7):
    hoy = hoy or timezone.localdate()
    if cuenta.estado == 'anulada': return 'anulada'
    dias = (cuenta.fecha_vencimiento - hoy).days
    if dias < 0: return 'vencida'
    if dias == 0: return 'vence_hoy'
    if dias <= ventana: return 'por_vencer'
    return 'al_dia'


def _montos(cuentas):
    totales = defaultdict(lambda: {'usd': ZERO, 'ves': ZERO, 'documental': ZERO, 'cantidad': 0})
    for cuenta in cuentas:
        clave = situacion(cuenta)
        saldo = cuenta.saldo if cuenta.estado != 'pagada' else ZERO
        if saldo <= 0: continue
        # Snapshots proporcionales, no tasas actuales.
        factor = saldo / cuenta.monto_documento if cuenta.monto_documento else ZERO
        dato = totales[clave]; dato['cantidad'] += 1; dato['documental'] += saldo
        dato['usd'] += cuenta.monto_usd * factor; dato['ves'] += cuenta.monto_ves * factor
    return {k: {m: str(v.quantize(Decimal('0.01'))) if m != 'cantidad' else v for m, v in d.items()} for k, d in totales.items()}


def _resumen(cuentas, saldo_proporcional=True):
    """Totales {cantidad, monto_usd, monto_ves} usando los snapshots de cada cuenta."""
    usd = ves = ZERO
    cantidad = 0
    for c in cuentas:
        factor = (c.saldo / c.monto_documento) if (saldo_proporcional and c.monto_documento) else Decimal('1')
        usd += c.monto_usd * factor; ves += c.monto_ves * factor; cantidad += 1
    return {'cantidad': cantidad, 'monto_usd': str(usd.quantize(Decimal('0.01'))), 'monto_ves': str(ves.quantize(Decimal('0.01')))}


def tablero(sede=None, desde=None, hasta=None, hoy=None, usuario=None):
    hoy = hoy or timezone.localdate()
    cuentas = list(_cuentas(sede, desde, hasta, usuario=usuario))
    abiertas = [c for c in cuentas if c.estado in ('pendiente', 'parcial')]
    dias = lambda c: (c.fecha_vencimiento - hoy).days
    # Pagos y aplazamientos del mes en curso, limitados a las mismas cuentas visibles.
    ids = [c.id for c in cuentas]
    pagos = PagoCuentaPagar.objects.filter(cuenta_id__in=ids, estado='valido', fecha_pago__year=hoy.year, fecha_pago__month=hoy.month)
    pagado_usd = sum((p.monto_usd for p in pagos), ZERO); pagado_ves = sum((p.monto_ves for p in pagos), ZERO)
    aplazadas_ids = set(AplazamientoCxP.objects.filter(cuenta_id__in=ids, creado_en__year=hoy.year, creado_en__month=hoy.month).values_list('cuenta_id', flat=True))
    aplazadas = AplazamientoCxP.objects.filter(cuenta_id__in=ids, creado_en__year=hoy.year, creado_en__month=hoy.month).count()
    # El aplazamiento no guarda importe: se reporta el saldo vigente de las cuentas aplazadas en el mes.
    monto_aplazado = _resumen([c for c in cuentas if c.id in aplazadas_ids], saldo_proporcional=True)
    semana = sorted((c for c in abiertas if dias(c) <= 7), key=lambda c: (c.fecha_vencimiento, c.id))
    return {
        'por_situacion': _montos(cuentas), 'total_cuentas': len(cuentas), 'fecha': str(hoy),
        'vencidas': _resumen([c for c in abiertas if dias(c) < 0]),
        'vence_hoy': _resumen([c for c in abiertas if dias(c) == 0]),
        'proximos_7_dias': _resumen([c for c in abiertas if 0 < dias(c) <= 7]),
        'proximos_30_dias': _resumen([c for c in abiertas if 0 < dias(c) <= 30]),
        'total_adeudado': _resumen(abiertas),
        'pagado_mes': {'cantidad': len(pagos), 'monto_usd': str(pagado_usd.quantize(Decimal('0.01'))), 'monto_ves': str(pagado_ves.quantize(Decimal('0.01')))},
        'aplazadas_mes': {'cantidad': aplazadas, 'monto_usd': monto_aplazado['monto_usd'], 'monto_ves': monto_aplazado['monto_ves']},
        'semana': [{'id': c.id, 'numero': c.numero, 'proveedor': c.proveedor_id, 'proveedor_nombre': str(c.proveedor),
                    'concepto': c.concepto, 'fecha_vencimiento': str(c.fecha_vencimiento), 'prioridad': c.prioridad,
                    'monto_usd': str(c.monto_usd), 'monto_ves': str(c.monto_ves)} for c in semana],
    }


def calendario(sede=None, desde=None, hasta=None, usuario=None):
    desde = _fecha(desde, timezone.localdate())
    hasta = _fecha(hasta, None) if hasta else None
    cuentas = _cuentas(sede, desde, hasta, usuario=usuario).exclude(estado__in=['pagada', 'anulada'])
    eventos = [{'tipo': 'cuenta', 'id': c.id, 'numero': c.numero, 'fecha': str(c.fecha_vencimiento), 'monto': str(c.saldo), 'moneda': c.moneda} for c in cuentas]
    cuotas = CuotaCuentaPagar.objects.select_related('cuenta').exclude(estado='anulada')
    if usuario is not None:
        cuotas = filtrar_por_sede(usuario, cuotas, 'cuenta__sede')
    if sede: cuotas = cuotas.filter(cuenta__sede_id=sede)
    if desde: cuotas = cuotas.filter(fecha_vencimiento__gte=desde)
    if hasta: cuotas = cuotas.filter(fecha_vencimiento__lte=hasta)
    eventos += [{'tipo': 'cuota', 'id': q.id, 'cuenta': q.cuenta_id, 'fecha': str(q.fecha_vencimiento), 'monto': str(q.monto-q.pagado), 'moneda': q.cuenta.moneda} for q in cuotas if q.monto > q.pagado]
    return sorted(eventos, key=lambda e: (e['fecha'], e['tipo']))


def proyeccion(sede=None, desde=None, hasta=None, usuario=None):
    filas = defaultdict(lambda: {'usd': ZERO, 'ves': ZERO})
    for c in _cuentas(sede, desde, hasta, usuario=usuario).exclude(estado__in=['pagada', 'anulada']):
        factor = c.saldo / c.monto_documento if c.monto_documento else ZERO
        filas[str(c.fecha_vencimiento)]['usd'] += c.monto_usd * factor
        filas[str(c.fecha_vencimiento)]['ves'] += c.monto_ves * factor
    # Las plantillas son estimaciones futuras: no se confunden con una deuda creada.
    plantillas = PlantillaRecurrente.objects.filter(activa=True)
    if usuario is not None:
        plantillas = filtrar_por_sede(usuario, plantillas)
    for p in plantillas:
        if sede and p.sede_id != int(sede): continue
        clave = str(_fecha(desde, timezone.localdate()))[:7]
        if p.moneda == 'USD': filas[clave]['usd'] += p.monto
        else: filas[clave]['ves'] += p.monto
    return [{'fecha': fecha, 'usd': str(v['usd'].quantize(Decimal('0.01'))), 'ves': str(v['ves'].quantize(Decimal('0.01')))} for fecha, v in sorted(filas.items())]


def estado_proveedor(proveedor_id, sede=None, hoy=None, usuario=None):
    qs = _cuentas(sede, usuario=usuario).filter(proveedor_id=proveedor_id)
    cuentas = list(qs)
    proximos = [
        {'id': c.id, 'numero': c.numero, 'fecha': str(c.fecha_vencimiento), 'monto': str(c.saldo), 'moneda': c.moneda}
        for c in qs.exclude(estado__in=['pagada', 'anulada']).order_by('fecha_vencimiento')[:10]
    ]
    return {'proveedor': proveedor_id, 'deuda': _montos(cuentas), 'vencidas': [c.numero for c in cuentas if situacion(c, hoy) == 'vencida'], 'proximos_vencimientos': proximos}


NOMBRES_REPORTES = {
    'cuentas-pendientes-al-corte', 'antiguedad-saldos', 'pagos-realizados', 'vencimientos',
    'aplazamientos', 'estado-cuenta-proveedor', 'proyeccion-pagos', 'recurrentes',
}


def reporte(nombre, sede=None, desde=None, hasta=None, proveedor=None, corte=None, hoy=None, usuario=None):
    if nombre not in NOMBRES_REPORTES: raise ValueError('Informe no válido')
    hoy = hoy or timezone.localdate(); corte = _fecha(corte, hoy)
    if nombre == 'cuentas-pendientes-al-corte':
        return [{'numero': c.numero, 'proveedor': str(c.proveedor), 'vencimiento': str(c.fecha_vencimiento), 'saldo': str(c.saldo), 'moneda': c.moneda} for c in _cuentas(sede, hasta=corte, usuario=usuario).exclude(estado__in=['pagada', 'anulada'])]
    if nombre == 'antiguedad-saldos':
        grupos = defaultdict(lambda: {'cantidad': 0, 'usd': ZERO, 'ves': ZERO})
        for c in _cuentas(sede, usuario=usuario).exclude(estado__in=['pagada', 'anulada']):
            dias = max((corte - c.fecha_vencimiento).days, 0); banda = '0-30' if dias <= 30 else '31-60' if dias <= 60 else '61-90' if dias <= 90 else '91+'
            d=grupos[banda]; d['cantidad'] += 1; factor=c.saldo/c.monto_documento; d['usd'] += c.monto_usd*factor; d['ves'] += c.monto_ves*factor
        return [{'rango': k, 'cantidad': v['cantidad'], 'usd': str(v['usd'].quantize(Decimal('0.01'))), 'ves': str(v['ves'].quantize(Decimal('0.01')))} for k,v in grupos.items()]
    if nombre == 'pagos-realizados':
        pagos=PagoCuentaPagar.objects.filter(estado='valido').select_related('cuenta','cuenta__proveedor')
        if desde: pagos=pagos.filter(fecha_pago__gte=_fecha(desde,hoy))
        if hasta: pagos=pagos.filter(fecha_pago__lte=_fecha(hasta,hoy))
        if usuario is not None: pagos=filtrar_por_sede(usuario, pagos, 'cuenta__sede')
        if sede: pagos=pagos.filter(cuenta__sede_id=sede)
        return [{'id':p.id,'fecha':str(p.fecha_pago),'cuenta':p.cuenta.numero,'proveedor':str(p.cuenta.proveedor),'usd':str(p.monto_usd),'ves':str(p.monto_ves)} for p in pagos]
    if nombre == 'vencimientos': return calendario(sede, desde, hasta, usuario=usuario)
    if nombre == 'aplazamientos':
        qs = _cuentas(sede, usuario=usuario).prefetch_related('aplazamientos')
        return [{'cuenta':c.numero,'cantidad':c.aplazamientos.count(),'eventos':[{'anterior':str(a.fecha_anterior),'nueva':str(a.fecha_nueva),'motivo':a.motivo} for a in c.aplazamientos.all()]} for c in qs if c.aplazamientos.exists()]
    if nombre == 'estado-cuenta-proveedor': return estado_proveedor(proveedor, sede, hoy, usuario=usuario) if proveedor else []
    if nombre == 'proyeccion-pagos': return proyeccion(sede, desde, hasta, usuario=usuario)
    return [{'id':p.id,'nombre':p.nombre,'proveedor':str(p.proveedor),'monto':str(p.monto),'moneda':p.moneda,'activa':p.activa} for p in (filtrar_por_sede(usuario, PlantillaRecurrente.objects.select_related('proveedor')) if usuario is not None else PlantillaRecurrente.objects.select_related('proveedor'))]
