"""Generación idempotente de cuentas recurrentes."""
import calendar
from datetime import date

from django.db import IntegrityError
from django.utils import timezone

from finanzas.monedas import tasa_para_fecha
from .models import CuentaPorPagar, PlantillaRecurrente


def _fecha(anio, mes, dia):
    return date(anio, mes, min(max(dia, 1), calendar.monthrange(anio, mes)[1]))


def generar_cuentas_recurrentes(hoy=None):
    """Crea a lo sumo una cuenta por plantilla y período actual."""
    hoy = hoy or timezone.localdate()
    periodo = hoy.strftime('%Y-%m')
    generadas = []
    for plantilla in PlantillaRecurrente.objects.filter(activa=True).select_related('proveedor', 'categoria', 'sede'):
        if CuentaPorPagar.objects.filter(plantilla=plantilla, periodo=periodo).exists():
            continue
        emision = _fecha(hoy.year, hoy.month, plantilla.dia_emision)
        vencimiento = _fecha(hoy.year, hoy.month, plantilla.dia_vencimiento)
        if vencimiento < emision:
            vencimiento = emision
        try:
            tasa = tasa_para_fecha(emision).valor_bs
        except Exception:
            # Una plantilla en USD no depende de la tasa para determinar su monto,
            # pero el snapshot sí; se pospone hasta que Finanzas publique BCV.
            continue
        cuenta = CuentaPorPagar(
            origen='recurrente', proveedor=plantilla.proveedor, categoria=plantilla.categoria,
            sede=plantilla.sede, concepto=plantilla.concepto, moneda=plantilla.moneda,
            monto_documento=plantilla.monto, tasa_aplicada=tasa, fecha_emision=emision,
            fecha_vencimiento=vencimiento, plantilla=plantilla, periodo=periodo,
            notas=plantilla.notas, creado_por=plantilla.creado_por,
        )
        cuenta.actualizar_snapshots()
        cuenta.saldo = cuenta.monto_documento
        try:
            cuenta.save()
        except IntegrityError:
            continue
        generadas.append(cuenta)
    return generadas
