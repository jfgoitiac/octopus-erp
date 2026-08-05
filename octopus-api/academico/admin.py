from django.contrib import admin
from simple_history.admin import SimpleHistoryAdmin
from .models import (
    Nota, Asistencia, Materia, Lapso, HorarioClase, IncidenteDisciplinario, MaterialEstudio, EventoCalendario,
    PlanEvaluacion, BloqueEvaluacion, ItemEvaluacion, NotaItemEvaluacion,
)


@admin.register(Nota)
class NotaAdmin(SimpleHistoryAdmin):
    list_display = ('alumno', 'materia', 'lapso', 'definitiva', 'aprobado')
    list_filter = ('lapso', 'materia__grado_seccion')
    search_fields = ('alumno__nombre', 'alumno__apellido')


@admin.register(Asistencia)
class AsistenciaAdmin(SimpleHistoryAdmin):
    list_display = ('alumno', 'fecha', 'estado', 'presente', 'justificada', 'registrado_por')
    list_filter = ('fecha', 'estado', 'presente', 'justificada')
    search_fields = ('alumno__nombre', 'alumno__apellido')


@admin.register(IncidenteDisciplinario)
class IncidenteDisciplinarioAdmin(admin.ModelAdmin):
    list_display = ('alumno', 'fecha', 'severidad', 'registrado_por')
    list_filter = ('severidad', 'fecha')
    search_fields = ('alumno__nombre', 'alumno__apellido', 'descripcion')


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


@admin.register(MaterialEstudio)
class MaterialEstudioAdmin(admin.ModelAdmin):
    list_display = ('titulo', 'materia', 'publicado_por', 'fecha')
    list_filter = ('materia__grado_seccion',)
    search_fields = ('titulo', 'materia__nombre')


@admin.register(EventoCalendario)
class EventoCalendarioAdmin(admin.ModelAdmin):
    list_display = ('titulo', 'propietario', 'fecha', 'hora', 'tipo')
    list_filter = ('tipo', 'fecha')
    search_fields = ('titulo', 'propietario__username')


class BloqueEvaluacionInline(admin.TabularInline):
    model = BloqueEvaluacion
    extra = 0


@admin.register(PlanEvaluacion)
class PlanEvaluacionAdmin(admin.ModelAdmin):
    list_display = ('materia', 'lapso', 'creado_en')
    list_filter = ('lapso', 'materia__grado_seccion')
    inlines = [BloqueEvaluacionInline]


class ItemEvaluacionInline(admin.TabularInline):
    model = ItemEvaluacion
    extra = 0


@admin.register(BloqueEvaluacion)
class BloqueEvaluacionAdmin(admin.ModelAdmin):
    list_display = ('nombre', 'plan', 'modo', 'total_puntos', 'orden')
    list_filter = ('modo',)
    inlines = [ItemEvaluacionInline]


@admin.register(ItemEvaluacion)
class ItemEvaluacionAdmin(admin.ModelAdmin):
    list_display = ('nombre', 'bloque', 'fecha', 'valor_maximo', 'orden')


@admin.register(NotaItemEvaluacion)
class NotaItemEvaluacionAdmin(admin.ModelAdmin):
    list_display = ('alumno', 'item', 'valor_numerico', 'valor_letra')
    search_fields = ('alumno__nombre', 'alumno__apellido')
