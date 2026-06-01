from django.contrib import admin
from simple_history.admin import SimpleHistoryAdmin
from .models import Nota, Asistencia, Materia, Lapso, HorarioClase


@admin.register(Nota)
class NotaAdmin(SimpleHistoryAdmin):
    list_display = ('alumno', 'materia', 'lapso', 'definitiva', 'aprobado')
    list_filter = ('lapso', 'materia__grado_seccion')
    search_fields = ('alumno__nombre', 'alumno__apellido')


@admin.register(Asistencia)
class AsistenciaAdmin(SimpleHistoryAdmin):
    list_display = ('alumno', 'fecha', 'presente', 'justificada', 'registrado_por')
    list_filter = ('fecha', 'presente', 'justificada')
    search_fields = ('alumno__nombre', 'alumno__apellido')


@admin.register(Materia)
class MateriaAdmin(admin.ModelAdmin):
    list_display = ('nombre', 'grado_seccion', 'codigo', 'docente', 'activa')
    list_filter = ('grado_seccion', 'activa')
    search_fields = ('nombre', 'codigo')


@admin.register(Lapso)
class LapsoAdmin(admin.ModelAdmin):
    list_display = ('nombre', 'periodo_escolar', 'fecha_inicio', 'fecha_fin', 'activo')
    list_filter = ('periodo_escolar', 'activo')


@admin.register(HorarioClase)
class HorarioClaseAdmin(admin.ModelAdmin):
    list_display = ('materia', 'dia_semana', 'hora_inicio', 'hora_fin', 'aula')
    list_filter = ('dia_semana', 'materia__grado_seccion')
