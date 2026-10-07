from django.contrib import admin
from .models import (ArticuloFrecuente, BitacoraEgreso, ComprobanteEgreso, ConfiguracionEgresos,
                     DetallePagoCuentaPorPagar, Egreso, RenglonEgreso)


class RenglonEgresoInline(admin.TabularInline):
    model = RenglonEgreso
    extra = 0


class ComprobanteEgresoInline(admin.TabularInline):
    model = ComprobanteEgreso
    extra = 0


@admin.register(Egreso)
class EgresoAdmin(admin.ModelAdmin):
    list_display = ('id', 'proveedor', 'numero_documento', 'fecha_egreso', 'moneda', 'total_documento', 'estado', 'origen')
    list_filter = ('estado', 'origen', 'moneda', 'sede')
    search_fields = ('numero_documento', 'numero_control', 'proveedor__razon_social')
    autocomplete_fields = ('proveedor', 'categoria', 'sede')
    inlines = (RenglonEgresoInline, ComprobanteEgresoInline)


@admin.register(ArticuloFrecuente)
class ArticuloFrecuenteAdmin(admin.ModelAdmin):
    list_display = ('nombre', 'proveedor', 'categoria', 'unidad', 'activo')
    list_filter = ('activo', 'categoria')
    search_fields = ('nombre',)


@admin.register(BitacoraEgreso)
class BitacoraEgresoAdmin(admin.ModelAdmin):
    list_display = ('egreso', 'accion', 'usuario', 'fecha')
    readonly_fields = ('egreso', 'accion', 'usuario', 'fecha', 'antes', 'despues')


@admin.register(DetallePagoCuentaPorPagar)
class DetallePagoCuentaPorPagarAdmin(admin.ModelAdmin):
    list_display = ('egreso', 'fecha_pago', 'monto_usd', 'monto_ves', 'metodo_pago', 'referencia')


@admin.register(ConfiguracionEgresos)
class ConfiguracionEgresosAdmin(admin.ModelAdmin):
    list_display = ('fiscal_activo', 'umbral_alerta_variacion', 'alicuota_iva_default', 'alicuota_igtf_default')
