"""
Reportes de auditoría — carril B3 (Fase 2). Contrato §4.

Filtros comunes: `fecha_inicio`, `fecha_fin` (omitidas → hoy), `area` y
`cajero`. Todo se agrega en la BD con un número fijo de consultas por
reporte; Python solo da forma a las filas.
"""
from django.contrib.auth import get_user_model
from django.db.models import Count, F, Q
from django.db.models.functions import TruncDate
from rest_framework.response import Response

from cantina.models import AperturaCajaCantina, MovimientoInventario
from config.pagination import StandardResultsPagination

from .serializers_cierres import nombre_usuario, turno_dict, usuario_dict
from .serializers_reportes import (
    AGRUPACIONES_RENTABILIDAD,
    AGRUPACIONES_VENTAS,
    CLAVE_SIN_TURNO,
    TIPOS_EXCEPCION,
    TIPOS_INVENTARIO,
    ExcepcionVentaSerializer,
    MovimientoReporteSerializer,
    advertencia_sin_costo,
    agregados_rentabilidad,
    agregados_resumen_inventario,
    agregados_ventas_por_linea,
    agregados_ventas_por_venta,
    detalles_completados,
    dinero,
    fila_rentabilidad,
    fila_ventas,
    monto_excepcion,
    suma_dinero,
    suma_entera,
    ventas_filtradas,
)
from .views_base import VistaAuditoria
from .views_cierres import ParametroInvalido, _entero, error, parsear_area, parsear_rango_fechas

User = get_user_model()

# Agrupaciones sobre el detalle de venta: (campo id, campo etiqueta).
CAMPOS_LINEA = {
    'producto': ('producto_id', 'producto__nombre'),
    'categoria': ('producto__categoria_id', 'producto__categoria__nombre'),
}

FILTROS_EXCEPCION = {
    # No hay flujo de devolución aparte: la anulación revierte el cobro y cubre ambas.
    'anulaciones': Q(estado='anulada'),
    'descuentos': Q(estado='completada', descuento_usd__gt=0),
    'manuales': Q(estado='completada', es_manual=True),
}


def filtros_comunes(request):
    fi, ff = parsear_rango_fechas(request)
    return {'fi': fi, 'ff': ff, 'area': parsear_area(request), 'cajero_id': _entero(request, 'cajero')}


def parsear_opcion(request, nombre, validas, defecto=None):
    valor = request.query_params.get(nombre) or defecto
    if valor is not None and valor not in validas:
        raise ParametroInvalido(f"El parámetro '{nombre}' debe ser uno de: {', '.join(validas)}.")
    return valor


def respuesta_paginada(paginador, resultados, **extra):
    """Forma de StandardResultsPagination con claves extra antes de `results`."""
    return Response({
        'count': paginador.page.paginator.count,
        'next': paginador.get_next_link(),
        'previous': paginador.get_previous_link(),
        **extra,
        'results': resultados,
    })


def usuarios_por_id(ids):
    return User.objects.in_bulk([i for i in ids if i is not None])


# ─────────────────────────────────────────────
# Ventas
# ─────────────────────────────────────────────
class ReporteVentasAuditoriaView(VistaAuditoria):
    """
    GET ?agrupar=producto|categoria|turno|responsable|dia (por defecto producto)
    Solo ventas completadas, montos netos. Por producto/categoría el descuento
    de cada venta se prorratea entre sus líneas según su peso en el bruto.
    """

    def get(self, request):
        try:
            filtros = filtros_comunes(request)
            agrupar = parsear_opcion(request, 'agrupar', AGRUPACIONES_VENTAS, defecto='producto')
        except ParametroInvalido as exc:
            return error(str(exc))

        detalles = detalles_completados(**filtros)
        if agrupar in CAMPOS_LINEA:
            filas = self._filas_por_linea(agrupar, detalles)
            t = detalles.aggregate(**agregados_ventas_por_linea())
        else:
            ventas = ventas_filtradas(**filtros).filter(estado='completada')
            filas = self._filas_por_venta(agrupar, ventas, detalles)
            t = {
                **ventas.aggregate(**agregados_ventas_por_venta()),
                **detalles.aggregate(cantidad=suma_entera('cantidad')),
            }
        totales = fila_ventas('', '', t['cantidad'], t['ventas'], t['total_usd'], t['descuento_usd'])
        del totales['clave'], totales['etiqueta']
        return Response({
            'fecha_inicio': filtros['fi'].isoformat(),
            'fecha_fin': filtros['ff'].isoformat(),
            'agrupar': agrupar,
            'filas': filas,
            'totales': totales,
        })

    @staticmethod
    def _filas_por_linea(agrupar, detalles):
        campo_id, campo_nombre = CAMPOS_LINEA[agrupar]
        grupos = (
            detalles.values(campo_id, campo_nombre)
            .annotate(**agregados_ventas_por_linea())
            .order_by('-total_usd', campo_nombre)
        )
        return [
            fila_ventas(g[campo_id], g[campo_nombre], g['cantidad'], g['ventas'], g['total_usd'], g['descuento_usd'])
            for g in grupos
        ]

    def _filas_por_venta(self, agrupar, ventas, detalles):
        """
        Turno, responsable y día: los montos se agrupan sobre la venta (para no
        duplicarlos por el join con el detalle) y las unidades sobre el detalle;
        ambas consultas se cruzan por la clave del grupo.
        """
        if agrupar == 'dia':
            grupo_venta, grupo_linea, orden = TruncDate('creado_en'), TruncDate('venta__creado_en'), 'grupo'
        else:
            campo = 'apertura_id' if agrupar == 'turno' else 'cajero_id'
            grupo_venta, grupo_linea = F(campo), F(f'venta__{campo}')
            orden = 'grupo' if agrupar == 'turno' else '-total_usd'

        grupos = list(
            ventas.annotate(grupo=grupo_venta).values('grupo')
            .annotate(**agregados_ventas_por_venta())
            .order_by(orden, 'grupo')
        )
        unidades = dict(
            detalles.annotate(grupo=grupo_linea).values('grupo')
            .annotate(cantidad=suma_entera('cantidad'))
            .values_list('grupo', 'cantidad')
        )
        etiquetas = self._etiquetas(agrupar, [g['grupo'] for g in grupos])
        return [
            fila_ventas(
                *etiquetas[g['grupo']], unidades.get(g['grupo'], 0),
                g['ventas'], g['total_usd'], g['descuento_usd'],
            )
            for g in grupos
        ]

    @staticmethod
    def _etiquetas(agrupar, claves):
        """{grupo: (clave, etiqueta)} con una sola consulta extra como máximo."""
        if agrupar == 'dia':
            return {d: (d.isoformat(), d.isoformat()) for d in claves}
        if agrupar == 'turno':
            aperturas = AperturaCajaCantina.objects.in_bulk([c for c in claves if c is not None])
            return {
                c: (c, turno_dict(aperturas[c])['etiqueta']) if c is not None else (CLAVE_SIN_TURNO, 'Sin turno')
                for c in claves
            }
        usuarios = usuarios_por_id(claves)
        return {c: (c, nombre_usuario(usuarios[c])) for c in claves}


# ─────────────────────────────────────────────
# Excepciones
# ─────────────────────────────────────────────
class ReporteExcepcionesView(VistaAuditoria):
    """
    GET ?tipo=anulaciones|descuentos|manuales (por defecto anulaciones), paginado.
    `monto_usd` suma el descuento otorgado (descuentos) o el total de la venta
    (anulaciones y manuales). El responsable es el cajero de la venta.
    """

    def get(self, request):
        try:
            filtros = filtros_comunes(request)
            tipo = parsear_opcion(request, 'tipo', TIPOS_EXCEPCION, defecto='anulaciones')
        except ParametroInvalido as exc:
            return error(str(exc))

        ventas = ventas_filtradas(**filtros).filter(FILTROS_EXCEPCION[tipo])
        campo_monto = monto_excepcion(tipo)

        resumen = ventas.aggregate(cantidad=Count('id'), monto_usd=suma_dinero(campo_monto))
        por_cajero = list(
            ventas.values('cajero_id')
            .annotate(cantidad=Count('id'), monto_usd=suma_dinero(campo_monto))
            .order_by('-cantidad', '-monto_usd', 'cajero_id')
        )
        usuarios = usuarios_por_id(g['cajero_id'] for g in por_cajero)

        paginador = StandardResultsPagination()
        pagina = paginador.paginate_queryset(
            ventas.select_related('cajero', 'apertura', 'anulada_por').order_by('-creado_en', '-id'),
            request, view=self,
        )
        return respuesta_paginada(
            paginador,
            ExcepcionVentaSerializer(pagina, many=True, context={'tipo': tipo}).data,
            resumen={'cantidad': resumen['cantidad'], 'monto_usd': dinero(resumen['monto_usd'])},
            por_responsable=[
                {
                    'usuario': usuario_dict(usuarios.get(g['cajero_id'])),
                    'cantidad': g['cantidad'],
                    'monto_usd': dinero(g['monto_usd']),
                }
                for g in por_cajero
            ],
        )


# ─────────────────────────────────────────────
# Inventario
# ─────────────────────────────────────────────
class ReporteInventarioView(VistaAuditoria):
    """
    GET ?tipo=entrada|salida|ajuste|merma&producto= (paginado; sin tipo = todos).
    `cajero` filtra por el usuario que registró el movimiento y `area` por el
    área del producto. `resumen` ignora el filtro `tipo` para que la UI pueda
    mostrar los cuatro totales a la vez.
    """

    def get(self, request):
        try:
            filtros = filtros_comunes(request)
            tipo = parsear_opcion(request, 'tipo', TIPOS_INVENTARIO)
            producto_id = _entero(request, 'producto')
        except ParametroInvalido as exc:
            return error(str(exc))

        movimientos = MovimientoInventario.objects.filter(
            creado_en__date__gte=filtros['fi'], creado_en__date__lte=filtros['ff'],
        )
        if filtros['area']:
            movimientos = movimientos.filter(producto__area=filtros['area'])
        if filtros['cajero_id'] is not None:
            movimientos = movimientos.filter(usuario_id=filtros['cajero_id'])
        if producto_id is not None:
            movimientos = movimientos.filter(producto_id=producto_id)

        resumen = movimientos.aggregate(**agregados_resumen_inventario())
        if tipo:
            movimientos = movimientos.filter(tipo=tipo)

        paginador = StandardResultsPagination()
        pagina = paginador.paginate_queryset(
            movimientos.select_related('producto', 'usuario').order_by('-creado_en', '-id'),
            request, view=self,
        )
        return respuesta_paginada(
            paginador, MovimientoReporteSerializer(pagina, many=True).data, resumen=resumen,
        )


# ─────────────────────────────────────────────
# Rentabilidad
# ─────────────────────────────────────────────
class ReporteRentabilidadView(VistaAuditoria):
    """
    GET ?agrupar=producto|categoria (por defecto producto)
    Costo = Σ costo_unitario × cantidad (snapshot del detalle). Las líneas sin
    costo se excluyen del costo y de las ventas usadas para el margen, y se
    informan en `unidades_sin_costo` + `advertencia`.
    """

    def get(self, request):
        try:
            filtros = filtros_comunes(request)
            agrupar = parsear_opcion(request, 'agrupar', AGRUPACIONES_RENTABILIDAD, defecto='producto')
        except ParametroInvalido as exc:
            return error(str(exc))

        detalles = detalles_completados(**filtros)
        campo_id, campo_nombre = CAMPOS_LINEA[agrupar]
        grupos = (
            detalles.values(campo_id, campo_nombre)
            .annotate(**agregados_rentabilidad())
            .order_by('-margen_usd', '-ventas_usd', campo_nombre)
        )
        totales = detalles.aggregate(**agregados_rentabilidad())
        return Response({
            'filas': [fila_rentabilidad(g, g[campo_id], g[campo_nombre]) for g in grupos],
            'totales': fila_rentabilidad(totales),
            'advertencia': advertencia_sin_costo(totales['unidades_sin_costo']),
        })
