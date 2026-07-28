from django.contrib import admin

from .models import Circular, LecturaCircular, MensajeDirecto


@admin.register(Circular)
class CircularAdmin(admin.ModelAdmin):
    list_display = ('titulo', 'publicado_por', 'fecha_publicacion', 'requiere_confirmacion')
    list_filter = ('requiere_confirmacion', 'fecha_publicacion')
    search_fields = ('titulo', 'cuerpo')


@admin.register(LecturaCircular)
class LecturaCircularAdmin(admin.ModelAdmin):
    list_display = ('circular', 'usuario', 'leido', 'fecha_lectura')
    list_filter = ('leido',)


@admin.register(MensajeDirecto)
class MensajeDirectoAdmin(admin.ModelAdmin):
    list_display = ('alumno', 'remitente_docente', 'remitente_representante', 'leido', 'fecha')
    list_filter = ('leido',)
    search_fields = ('alumno__nombre', 'alumno__apellido', 'cuerpo')
