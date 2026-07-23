from django.contrib import admin

from .models import CuotaSolvencia


@admin.register(CuotaSolvencia)
class CuotaSolvenciaAdmin(admin.ModelAdmin):
    list_display = ('alumno', 'periodo_escolar', 'monto_usd', 'monto_pagado', 'pagado', 'fecha_pago')
    list_filter = ('periodo_escolar', 'pagado')
    search_fields = ('alumno__nombre', 'alumno__apellido', 'alumno__cedula_escolar')
    autocomplete_fields = ('alumno',)
    # pagado/fecha_pago se derivan solos en CuotaSolvencia.save() a partir de
    # monto_pagado vs monto_usd — no deben editarse a mano ni desde el admin,
    # o quedarían desincronizados otra vez.
    readonly_fields = ('pagado', 'fecha_pago')
