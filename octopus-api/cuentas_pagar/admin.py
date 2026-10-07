from django.contrib import admin

from .models import (AplazamientoCxP, AvisoBandeja, ComprobantePagoCxP, ConfiguracionRecordatorios,
                     CuentaPorPagar, CuotaCuentaPagar, HistorialCxP, PagoCuentaPagar,
                     PlantillaRecurrente, RecordatorioEnviado)


@admin.register(CuentaPorPagar)
class CuentaPorPagarAdmin(admin.ModelAdmin):
    list_display = ('numero', 'proveedor', 'concepto', 'fecha_vencimiento', 'moneda', 'saldo', 'estado')
    list_filter = ('estado', 'origen', 'moneda', 'sede')
    search_fields = ('numero', 'concepto', 'proveedor__razon_social')


@admin.register(PagoCuentaPagar)
class PagoCuentaPagarAdmin(admin.ModelAdmin):
    list_display = ('id', 'cuenta', 'fecha_pago', 'monto_pagado', 'moneda', 'estado', 'metodo_pago')
    list_filter = ('estado', 'moneda', 'metodo_pago')


admin.site.register((CuotaCuentaPagar, ComprobantePagoCxP, AplazamientoCxP, PlantillaRecurrente,
                     ConfiguracionRecordatorios, RecordatorioEnviado, AvisoBandeja, HistorialCxP))
