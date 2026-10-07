from django.contrib import admin
from .models import CategoriaGasto, PresupuestoCategoria, Proveedor


@admin.register(CategoriaGasto)
class CategoriaGastoAdmin(admin.ModelAdmin):
    list_display = ('nombre', 'padre', 'activa', 'orden')
    list_filter = ('activa',)
    search_fields = ('nombre',)


@admin.register(Proveedor)
class ProveedorAdmin(admin.ModelAdmin):
    list_display = ('razon_social', 'rif', 'telefono', 'condicion_habitual', 'activo')
    list_filter = ('activo', 'condicion_habitual')
    search_fields = ('razon_social', 'rif', 'nombre_comercial')


@admin.register(PresupuestoCategoria)
class PresupuestoCategoriaAdmin(admin.ModelAdmin):
    list_display = ('categoria', 'sede', 'anio', 'mes', 'moneda', 'monto')
    list_filter = ('anio', 'mes', 'moneda', 'sede')
