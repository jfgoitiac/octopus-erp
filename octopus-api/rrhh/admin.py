from django.contrib import admin
from .models import Empleado, TipoCargo


@admin.register(TipoCargo)
class TipoCargoAdmin(admin.ModelAdmin):
    list_display = ('nombre', 'descripcion', 'activo')
    list_filter = ('activo',)
    search_fields = ('nombre',)

@admin.register(Empleado)
class EmpleadoAdmin(admin.ModelAdmin):
    list_display = ('cedula', 'nombre', 'apellido', 'cargo', 'sueldo_base', 'activo', 'fecha_contratacion')
    list_filter = ('activo', 'cargo')
    search_fields = ('cedula', 'nombre', 'apellido', 'cargo')
    ordering = ('apellido', 'nombre')
