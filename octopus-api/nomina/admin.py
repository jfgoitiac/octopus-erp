from django.contrib import admin
from .models import Empleado, ConceptoNomina, ParametroLegalNomina, RegistroNomina

admin.site.register(Empleado)
admin.site.register(ConceptoNomina)
admin.site.register(ParametroLegalNomina)


@admin.register(RegistroNomina)
class RegistroNominaAdmin(admin.ModelAdmin):
	list_display = ('empleado', 'mes_correspondiente', 'anio_correspondiente', 'total_pagar_ves')
	list_filter = ('anio_correspondiente', 'mes_correspondiente')
	search_fields = ('empleado__cedula', 'empleado__nombre', 'empleado__apellido')
