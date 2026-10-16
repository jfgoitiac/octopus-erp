"""
Serializers y helpers de los reportes de la Auditoría de Cantina — carril B3.
Formas exactas de CONTRATO_AUDITORIA_CANTINA.md §4.

Todo agregado se calcula en la base de datos (`annotate`/`aggregate`); aquí
solo se da forma a filas ya agregadas. La representación de usuario, turno,
montos y fechas reutiliza los helpers comunes de `serializers_cierres`.
"""
from decimal import Decimal

from django.db.models import (
    Count, DecimalField, ExpressionWrapper, F, Func, IntegerField, Q, Sum, Value,
)
from django.db.models.functions import Coalesce, NullIf
from rest_framework import serializers

from cantina.models import DetalleVentaCantina, MovimientoInventario, VentaCantina

from .serializers_cierres import dinero, fecha_hora, turno_dict, usuario_dict

CERO = Decimal('0.00')
CIEN = Decimal('100')
# Precisión amplia para el prorrateo del descuento por línea (se redondea al final).
_DECIMAL_FINO = DecimalField(max_digits=20, decimal_places=6)

AGRUPACIONES_VENTAS = ('producto', 'categoria', 'turno', 'responsable', 'dia')
AGRUPACIONES_RENTABILIDAD = ('producto', 'categoria')
TIPOS_EXCEPCION = ('anulaciones', 'descuentos', 'manuales')
TIPOS_INVENTARIO = tuple(clave for clave, _ in MovimientoInventario.TIPOS)

# Clave de las ventas sin apertura (anteriores a la apertura por cajero).
CLAVE_SIN_TURNO = 'sin_turno'


# ─────────────────────────────────────────────
# Expresiones de BD
# ─────────────────────────────────────────────
class _NoEntero(Func):
    """
    Deja pasar la expresión tal cual, salvo en SQLite: allí un decimal sin
    parte fraccionaria se guarda como INTEGER y `3 * 1 / 5` da 0. Se convierte
    a REAL antes de dividir; PostgreSQL conserva `numeric` exacto.
    """
    template = '%(expressions)s'

    def as_sqlite(self, compiler, connection, **extra):
        return super().as_sql(compiler, connection, template='CAST(%(expressions)s AS REAL)', **extra)


def _cero():
    return Value(CERO, output_field=_DECIMAL_FINO)


def suma_dinero(expresion, filtro=None):
    """Sum de montos que nunca devuelve NULL (grupo vacío → 0.00)."""
    return Coalesce(Sum(expresion, filter=filtro, output_field=_DECIMAL_FINO), _cero(), output_field=_DECIMAL_FINO)


def suma_entera(campo, filtro=None):
    return Coalesce(Sum(campo, filter=filtro), Value(0), output_field=IntegerField())


def descuento_linea(prefijo_venta='venta__'):
    """
    Parte del descuento de la venta que le toca a una línea del detalle,
    prorrateada por su peso en el bruto: subtotal × descuento / (neto + descuento).
    El descuento vive en la venta (`total_usd` ya es neto), así que es la única
    forma de llevar montos netos a nivel de producto o categoría.
    """
    p = prefijo_venta
    bruto = NullIf(
        ExpressionWrapper(F(f'{p}total_usd') + F(f'{p}descuento_usd'), output_field=_DECIMAL_FINO),
        _cero(),
    )
    return Coalesce(
        ExpressionWrapper(
            _NoEntero(F('subtotal') * F(f'{p}descuento_usd'), output_field=_DECIMAL_FINO) / bruto,
            output_field=_DECIMAL_FINO,
        ),
        _cero(),
        output_field=_DECIMAL_FINO,
    )


def neto_linea():
    """Subtotal de la línea menos su parte del descuento."""
    return ExpressionWrapper(F('subtotal') - descuento_linea(), output_field=_DECIMAL_FINO)


def costo_linea():
    """costo_unitario × cantidad (NULL si la línea no tiene costo)."""
    return ExpressionWrapper(F('costo_unitario') * F('cantidad'), output_field=_DECIMAL_FINO)


# ─────────────────────────────────────────────
# Querysets filtrados (filtros comunes de §4)
# ─────────────────────────────────────────────
def ventas_filtradas(fi, ff, area=None, cajero_id=None):
    """Ventas creadas en el rango (fecha local), sin filtrar por estado."""
    ventas = VentaCantina.objects.filter(creado_en__date__gte=fi, creado_en__date__lte=ff)
    if area:
        ventas = ventas.filter(area=area)
    if cajero_id is not None:
        ventas = ventas.filter(cajero_id=cajero_id)
    return ventas


def detalles_completados(fi, ff, area=None, cajero_id=None):
    """Líneas de detalle de ventas completadas con los mismos filtros."""
    detalles = DetalleVentaCantina.objects.filter(
        venta__estado='completada',
        venta__creado_en__date__gte=fi, venta__creado_en__date__lte=ff,
    )
    if area:
        detalles = detalles.filter(venta__area=area)
    if cajero_id is not None:
        detalles = detalles.filter(venta__cajero_id=cajero_id)
    return detalles


# ─────────────────────────────────────────────
# §4 Ventas
# ─────────────────────────────────────────────
def fila_ventas(clave, etiqueta, cantidad, ventas, total, descuento):
    return {
        'clave': str(clave),
        'etiqueta': etiqueta,
        'cantidad': int(cantidad or 0),
        'ventas': int(ventas or 0),
        'total_usd': dinero(total or CERO),
        'descuento_usd': dinero(descuento or CERO),
    }


def agregados_ventas_por_linea():
    """Agregados de `reportes/ventas/` cuando el grano es la línea de detalle."""
    return {
        'cantidad': suma_entera('cantidad'),
        'ventas': Count('venta', distinct=True),
        'total_usd': suma_dinero(neto_linea()),
        'descuento_usd': suma_dinero(descuento_linea()),
    }


def agregados_ventas_por_venta():
    """Agregados de `reportes/ventas/` cuando el grano es la venta."""
    return {
        'ventas': Count('id'),
        'total_usd': suma_dinero('total_usd'),
        'descuento_usd': suma_dinero('descuento_usd'),
    }


# ─────────────────────────────────────────────
# §4 Excepciones
# ─────────────────────────────────────────────
def monto_excepcion(tipo):
    """Qué se suma en `monto_usd`: el descuento otorgado o el total de la venta."""
    return 'descuento_usd' if tipo == 'descuentos' else 'total_usd'


class ExcepcionVentaSerializer(serializers.ModelSerializer):
    """
    Fila de `reportes/excepciones/`. Espera ventas con `cajero`, `apertura` y
    `anulada_por` en `select_related`. `motivo` depende del tipo de reporte
    (contexto `tipo`): anulación, descuento o vacío para las manuales.
    """
    venta_id = serializers.IntegerField(source='id', read_only=True)
    fecha_hora = serializers.SerializerMethodField()
    cajero = serializers.SerializerMethodField()
    turno = serializers.SerializerMethodField()
    total_usd = serializers.SerializerMethodField()
    descuento_usd = serializers.SerializerMethodField()
    motivo = serializers.SerializerMethodField()
    anulada_por = serializers.SerializerMethodField()

    class Meta:
        model = VentaCantina
        fields = (
            'venta_id', 'fecha_hora', 'cajero', 'turno', 'metodo_pago', 'total_usd', 'descuento_usd',
            'motivo', 'anulada_por', 'origen_producto', 'origen_alumno',
        )
        read_only_fields = fields

    def get_fecha_hora(self, obj):
        return fecha_hora(obj.creado_en)

    def get_cajero(self, obj):
        return usuario_dict(obj.cajero)

    def get_turno(self, obj):
        return turno_dict(obj.apertura)

    def get_total_usd(self, obj):
        return dinero(obj.total_usd)

    def get_descuento_usd(self, obj):
        return dinero(obj.descuento_usd)

    def get_motivo(self, obj):
        if self.context.get('tipo') == 'anulaciones':
            return obj.motivo_anulacion
        return obj.motivo_descuento or ''

    def get_anulada_por(self, obj):
        return usuario_dict(obj.anulada_por)


# ─────────────────────────────────────────────
# §4 Inventario
# ─────────────────────────────────────────────
def agregados_resumen_inventario():
    """Σ cantidad por tipo en una sola consulta (el ajuste conserva su signo)."""
    return {tipo: suma_entera('cantidad', Q(tipo=tipo)) for tipo in TIPOS_INVENTARIO}


class MovimientoReporteSerializer(serializers.ModelSerializer):
    """Fila de `reportes/inventario/`. Espera `producto` y `usuario` en `select_related`."""
    fecha_hora = serializers.SerializerMethodField()
    producto = serializers.SerializerMethodField()
    usuario = serializers.SerializerMethodField()
    venta_id = serializers.IntegerField(read_only=True, allow_null=True)

    class Meta:
        model = MovimientoInventario
        fields = (
            'id', 'fecha_hora', 'producto', 'tipo', 'cantidad', 'stock_antes', 'stock_despues',
            'motivo', 'usuario', 'venta_id',
        )
        read_only_fields = fields

    def get_fecha_hora(self, obj):
        return fecha_hora(obj.creado_en)

    def get_producto(self, obj):
        return {'id': obj.producto_id, 'nombre': obj.producto.nombre}

    def get_usuario(self, obj):
        return usuario_dict(obj.usuario)


# ─────────────────────────────────────────────
# §4 Rentabilidad
# ─────────────────────────────────────────────
def agregados_rentabilidad():
    """
    Ventas y costo solo de las líneas con costo (snapshot); las líneas sin
    costo se cuentan aparte en `unidades_sin_costo`.
    """
    con_costo = Q(costo_unitario__isnull=False)
    return {
        'unidades': suma_entera('cantidad'),
        'ventas_usd': suma_dinero(neto_linea(), con_costo),
        'costo_usd': suma_dinero(costo_linea(), con_costo),
        'margen_usd': suma_dinero(
            ExpressionWrapper(neto_linea() - costo_linea(), output_field=_DECIMAL_FINO), con_costo,
        ),
        'unidades_sin_costo': suma_entera('cantidad', Q(costo_unitario__isnull=True)),
    }


def margen_pct(margen, ventas):
    """margen / ventas × 100 con 2 decimales; null si no hay ventas con costo."""
    if not ventas:
        return None
    return dinero(Decimal(str(margen)) / Decimal(str(ventas)) * CIEN)


def fila_rentabilidad(datos, clave=None, etiqueta=None):
    """Fila (con clave) o totales (sin clave) de `reportes/rentabilidad/`."""
    ventas = datos.get('ventas_usd') or CERO
    margen = datos.get('margen_usd') or CERO
    fila = {}
    if clave is not None:
        fila = {'clave': str(clave), 'etiqueta': etiqueta, 'unidades': int(datos.get('unidades') or 0)}
    fila.update({
        'ventas_usd': dinero(ventas),
        'costo_usd': dinero(datos.get('costo_usd') or CERO),
        'margen_usd': dinero(margen),
        'margen_pct': margen_pct(margen, ventas),
        'unidades_sin_costo': int(datos.get('unidades_sin_costo') or 0),
    })
    return fila


def advertencia_sin_costo(unidades):
    if not unidades:
        return None
    if unidades == 1:
        return '1 unidad vendida no tiene costo registrado y se excluye del margen.'
    return f'{unidades} unidades vendidas no tienen costo registrado y se excluyen del margen.'
