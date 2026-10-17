"""
Motor de alertas de la Auditoría de Cantina — carril B4 (Fase 2).
Reglas de CONTRATO_AUDITORIA_CANTINA.md §6.

Lo corre la tarea Beat `evaluar_alertas_auditoria_cantina` (cada hora en
horario escolar) y, para la regla de diferencia de caja, el signal de
`CierreCajaCantina` al cerrar una caja.

Idempotencia: cada alerta tiene una `clave_dedupe` única
(`{tipo}:{referencia_tipo}:{referencia_id}:{fecha}`). Se crea con
`get_or_create`, así que correr el motor N veces no duplica nada. Una alerta
ya atendida nunca se reabre ni se modifica; una abierta solo refresca su
título/detalle si los números del día cambiaron (ej. 5 → 7 anulaciones).
"""
from datetime import datetime
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.db.models import Count, Exists, F, Max, OuterRef
from django.db.models.functions import Coalesce
from django.utils import timezone

from cantina.models import (
    AlertaCantina,
    AperturaCajaCantina,
    CierreCajaCantina,
    DetalleVentaCantina,
    MovimientoInventario,
    ParametroAuditoriaCantina,
    ProductoCantina,
    VentaCantina,
)

from .serializers_cierres import dinero, nombre_usuario

CIEN = Decimal('100')
CREADA, ACTUALIZADA, SIN_CAMBIOS = 'creada', 'actualizada', 'sin_cambios'


def _guardar_alerta(tipo, *, fecha, referencia_tipo, referencia_id, titulo, detalle,
                    severidad='advertencia', area=None):
    """
    Crea la alerta si no existe (por `clave_dedupe`). Si existe y sigue
    abierta, refresca título/detalle/severidad; si está atendida, no la toca.
    Devuelve CREADA, ACTUALIZADA o SIN_CAMBIOS.
    """
    clave = f'{tipo}:{referencia_tipo}:{referencia_id}:{fecha.isoformat()}'
    valores = {'titulo': titulo[:200], 'detalle': detalle, 'severidad': severidad}
    alerta, creada = AlertaCantina.objects.get_or_create(
        clave_dedupe=clave,
        defaults={
            'tipo': tipo, 'fecha': fecha, 'area': area,
            'referencia_tipo': referencia_tipo, 'referencia_id': str(referencia_id),
            **valores,
        },
    )
    if creada:
        return CREADA
    if alerta.estado != 'abierta' or all(getattr(alerta, k) == v for k, v in valores.items()):
        return SIN_CAMBIOS
    # Update condicional: si alguien la atendió entre el get y este punto, no se pisa.
    filas = AlertaCantina.objects.filter(pk=alerta.pk, estado='abierta').update(**valores)
    return ACTUALIZADA if filas else SIN_CAMBIOS


def _area_unica(fila):
    """`area` de un agrupado solo si todas sus filas son de la misma área."""
    return fila['area'] if fila.get('n_areas') == 1 else None


def _usuarios(ids):
    ids = {i for i in ids if i is not None}
    if not ids:
        return {}
    return {u.id: nombre_usuario(u) for u in get_user_model().objects.filter(id__in=ids)}


# ─────────────────────────────────────────────
# Regla 1 — diferencia de caja
# ─────────────────────────────────────────────
def evaluar_diferencia_caja(cierre, parametros=None):
    """
    `abs(diferencia) > tolerancia` → alerta (crítica si supera 5× la
    tolerancia). Devuelve el resultado de `_guardar_alerta`, o None si el
    cierre no dispara.
    """
    if cierre.diferencia is None:
        return None
    parametros = parametros or ParametroAuditoriaCantina.obtener()
    tolerancia = parametros.tolerancia_diferencia_caja
    diferencia = cierre.diferencia
    if abs(diferencia) <= tolerancia:
        return None
    tipo_diferencia = 'faltante' if diferencia < 0 else 'sobrante'
    return _guardar_alerta(
        'diferencia_caja',
        fecha=cierre.fecha,
        referencia_tipo='cierre',
        referencia_id=cierre.id,
        titulo=f'Cierre #{cierre.id} con {tipo_diferencia} de ${dinero(abs(diferencia))}',
        detalle={
            'cierre_id': cierre.id,
            'cajero_id': cierre.cajero_id,
            'diferencia_usd': dinero(diferencia),
            'tolerancia_usd': dinero(tolerancia),
        },
        severidad='critica' if abs(diferencia) > tolerancia * 5 else 'advertencia',
        area=cierre.area,
    )


def _regla_diferencia_caja(fecha, parametros):
    return [
        evaluar_diferencia_caja(cierre, parametros)
        for cierre in CierreCajaCantina.objects.filter(fecha=fecha, diferencia__isnull=False)
    ]


# ─────────────────────────────────────────────
# Regla 2 — exceso de anulaciones
# ─────────────────────────────────────────────
def _regla_exceso_anulaciones(fecha, parametros):
    """Anulaciones del día (por `anulada_en`) por quien anuló y en total."""
    anuladas = VentaCantina.objects.filter(estado='anulada', anulada_en__date=fecha)
    resultados = []

    limite_cajero = parametros.limite_anulaciones_dia_cajero
    por_usuario = list(
        anuladas.annotate(responsable=Coalesce('anulada_por', 'cajero'))
        .values('responsable')
        .annotate(cantidad=Count('id'), n_areas=Count('area', distinct=True), area=Max('area'))
        .filter(cantidad__gt=limite_cajero)
    )
    usuarios = _usuarios(fila['responsable'] for fila in por_usuario)
    for fila in por_usuario:
        usuario_id = fila['responsable']
        nombre = usuarios.get(usuario_id, f'Usuario #{usuario_id}')
        resultados.append(_guardar_alerta(
            'exceso_anulaciones', fecha=fecha, referencia_tipo='usuario', referencia_id=usuario_id,
            titulo=f'{nombre} anuló {fila["cantidad"]} ventas en el día (límite {limite_cajero})',
            detalle={'cajero_id': usuario_id, 'cantidad': fila['cantidad'], 'limite': limite_cajero},
            area=_area_unica(fila),
        ))

    limite_total = parametros.limite_anulaciones_dia_total
    total = anuladas.aggregate(cantidad=Count('id'), n_areas=Count('area', distinct=True), area=Max('area'))
    if total['cantidad'] > limite_total:
        resultados.append(_guardar_alerta(
            'exceso_anulaciones', fecha=fecha, referencia_tipo='total', referencia_id='-',
            titulo=f'Se anularon {total["cantidad"]} ventas en el día (límite {limite_total})',
            detalle={'cantidad': total['cantidad'], 'limite': limite_total},
            area=_area_unica(total),
        ))
    return resultados


# ─────────────────────────────────────────────
# Regla 3 — exceso de descuentos
# ─────────────────────────────────────────────
def _regla_exceso_descuentos(fecha, parametros):
    """
    Ventas completadas del día con descuento: por cajero (cantidad > límite)
    y cada venta cuyo descuento supere el % del subtotal configurado.
    """
    con_descuento = VentaCantina.objects.filter(
        estado='completada', creado_en__date=fecha, descuento_usd__gt=0,
    )
    resultados = []

    limite_cajero = parametros.limite_descuentos_dia_cajero
    por_cajero = list(
        con_descuento.values('cajero')
        .annotate(cantidad=Count('id'), n_areas=Count('area', distinct=True), area=Max('area'))
        .filter(cantidad__gt=limite_cajero)
    )
    usuarios = _usuarios(fila['cajero'] for fila in por_cajero)
    for fila in por_cajero:
        cajero_id = fila['cajero']
        nombre = usuarios.get(cajero_id, f'Usuario #{cajero_id}')
        resultados.append(_guardar_alerta(
            'exceso_descuentos', fecha=fecha, referencia_tipo='usuario', referencia_id=cajero_id,
            titulo=f'{nombre} aplicó {fila["cantidad"]} descuentos en el día (límite {limite_cajero})',
            detalle={'cajero_id': cajero_id, 'cantidad': fila['cantidad'], 'limite': limite_cajero},
            area=_area_unica(fila),
        ))

    # % = descuento / subtotal, con subtotal = total neto + descuento. Se
    # filtra en BD: descuento > subtotal × límite / 100.
    limite_pct = parametros.limite_descuento_porcentaje
    excesivas = con_descuento.filter(
        descuento_usd__gt=(F('total_usd') + F('descuento_usd')) * limite_pct / CIEN,
    ).only('id', 'cajero_id', 'area', 'total_usd', 'descuento_usd')
    for venta in excesivas:
        subtotal = venta.subtotal_usd
        porcentaje = venta.descuento_usd * CIEN / subtotal if subtotal else CIEN
        resultados.append(_guardar_alerta(
            'exceso_descuentos', fecha=fecha, referencia_tipo='venta', referencia_id=venta.id,
            titulo=f'Venta #{venta.id} con descuento de {dinero(porcentaje)}% (límite {dinero(limite_pct)}%)',
            detalle={
                'venta_id': venta.id, 'cajero_id': venta.cajero_id,
                'descuento_usd': dinero(venta.descuento_usd), 'subtotal_usd': dinero(subtotal),
                'porcentaje': dinero(porcentaje), 'limite_porcentaje': dinero(limite_pct),
            },
            area=venta.area,
        ))
    return resultados


# ─────────────────────────────────────────────
# Regla 4 — inventario inconsistente
# ─────────────────────────────────────────────
def _regla_inventario_inconsistente(fecha, parametros):
    """
    Por producto, en el día:
      a) la cadena de movimientos se rompe: el `stock_despues` de uno no es
         el `stock_antes` del siguiente (alguien tocó el stock por fuera);
      b) una venta completada no tiene su salida de inventario.
    """
    problemas = {}  # producto_id → {'saltos': [...], 'ventas_sin_salida': [...]}

    def _de(producto_id):
        return problemas.setdefault(producto_id, {'saltos': [], 'ventas_sin_salida': []})

    anterior = None
    movimientos = (
        MovimientoInventario.objects.filter(creado_en__date=fecha)
        .order_by('producto_id', 'creado_en', 'id')
        .values('id', 'producto_id', 'stock_antes', 'stock_despues')
    )
    for mov in movimientos.iterator():
        if (anterior and anterior['producto_id'] == mov['producto_id']
                and anterior['stock_despues'] != mov['stock_antes']):
            _de(mov['producto_id'])['saltos'].append({
                'movimiento_id': mov['id'],
                'stock_esperado': anterior['stock_despues'],
                'stock_antes': mov['stock_antes'],
            })
        anterior = mov

    sin_salida = (
        DetalleVentaCantina.objects
        .filter(venta__estado='completada', venta__creado_en__date=fecha)
        .annotate(tiene_salida=Exists(MovimientoInventario.objects.filter(
            tipo='salida', venta_id=OuterRef('venta_id'), producto_id=OuterRef('producto_id'),
        )))
        .filter(tiene_salida=False)
        .values_list('producto_id', 'venta_id')
        .distinct()
    )
    for producto_id, venta_id in sin_salida:
        _de(producto_id)['ventas_sin_salida'].append(venta_id)

    if not problemas:
        return []
    productos = ProductoCantina.objects.in_bulk(list(problemas))
    resultados = []
    for producto_id, detalle in problemas.items():
        producto = productos.get(producto_id)
        nombre = producto.nombre if producto else f'Producto #{producto_id}'
        partes = []
        if detalle['saltos']:
            partes.append(f'{len(detalle["saltos"])} salto(s) de stock')
        if detalle['ventas_sin_salida']:
            partes.append(f'{len(detalle["ventas_sin_salida"])} venta(s) sin salida')
        resultados.append(_guardar_alerta(
            'inventario_inconsistente', fecha=fecha, referencia_tipo='producto', referencia_id=producto_id,
            titulo=f'Inventario de {nombre} no cuadra con las ventas ({", ".join(partes)})',
            detalle={
                'producto_id': producto_id,
                'saltos': detalle['saltos'][:20],
                'ventas_sin_salida': sorted(detalle['ventas_sin_salida'])[:20],
            },
            severidad='critica',
            area=producto.area if producto else None,
        ))
    return resultados


# ─────────────────────────────────────────────
# Regla 5 — cierre faltante
# ─────────────────────────────────────────────
def _paso_hora_tope(fecha, parametros, ahora):
    hoy = timezone.localdate(ahora)
    if fecha < hoy:
        return True
    if fecha > hoy:
        return False
    return timezone.localtime(ahora).time() >= parametros.hora_tope_cierre


def _regla_cierre_faltante(fecha, parametros, ahora=None):
    """Pasada la hora tope, toda apertura del día (o anterior) aún abierta."""
    if not _paso_hora_tope(fecha, parametros, ahora or timezone.now()):
        return []
    hora_tope = parametros.hora_tope_cierre.strftime('%H:%M')
    abiertas = (
        AperturaCajaCantina.objects
        .filter(estado='abierta', fecha_hora_apertura__date__lte=fecha)
        .select_related('cajero')
    )
    return [
        _guardar_alerta(
            'cierre_faltante', fecha=fecha, referencia_tipo='apertura', referencia_id=apertura.id,
            titulo=f'{nombre_usuario(apertura.cajero)} no ha cerrado el turno #{apertura.id} '
                   f'(hora tope {hora_tope})',
            detalle={
                'apertura_id': apertura.id, 'cajero_id': apertura.cajero_id,
                'abierta_desde': timezone.localtime(apertura.fecha_hora_apertura).isoformat(),
                'hora_tope': hora_tope,
            },
            area=apertura.area,
        )
        for apertura in abiertas
    ]


# ─────────────────────────────────────────────
# Regla 6 — stock bajo el mínimo
# ─────────────────────────────────────────────
def _regla_stock_bajo_minimo(fecha, parametros):
    productos = ProductoCantina.objects.filter(activo=True, stock_actual__lt=F('stock_minimo'))
    return [
        _guardar_alerta(
            'stock_bajo_minimo', fecha=fecha, referencia_tipo='producto', referencia_id=producto.id,
            titulo=f'{producto.nombre}: stock {producto.stock_actual} bajo el mínimo ({producto.stock_minimo})',
            detalle={
                'producto_id': producto.id, 'stock_actual': producto.stock_actual,
                'stock_minimo': producto.stock_minimo,
            },
            severidad='info',
            area=producto.area,
        )
        for producto in productos
    ]


REGLAS = (
    ('diferencia_caja', _regla_diferencia_caja),
    ('exceso_anulaciones', _regla_exceso_anulaciones),
    ('exceso_descuentos', _regla_exceso_descuentos),
    ('inventario_inconsistente', _regla_inventario_inconsistente),
    ('cierre_faltante', _regla_cierre_faltante),
    ('stock_bajo_minimo', _regla_stock_bajo_minimo),
)


def evaluar_alertas(fecha=None):
    """
    Corre las 6 reglas para `fecha` (hoy por defecto) y devuelve un resumen:
    `{'fecha', 'creadas', 'actualizadas', 'por_tipo': {tipo: creadas}}`.
    Acepta `fecha` como `date` o string `YYYY-MM-DD` (la tarea Celery la
    recibe serializada).
    """
    if isinstance(fecha, str):
        fecha = datetime.strptime(fecha, '%Y-%m-%d').date()
    fecha = fecha or timezone.localdate()
    parametros = ParametroAuditoriaCantina.obtener()
    resumen = {'fecha': fecha.isoformat(), 'creadas': 0, 'actualizadas': 0, 'por_tipo': {}}
    for tipo, regla in REGLAS:
        resultados = regla(fecha, parametros)
        creadas = resultados.count(CREADA)
        resumen['creadas'] += creadas
        resumen['actualizadas'] += resultados.count(ACTUALIZADA)
        resumen['por_tipo'][tipo] = creadas
    return resumen
