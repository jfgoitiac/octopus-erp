from django.contrib import admin

from .models import ConfiguracionFirmante, ConstanciaEmitida, PlantillaConstancia


@admin.register(ConfiguracionFirmante)
class ConfiguracionFirmanteAdmin(admin.ModelAdmin):
    list_display = ('nombre', 'cedula', 'nacionalidad', 'cargo', 'estampado_global_activo', 'actualizado_en')
    list_filter = ('estampado_global_activo',)
    search_fields = ('nombre', 'cedula')


@admin.register(PlantillaConstancia)
class PlantillaConstanciaAdmin(admin.ModelAdmin):
    list_display = ('nombre', 'tipo', 'destinatario', 'anexo_habilitado', 'permite_estampado', 'activa')
    list_filter = ('tipo', 'destinatario', 'activa')
    search_fields = ('nombre',)


@admin.register(ConstanciaEmitida)
class ConstanciaEmitidaAdmin(admin.ModelAdmin):
    list_display = ('numero', 'tipo', 'alumno', 'trabajador', 'periodo_escolar', 'salio_firmada', 'fecha_emision')
    list_filter = ('tipo', 'periodo_escolar', 'salio_firmada')
    search_fields = ('numero',)
    readonly_fields = ('numero', 'fecha_emision')
