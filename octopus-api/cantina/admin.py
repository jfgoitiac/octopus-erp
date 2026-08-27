from django.contrib import admin

from .models import (
    AperturaCajaCantina,
    CategoriaProducto,
    CierreCajaCantina,
    DetalleVentaCantina,
    HistorialCodigoTarjeta,
    LoteTarjetas,
    MovimientoInventario,
    MovimientoTarjeta,
    ParametroCantina,
    ProductoCantina,
    RecargaTarjeta,
    TarjetaPrepago,
    VentaCantina,
)


@admin.register(ParametroCantina)
class ParametroCantinaAdmin(admin.ModelAdmin):
    list_display = ('limite_credito_default', 'dias_alerta_saldo_negativo')


@admin.register(LoteTarjetas)
class LoteTarjetasAdmin(admin.ModelAdmin):
    list_display = ('id', 'cantidad', 'generado_por', 'creado_en')
    list_filter = ('creado_en',)


@admin.register(TarjetaPrepago)
class TarjetaPrepagoAdmin(admin.ModelAdmin):
    list_display = ('serial', 'codigo', 'alumno', 'estado', 'saldo', 'limite_credito', 'saldo_negativo_desde')
    list_filter = ('estado',)
    search_fields = ('serial', 'codigo', 'alumno__nombre', 'alumno__apellido', 'alumno__cedula_escolar')
    autocomplete_fields = ('alumno',)


@admin.register(HistorialCodigoTarjeta)
class HistorialCodigoTarjetaAdmin(admin.ModelAdmin):
    list_display = ('tarjeta', 'codigo_anterior', 'motivo', 'usuario', 'creado_en')
    list_filter = ('motivo',)


@admin.register(MovimientoTarjeta)
class MovimientoTarjetaAdmin(admin.ModelAdmin):
    list_display = ('tarjeta', 'tipo', 'monto', 'saldo_antes', 'saldo_despues', 'creado_en')
    list_filter = ('tipo',)


@admin.register(RecargaTarjeta)
class RecargaTarjetaAdmin(admin.ModelAdmin):
    list_display = ('tarjeta', 'metodo_pago', 'monto_usd', 'monto_ves', 'estatus', 'registrado_por_portal', 'creado_en')
    list_filter = ('estatus', 'metodo_pago', 'registrado_por_portal')


@admin.register(CategoriaProducto)
class CategoriaProductoAdmin(admin.ModelAdmin):
    list_display = ('nombre', 'orden')


@admin.register(ProductoCantina)
class ProductoCantinaAdmin(admin.ModelAdmin):
    list_display = ('nombre', 'categoria', 'codigo_barras', 'precio', 'stock_actual', 'stock_minimo', 'activo')
    list_filter = ('categoria', 'activo')
    search_fields = ('nombre', 'codigo_barras')


@admin.register(MovimientoInventario)
class MovimientoInventarioAdmin(admin.ModelAdmin):
    list_display = ('producto', 'tipo', 'cantidad', 'stock_antes', 'stock_despues', 'creado_en')
    list_filter = ('tipo',)


class DetalleVentaCantinaInline(admin.TabularInline):
    model = DetalleVentaCantina
    extra = 0


@admin.register(VentaCantina)
class VentaCantinaAdmin(admin.ModelAdmin):
    list_display = ('id', 'alumno', 'cajero', 'metodo_pago', 'total_usd', 'total_ves', 'estado', 'creado_en')
    list_filter = ('metodo_pago', 'estado')
    search_fields = ('alumno__nombre', 'alumno__apellido')
    inlines = (DetalleVentaCantinaInline,)


@admin.register(AperturaCajaCantina)
class AperturaCajaCantinaAdmin(admin.ModelAdmin):
    list_display = ('cajero', 'fecha_hora_apertura', 'monto_inicial', 'estado', 'cerrada_en')
    list_filter = ('estado',)


@admin.register(CierreCajaCantina)
class CierreCajaCantinaAdmin(admin.ModelAdmin):
    list_display = ('cajero', 'fecha', 'total_ventas', 'total_tarjeta', 'total_efectivo', 'total_recargas_efectivo', 'diferencia')
    list_filter = ('fecha',)
