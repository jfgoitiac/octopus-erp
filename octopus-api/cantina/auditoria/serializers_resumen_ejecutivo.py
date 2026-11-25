"""
Forma de la respuesta del Resumen ejecutivo (Cantina + Librería).

Aquí NO hay consultas: solo se da forma a agregados que ya calculó la base de
datos (`views_resumen_ejecutivo`). La única aritmética de Python es la de
presentación (porcentajes y variaciones entre dos agregados), siempre con
`Decimal`. Los montos salen como string decimal con 2 decimales.
"""
from datetime import timedelta
from decimal import Decimal

from .serializers_cierres import dinero
from .serializers_reportes import CERO, CIEN, advertencia_sin_costo, margen_pct

SEVERIDAD_ORDEN = {'critica': 0, 'advertencia': 1, 'info': 2}

# Métricas comparables con el período anterior (clave → tipo de variación).
METRICAS_COMPARABLES = (
    'ingresos_netos_usd', 'ventas_completadas', 'ticket_promedio_usd', 'costo_mercancia_usd',
    'utilidad_bruta_usd', 'margen_bruto_pct', 'descuentos_usd', 'ventas_anuladas',
    'ventas_anuladas_usd', 'cxc_generadas_usd', 'abonos_recibidos_usd',
)


def _dec(valor):
    return Decimal(str(valor if valor is not None else 0))


def porcentaje(parte, total):
    """parte / total × 100 con 2 decimales; 0.00 si no hay total."""
    total = _dec(total)
    if not total:
        return dinero(CERO)
    return dinero(_dec(parte) / total * CIEN)


def variacion_pct(actual, anterior):
    """Variación porcentual vs el período anterior; None si no hay base (anterior = 0)."""
    anterior = _dec(anterior)
    if not anterior:
        return None
    return dinero((_dec(actual) - anterior) / abs(anterior) * CIEN)


def periodo_anterior(fi, ff):
    """Mismo número de días, inmediatamente antes de `fi`."""
    dias = (ff - fi).days + 1
    anterior_ff = fi - timedelta(days=1)
    return anterior_ff - timedelta(days=dias - 1), anterior_ff


# ─────────────────────────────────────────────
# KPIs
# ─────────────────────────────────────────────
def construir_kpis(base):
    """
    `base` agrupa los agregados crudos de un período:
    ventas, detalles, cargos y abonos (ver `_agregados_base` en la vista).
    """
    v, d, c, a = base['ventas'], base['detalles'], base['cargos'], base['abonos']
    ingresos = _dec(v['ingresos_usd'])
    completadas = int(v['completadas'] or 0)
    ventas_con_costo = _dec(d['ventas_usd'])
    ingresos_lineas = _dec(d['ingresos_usd'])
    return {
        'ingresos_netos_usd': dinero(ingresos),
        'ventas_completadas': completadas,
        'ticket_promedio_usd': dinero(ingresos / completadas) if completadas else dinero(CERO),
        'costo_mercancia_usd': dinero(d['costo_usd']),
        'utilidad_bruta_usd': dinero(d['margen_usd']),
        'margen_bruto_pct': margen_pct(d['margen_usd'], ventas_con_costo),
        'ingresos_con_costo_usd': dinero(ventas_con_costo),
        'cobertura_costo_pct': porcentaje(ventas_con_costo, ingresos_lineas) if ingresos_lineas else None,
        'unidades_sin_costo': int(d['unidades_sin_costo'] or 0),
        'descuentos_usd': dinero(v['descuentos_usd']),
        'ventas_anuladas': int(v['anuladas'] or 0),
        'ventas_anuladas_usd': dinero(v['anuladas_usd']),
        'cxc_generadas_cantidad': int(c['generadas'] or 0),
        'cxc_generadas_usd': dinero(c['generadas_usd']),
        'abonos_recibidos_cantidad': int(a['cantidad'] or 0),
        'abonos_recibidos_usd': dinero(a['monto_usd']),
        'saldo_cxc_pendiente_usd': dinero(c['saldo_usd']),
    }


def construir_comparacion(kpis, kpis_anterior, fi, ff):
    variaciones = {}
    for clave in METRICAS_COMPARABLES:
        actual, anterior = kpis[clave], kpis_anterior[clave]
        fila = {'anterior': anterior, 'variacion_pct': None}
        if clave == 'margen_bruto_pct':
            # Un porcentaje no se compara en %, sino en puntos porcentuales.
            if actual is not None and anterior is not None:
                fila['variacion_puntos'] = dinero(_dec(actual) - _dec(anterior))
        else:
            fila['variacion_pct'] = variacion_pct(actual, anterior)
        variaciones[clave] = fila
    return {
        'periodo': {'fecha_inicio': fi.isoformat(), 'fecha_fin': ff.isoformat()},
        'variaciones': variaciones,
    }


# ─────────────────────────────────────────────
# Distribuciones y series
# ─────────────────────────────────────────────
def distribucion(grupos, etiquetas, total, claves_fijas=()):
    """Filas {clave, etiqueta, ventas, ingresos_usd, porcentaje}; las claves fijas salen aunque estén en 0."""
    por_clave = {g['clave']: g for g in grupos}
    for clave in claves_fijas:
        por_clave.setdefault(clave, {'clave': clave, 'ventas': 0, 'ingresos_usd': CERO})
    filas = [
        {
            'clave': clave,
            'etiqueta': etiquetas.get(clave, clave),
            'ventas': int(g['ventas'] or 0),
            'ingresos_usd': dinero(g['ingresos_usd']),
            'porcentaje': porcentaje(g['ingresos_usd'], total),
        }
        for clave, g in por_clave.items()
    ]
    return sorted(filas, key=lambda f: (-Decimal(f['ingresos_usd']), f['etiqueta']))


def serie_diaria(grupos, fi, ff):
    """Un punto por día del rango (los días sin ventas en 0) para que la gráfica no tenga huecos."""
    por_dia = {g['dia']: g for g in grupos}
    dias = (ff - fi).days + 1
    serie = []
    for i in range(dias):
        dia = fi + timedelta(days=i)
        g = por_dia.get(dia)
        serie.append({
            'fecha': dia.isoformat(),
            'ingresos_usd': dinero(g['ingresos_usd'] if g else CERO),
            'ventas': int(g['ventas']) if g else 0,
        })
    return serie


def fila_ranking(g, campo_id, campo_nombre):
    ventas = _dec(g['ventas_usd'])
    return {
        'clave': str(g[campo_id]),
        'etiqueta': g[campo_nombre],
        'unidades': int(g['unidades'] or 0),
        'ingresos_usd': dinero(g['ingresos_usd']),
        'costo_usd': dinero(g['costo_usd']),
        'utilidad_usd': dinero(g['margen_usd']),
        'margen_pct': margen_pct(g['margen_usd'], ventas),
        'unidades_sin_costo': int(g['unidades_sin_costo'] or 0),
    }


# ─────────────────────────────────────────────
# Alertas ejecutivas
# ─────────────────────────────────────────────
def _alerta(codigo, severidad, titulo, detalle):
    return {'codigo': codigo, 'severidad': severidad, 'titulo': titulo, 'detalle': detalle}


def construir_alertas(kpis, base, inventario, caja, parametros):
    alertas = []
    v, d = base['ventas'], base['detalles']
    ingresos = _dec(kpis['ingresos_netos_usd'])
    unidades_sin_costo = kpis['unidades_sin_costo']
    cobertura = kpis['cobertura_costo_pct']

    if unidades_sin_costo:
        critica = cobertura is not None and _dec(cobertura) < parametros.cobertura_costo_critica_pct
        alertas.append(_alerta(
            'productos_sin_costo', 'critica' if critica else 'advertencia',
            'Productos vendidos sin costo registrado',
            f"{advertencia_sin_costo(unidades_sin_costo)} Afecta {d['productos_sin_costo']} "
            f"producto(s); el costo cubre el {cobertura}% de los ingresos."
            if cobertura is not None else advertencia_sin_costo(unidades_sin_costo),
        ))

    margen = kpis['margen_bruto_pct']
    if ingresos > 0 and margen is None:
        alertas.append(_alerta(
            'margen_no_calculable', 'advertencia', 'Margen no calculable',
            'Ninguna venta del período tiene costo registrado: no se puede calcular utilidad ni margen.',
        ))
    elif margen is not None and _dec(margen) < 0:
        alertas.append(_alerta(
            'margen_negativo', 'critica', 'Margen bruto negativo',
            f'Se vendió por debajo del costo: margen de {margen}%.',
        ))
    elif margen is not None and _dec(margen) < parametros.umbral_margen_bajo_pct:
        alertas.append(_alerta(
            'margen_bajo', 'advertencia', 'Margen bajo',
            f'El margen bruto es {margen}%, inferior al {parametros.umbral_margen_bajo_pct}% definido en los parámetros de auditoría.',
        ))

    anuladas, completadas = kpis['ventas_anuladas'], kpis['ventas_completadas']
    pct_anuladas = _dec(porcentaje(anuladas, anuladas + completadas))
    if anuladas >= parametros.min_anulaciones_alerta and pct_anuladas >= parametros.umbral_anulaciones_pct:
        alertas.append(_alerta(
            'anulaciones_elevadas', 'advertencia', 'Anulaciones elevadas',
            f"{anuladas} venta(s) anulada(s) por ${kpis['ventas_anuladas_usd']} "
            f'({pct_anuladas}% de las ventas registradas).',
        ))

    descuentos = _dec(kpis['descuentos_usd'])
    pct_descuento = _dec(porcentaje(descuentos, ingresos + descuentos))
    if descuentos > 0 and pct_descuento >= parametros.limite_descuento_porcentaje:
        alertas.append(_alerta(
            'descuentos_inusuales', 'advertencia', 'Descuentos inusuales',
            f'Se otorgó ${kpis["descuentos_usd"]} en descuentos ({pct_descuento}% del bruto), '
            f'por encima del {parametros.limite_descuento_porcentaje}% definido en los parámetros de auditoría.',
        ))

    if inventario['mermas']:
        alertas.append(_alerta(
            'mermas', 'advertencia', 'Mermas de inventario',
            f"{inventario['mermas']} unidad(s) dadas de baja por merma "
            f"(valor estimado ${inventario['merma_valor_estimado_usd']}).",
        ))

    if caja['con_diferencia']:
        alertas.append(_alerta(
            'diferencias_caja', 'advertencia', 'Diferencias de caja',
            f"{caja['con_diferencia']} cierre(s) superan la tolerancia de ${caja['tolerancia_usd']}; "
            f"diferencia neta ${caja['diferencia_neta_usd']}.",
        ))

    motivos = []
    if caja['sin_conteo']:
        motivos.append(f"{caja['sin_conteo']} cierre(s) sin conteo físico")
    if v['sin_turno']:
        motivos.append(f"{v['sin_turno']} venta(s) sin turno de caja asociado")
    if motivos:
        alertas.append(_alerta(
            'datos_incompletos', 'info', 'Datos incompletos',
            'Algunas cifras pueden estar subestimadas: ' + '; '.join(motivos) + '.',
        ))

    return sorted(alertas, key=lambda a: SEVERIDAD_ORDEN[a['severidad']])
