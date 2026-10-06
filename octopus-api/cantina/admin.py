from django.contrib import admin

from .models import (
    AbonoCantina,
    AperturaCajaCantina,
    AplicacionAbonoCantina,
    CargoCantina,
    CategoriaProducto,
    CierreCajaCantina,
    CreditoRepresentanteCantina,
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
    list_display = ('limite_credito_default', 'limite_credito_representante_default', 'dias_alerta_saldo_negativo')


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
    list_display = ('nombre', 'orden', 'area')
    list_filter = ('area',)


@admin.register(ProductoCantina)
class ProductoCantinaAdmin(admin.ModelAdmin):
    list_display = ('nombre', 'area', 'categoria', 'codigo_barras', 'precio', 'stock_actual', 'stock_minimo', 'activo')
    list_filter = ('area', 'categoria', 'activo')
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
    list_display = ('id', 'area', 'alumno', 'representante', 'cajero', 'metodo_pago', 'total_usd', 'total_ves', 'estado', 'creado_en')
    list_filter = ('area', 'metodo_pago', 'estado')
    search_fields = ('alumno__nombre', 'alumno__apellido', 'representante__nombre', 'representante__apellido', 'representante__cedula')
    inlines = (DetalleVentaCantinaInline,)


@admin.register(AperturaCajaCantina)
class AperturaCajaCantinaAdmin(admin.ModelAdmin):
    list_display = ('cajero', 'area', 'fecha_hora_apertura', 'monto_inicial', 'estado', 'cerrada_en')
    list_filter = ('area', 'estado')


@admin.register(CierreCajaCantina)
class CierreCajaCantinaAdmin(admin.ModelAdmin):
    list_display = ('cajero', 'area', 'fecha', 'total_ventas', 'total_tarjeta', 'total_efectivo', 'total_recargas_efectivo', 'diferencia')
    list_filter = ('area', 'fecha')


# ─────────────────────────────────────────────
# Cuentas por cobrar a representantes (CxC)
# ─────────────────────────────────────────────
@admin.register(CreditoRepresentanteCantina)
class CreditoRepresentanteCantinaAdmin(admin.ModelAdmin):
    list_display = ('representante', 'limite_usd', 'bloqueado', 'actualizado_en')
    list_filter = ('bloqueado',)
    search_fields = ('representante__cedula', 'representante__nombre', 'representante__apellido')
    raw_id_fields = ('representante',)


@admin.register(CargoCantina)
class CargoCantinaAdmin(admin.ModelAdmin):
    list_display = ('id', 'representante', 'alumno', 'area', 'monto_usd', 'monto_pagado', 'estado', 'creado_en')
    list_filter = ('area', 'estado')
    search_fields = ('representante__cedula', 'representante__nombre', 'representante__apellido')
    raw_id_fields = ('representante', 'alumno', 'venta')


@admin.register(AbonoCantina)
class AbonoCantinaAdmin(admin.ModelAdmin):
    list_display = ('id', 'operacion_uuid', 'representante', 'area', 'metodo_pago', 'monto_usd', 'estatus', 'es_retroactivo', 'fecha_pago')
    list_filter = ('area', 'metodo_pago', 'estatus', 'es_retroactivo')
    search_fields = ('representante__cedula', 'representante__nombre', 'representante__apellido', 'referencia')
    raw_id_fields = ('representante', 'apertura')


@admin.register(AplicacionAbonoCantina)
class AplicacionAbonoCantinaAdmin(admin.ModelAdmin):
    list_display = ('abono', 'cargo', 'monto_usd')
    raw_id_fields = ('abono', 'cargo')
