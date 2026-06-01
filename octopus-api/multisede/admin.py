from django.contrib import admin
from .models import Sede, PermisoSede


@admin.register(Sede)
class SedeAdmin(admin.ModelAdmin):
    list_display  = ['nombre', 'municipio', 'estado', 'activa', 'fecha_creacion']
    list_filter   = ['activa', 'estado']
    search_fields = ['nombre', 'rif', 'municipio']


@admin.register(PermisoSede)
class PermisoSedeAdmin(admin.ModelAdmin):
    list_display  = ['user', 'sede', 'rol', 'activo', 'fecha_asignacion']
    list_filter   = ['rol', 'activo', 'sede']
    search_fields = ['user__username', 'sede__nombre']
