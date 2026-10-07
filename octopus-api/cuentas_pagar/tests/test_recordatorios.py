from datetime import date, timedelta
from decimal import Decimal

from django.test import TestCase

from finanzas.models import CategoriaGasto, Proveedor
from cuentas_pagar.models import CuentaPorPagar, RecordatorioEnviado
from cuentas_pagar.recordatorios import procesar_recordatorios


class RecordatoriosTests(TestCase):
    def setUp(self):
        categoria = CategoriaGasto.objects.create(nombre='Prueba recordatorios')
        proveedor = Proveedor.objects.create(razon_social='Proveedor prueba', rif='J-12345678-1')
        self.hoy = date(2026, 10, 7)
        self.cuenta = CuentaPorPagar.objects.create(
            proveedor=proveedor, categoria=categoria, concepto='Servicio', moneda='USD',
            tasa_aplicada=Decimal('100'), monto_documento=Decimal('10'), saldo=Decimal('10'),
            fecha_emision=self.hoy, fecha_vencimiento=self.hoy + timedelta(days=7),
        )

    def test_no_duplica_recordatorio_en_misma_fecha(self):
        procesar_recordatorios(self.hoy)
        procesar_recordatorios(self.hoy)
        self.assertEqual(RecordatorioEnviado.objects.filter(cuenta=self.cuenta, canal='bandeja').count(), 1)

    def test_omite_cuenta_pagada_y_pospuesta(self):
        self.cuenta.estado = 'pagada'; self.cuenta.save()
        self.assertEqual(procesar_recordatorios(self.hoy), 0)
        self.cuenta.estado = 'pendiente'; self.cuenta.recordatorio_pospuesto_hasta = self.hoy + timedelta(days=1); self.cuenta.save()
        self.assertEqual(procesar_recordatorios(self.hoy), 0)
