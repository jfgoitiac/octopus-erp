from django.contrib import admin

from .models import CuotaSolvencia


@admin.register(CuotaSolvencia)
class CuotaSolvenciaAdmin(admin.ModelAdmin):
    list_display = ('alumno', 'periodo_escolar', 'monto_usd', 'pagado', 'fecha_pago')
    list_filter = ('periodo_escolar', 'pagado')
    search_fields = ('alumno__nombre', 'alumno__apellido', 'alumno__cedula_escolar')
    autocomplete_fields = ('alumno',)
