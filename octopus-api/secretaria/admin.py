from django.contrib import admin
from .models import Representante, Alumno

@admin.register(Representante)
class RepresentanteAdmin(admin.ModelAdmin):
    list_display = ('cedula', 'nombre', 'apellido', 'telefono', 'correo')
    search_fields = ('cedula', 'nombre', 'apellido')

@admin.register(Alumno)
class AlumnoAdmin(admin.ModelAdmin):
    list_display = ('cedula_escolar', 'nombre', 'apellido', 'grado_seccion', 'estatus_financiero')
    list_filter = ('grado_seccion', 'estatus_financiero')
    search_fields = ('cedula_escolar', 'nombre', 'apellido')
