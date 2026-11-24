"""
Resumen ejecutivo de Cantina y Librería — GET reportes/resumen-ejecutivo/.

Un solo endpoint consolidado para que el Director presente el informe
financiero al dueño del colegio. NO crea un sistema de cálculo paralelo:
reutiliza los helpers de `serializers_reportes` (neto por línea, costo
histórico `DetalleVentaCantina.costo_unitario`, margen) y de `views_reportes`
(filtros comunes, etiquetas), y agrega todo en la base de datos con un número
fijo de consultas (independiente del volumen de ventas).

Parámetros: `fecha_inicio`, `fecha_fin` (YYYY-MM-DD, omitidas → hoy), `area`,
`cajero`, `comparar=true|false`. No acepta `sede`: ni las ventas, ni los
cargos, ni las cajas de Cantina guardan sede (ver NOTAS_TECNICAS.md), así que
un filtro por sede sería una promesa falsa de aislamiento; se rechaza con 400.
"""
from django.contrib.auth import get_user_model
from django.db.models import Count, ExpressionWrapper, F, Q
from django.db.models.functions import Abs, TruncDate
from django.utils import timezone
from rest_framework.response import Response

from cantina.models import (
    AbonoCantina,
    CargoCantina,
    CierreCajaCantina,
    MovimientoInventario,
    ParametroAuditoriaCantina,
)

from .models import AREAS
from .serializers_cierres import dinero, fecha_hora, usuario_dict
from .serializers_reportes import (
    _DECIMAL_FINO,
    agregados_rentabilidad,
    agregados_resumen_inventario,
    detalles_completados,
    neto_linea,
    suma_dinero,
    suma_entera,
    ventas_filtradas,
)
from .serializers_resumen_ejecutivo import (
    construir_alertas,
    construir_comparacion,
    construir_kpis,
    distribucion,
    fila_ranking,
    periodo_anterior,
    serie_diaria,
)
from .views_base import VistaAuditoria
from .views_cierres import ParametroInvalido, _entero, error, parsear_area, parsear_rango_fechas
from .views_panel import ETIQUETAS_METODO
from .views_reportes import CAMPOS_LINEA

User = get_user_model()

MAX_DIAS_RANGO = 366
LIMITE_RANKING = 15
LIMITE_SIN_COSTO = 20
LIMITE_DIFERENCIAS = 5
LIMITE_ANULACIONES_CAJERO = 5
ETIQUETAS_AREA = dict(AREAS)

LIMITACIONES = [
    'El saldo de cuentas por cobrar es el vigente al momento de la consulta (no se reconstruye a la fecha final).',
    'El valor de las mermas es una estimación con el costo actual del producto: el movimiento de inventario no guarda costo histórico.',
    'Cantina y Librería no registran sede en sus operaciones: el informe abarca toda la institución.',
]


def _booleano(request, nombre):
    valor = (request.query_params.get(nombre) or 'false').strip().lower()
    if valor in ('true', '1'):
        return True
    if valor in ('false', '0', ''):
        return False
    raise ParametroInvalido(f"El parámetro '{nombre}' debe ser true o false.")


def _parsear(request):
    if request.query_params.get('sede') not in (None, ''):
        raise ParametroInvalido(
            'Cantina y Librería no registran la sede de sus operaciones; no es posible filtrar por sede.'
        )
    fi, ff = parsear_rango_fechas(request)
    if ff > timezone.localdate():
        raise ParametroInvalido('fecha_fin no puede ser una fecha futura.')
    if (ff - fi).days + 1 > MAX_DIAS_RANGO:
        raise ParametroInvalido(f'El rango no puede superar {MAX_DIAS_RANGO} días.')
    area = parsear_area(request)
    cajero_id = _entero(request, 'cajero')
    cajero = None
    if cajero_id is not None:
        cajero = User.objects.filter(pk=cajero_id).first()
        if cajero is None:
            raise ParametroInvalido("El parámetro 'cajero' no corresponde a un usuario existente.")
    return {'fi': fi, 'ff': ff, 'area': area, 'cajero_id': cajero_id}, cajero, _booleano(request, 'comparar')


# ─────────────────────────────────────────────
# Agregados de un período (4 consultas)
# ─────────────────────────────────────────────
def _agregados_base(fi, ff, area, cajero_id):
    completada = Q(estado='completada')
    anulada = Q(estado='anulada')
    ventas = ventas_filtradas(fi, ff, area, cajero_id).aggregate(
        completadas=Count('id', filter=completada),
        ingresos_usd=suma_dinero('total_usd', completada),
        descuentos_usd=suma_dinero('descuento_usd', completada),
        con_descuento=Count('id', filter=completada & Q(descuento_usd__gt=0)),
        manuales=Count('id', filter=completada & Q(es_manual=True)),
        sin_turno=Count('id', filter=completada & Q(apertura__isnull=True)),
        anuladas=Count('id', filter=anulada),
        anuladas_usd=suma_dinero('total_usd', anulada),
    )

    sin_costo = Q(costo_unitario__isnull=True)
    detalles = detalles_completados(fi, ff, area, cajero_id).aggregate(
        **agregados_rentabilidad(),
        ingresos_usd=suma_dinero(neto_linea()),
        ingresos_sin_costo_usd=suma_dinero(neto_linea(), sin_costo),
        productos_sin_costo=Count('producto', filter=sin_costo, distinct=True),
    )

    en_rango = Q(creado_en__date__gte=fi, creado_en__date__lte=ff)
    cargos = CargoCantina.objects.exclude(estado='anulado')
    if area:
        cargos = cargos.filter(area=area)
    if cajero_id is not None:
        cargos = cargos.filter(venta__cajero_id=cajero_id)
    cargos = cargos.aggregate(
        generadas=Count('id', filter=en_rango),
        generadas_usd=suma_dinero('monto_usd', en_rango),
        saldo_usd=suma_dinero(
            ExpressionWrapper(F('monto_usd') - F('monto_pagado'), output_field=_DECIMAL_FINO),
            Q(estado='pendiente'),
        ),
    )

    abonos = AbonoCantina.objects.filter(
        estatus='completado', fecha_pago__date__gte=fi, fecha_pago__date__lte=ff,
    )
    if area:
        abonos = abonos.filter(area=area)
    if cajero_id is not None:
        abonos = abonos.filter(cajero_id=cajero_id)
    abonos = abonos.aggregate(cantidad=Count('operacion_uuid', distinct=True), monto_usd=suma_dinero('monto_usd'))

    return {'ventas': ventas, 'detalles': detalles, 'cargos': cargos, 'abonos': abonos}


# ─────────────────────────────────────────────
# Secciones del período actual
# ─────────────────────────────────────────────
def _distribuciones(filtros, total):
    ventas = ventas_filtradas(**filtros).filter(estado='completada')
    por_area = [
        {'clave': g['area'], 'ventas': g['ventas'], 'ingresos_usd': g['ingresos_usd']}
        for g in ventas.values('area').annotate(ventas=Count('id'), ingresos_usd=suma_dinero('total_usd'))
    ]
    por_metodo = [
        {'clave': g['metodo_pago'], 'ventas': g['ventas'], 'ingresos_usd': g['ingresos_usd']}
        for g in ventas.values('metodo_pago').annotate(ventas=Count('id'), ingresos_usd=suma_dinero('total_usd'))
    ]
    por_dia = list(
        ventas.annotate(dia=TruncDate('creado_en')).values('dia')
        .annotate(ventas=Count('id'), ingresos_usd=suma_dinero('total_usd')).order_by('dia')
    )
    claves_area = (filtros['area'],) if filtros['area'] else tuple(clave for clave, _ in AREAS)
    return (
        distribucion(por_area, ETIQUETAS_AREA, total, claves_area),
        distribucion(por_metodo, ETIQUETAS_METODO, total),
        serie_diaria(por_dia, filtros['fi'], filtros['ff']),
    )


def _ranking(detalles, agrupar, orden):
    campo_id, campo_nombre = CAMPOS_LINEA[agrupar]
    grupos = (
        detalles.values(campo_id, campo_nombre)
        .annotate(**agregados_rentabilidad(), ingresos_usd=suma_dinero(neto_linea()))
    )
    if orden == 'utilidad':
        # Solo productos/categorías con ventas costeadas: sin costo no hay utilidad que ordenar.
        grupos = grupos.filter(ventas_usd__gt=0).order_by('-margen_usd', campo_nombre)
    else:
        grupos = grupos.order_by('-ingresos_usd', campo_nombre)
    return [fila_ranking(g, campo_id, campo_nombre) for g in grupos[:LIMITE_RANKING]]


def _productos_sin_costo(detalles, base_detalles):
    if not base_detalles['unidades_sin_costo']:
        return []
    campo_id, campo_nombre = CAMPOS_LINEA['producto']
    grupos = (
        detalles.filter(costo_unitario__isnull=True).values(campo_id, campo_nombre)
        .annotate(unidades=suma_entera('cantidad'), ingresos_usd=suma_dinero(neto_linea()))
        .order_by('-ingresos_usd', campo_nombre)[:LIMITE_SIN_COSTO]
    )
    return [
        {
            'clave': str(g[campo_id]), 'etiqueta': g[campo_nombre],
            'unidades': int(g['unidades']), 'ingresos_usd': dinero(g['ingresos_usd']),
        }
        for g in grupos
    ]


def _inventario(fi, ff, area, cajero_id):
    movimientos = MovimientoInventario.objects.filter(creado_en__date__gte=fi, creado_en__date__lte=ff)
    if area:
        movimientos = movimientos.filter(producto__area=area)
    if cajero_id is not None:
        movimientos = movimientos.filter(usuario_id=cajero_id)
    merma = Q(tipo='merma')
    r = movimientos.aggregate(
        **agregados_resumen_inventario(),
        merma_valor=suma_dinero(
            ExpressionWrapper(F('cantidad') * F('producto__costo'), output_field=_DECIMAL_FINO),
            merma & Q(producto__costo__isnull=False),
        ),
        merma_sin_costo=suma_entera('cantidad', merma & Q(producto__costo__isnull=True)),
    )
    return {
        'entradas': r['entrada'],
        'salidas': r['salida'],
        'ajustes': r['ajuste'],
        'mermas': r['merma'],
        'merma_valor_estimado_usd': dinero(r['merma_valor']),
        'merma_unidades_sin_costo': r['merma_sin_costo'],
    }


def _caja(fi, ff, area, cajero_id, parametros):
    cierres = CierreCajaCantina.objects.filter(fecha__gte=fi, fecha__lte=ff)
    if area:
        cierres = cierres.filter(area=area)
    if cajero_id is not None:
        cierres = cierres.filter(cajero_id=cajero_id)
    tolerancia = parametros.tolerancia_diferencia_caja
    relevante = Q(diferencia__gt=tolerancia) | Q(diferencia__lt=-tolerancia)
    r = cierres.aggregate(
        cierres=Count('id'),
        con_diferencia=Count('id', filter=relevante),
        sin_conteo=Count('id', filter=Q(diferencia__isnull=True)),
        neta=suma_dinero('diferencia'),
        faltantes=suma_dinero('diferencia', Q(diferencia__lt=0)),
        sobrantes=suma_dinero('diferencia', Q(diferencia__gt=0)),
    )
    detalle = []
    if r['con_diferencia']:
        detalle = [
            {
                'cierre_id': c.id, 'fecha': c.fecha.isoformat(), 'area': c.area,
                'cajero': usuario_dict(c.cajero), 'diferencia_usd': dinero(c.diferencia),
            }
            for c in cierres.filter(relevante).select_related('cajero')
            .annotate(magnitud=Abs('diferencia')).order_by('-magnitud', '-fecha')[:LIMITE_DIFERENCIAS]
        ]
    return {
        'cierres': r['cierres'],
        'con_diferencia': r['con_diferencia'],
        'sin_conteo': r['sin_conteo'],
        'tolerancia_usd': dinero(tolerancia),
        'diferencia_neta_usd': dinero(r['neta']),
        'faltantes_usd': dinero(r['faltantes']),
        'sobrantes_usd': dinero(r['sobrantes']),
        'detalle': detalle,
    }


def _excepciones(filtros, base_ventas):
    anuladas_por_cajero = []
    if base_ventas['anuladas']:
        grupos = list(
            ventas_filtradas(**filtros).filter(estado='anulada').values('cajero_id')
            .annotate(cantidad=Count('id'), monto_usd=suma_dinero('total_usd'))
            .order_by('-cantidad', '-monto_usd', 'cajero_id')[:LIMITE_ANULACIONES_CAJERO]
        )
        usuarios = User.objects.in_bulk([g['cajero_id'] for g in grupos])
        anuladas_por_cajero = [
            {
                'usuario': usuario_dict(usuarios.get(g['cajero_id'])),
                'cantidad': g['cantidad'], 'monto_usd': dinero(g['monto_usd']),
            }
            for g in grupos
        ]
    return {
        'anulaciones': {'cantidad': base_ventas['anuladas'], 'monto_usd': dinero(base_ventas['anuladas_usd'])},
        'descuentos': {'cantidad': base_ventas['con_descuento'], 'monto_usd': dinero(base_ventas['descuentos_usd'])},
        'manuales': {'cantidad': base_ventas['manuales']},
        'anulaciones_por_cajero': anuladas_por_cajero,
    }


# ─────────────────────────────────────────────
# Vista
# ─────────────────────────────────────────────
class ResumenEjecutivoView(VistaAuditoria):
    """Exclusiva del Director (`VistaAuditoria` → `EsDirector`)."""

    def get(self, request):
        try:
            filtros, cajero, comparar = _parsear(request)
        except ParametroInvalido as exc:
            return error(str(exc))

        fi, ff = filtros['fi'], filtros['ff']
        area, cajero_id = filtros['area'], filtros['cajero_id']
        parametros = ParametroAuditoriaCantina.obtener()

        base = _agregados_base(**filtros)
        kpis = construir_kpis(base)
        por_area, por_metodo, evolucion = _distribuciones(filtros, kpis['ingresos_netos_usd'])
        detalles = detalles_completados(**filtros)
        inventario = _inventario(fi, ff, area, cajero_id)
        caja = _caja(fi, ff, area, cajero_id, parametros)

        comparacion = None
        if comparar:
            ant_fi, ant_ff = periodo_anterior(fi, ff)
            kpis_anterior = construir_kpis(_agregados_base(ant_fi, ant_ff, area, cajero_id))
            comparacion = construir_comparacion(kpis, kpis_anterior, ant_fi, ant_ff)

        return Response({
            'periodo': {'fecha_inicio': fi.isoformat(), 'fecha_fin': ff.isoformat(), 'dias': (ff - fi).days + 1},
            'filtros': {
                'area': area,
                'area_etiqueta': ETIQUETAS_AREA.get(area, 'Cantina y Librería'),
                'cajero': usuario_dict(cajero),
                'comparar': comparar,
            },
            'generado_en': fecha_hora(timezone.now()),
            'vacio': not (base['ventas']['completadas'] or base['ventas']['anuladas']),
            'kpis': kpis,
            'comparacion': comparacion,
            'distribucion_area': por_area,
            'distribucion_metodo_pago': por_metodo,
            'evolucion_diaria': evolucion,
            'ranking': {
                'productos_ingresos': _ranking(detalles, 'producto', 'ingresos'),
                'categorias_ingresos': _ranking(detalles, 'categoria', 'ingresos'),
                'productos_utilidad': _ranking(detalles, 'producto', 'utilidad'),
                'categorias_utilidad': _ranking(detalles, 'categoria', 'utilidad'),
            },
            'sin_costo': {
                'unidades': kpis['unidades_sin_costo'],
                'productos': base['detalles']['productos_sin_costo'],
                'ingresos_usd': dinero(base['detalles']['ingresos_sin_costo_usd']),
                'lineas': _productos_sin_costo(detalles, base['detalles']),
            },
            'inventario': inventario,
            'caja': caja,
            'excepciones': _excepciones(filtros, base['ventas']),
            'alertas': construir_alertas(kpis, base, inventario, caja, parametros),
            'limitaciones': LIMITACIONES,
        })
