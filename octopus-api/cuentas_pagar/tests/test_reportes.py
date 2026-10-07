from datetime import date, timedelta
from decimal import Decimal

from django.test import TestCase

from finanzas.models import CategoriaGasto, Proveedor
from cuentas_pagar.models import CuentaPorPagar
from cuentas_pagar.reportes import proyeccion, reporte


class ReportesTests(TestCase):
    def setUp(self):
        categoria = CategoriaGasto.objects.create(nombre='Prueba informes')
        proveedor = Proveedor.objects.create(razon_social='Proveedor informes', rif='J-12345678-3')
        hoy = date(2026, 10, 7)
        self.cuenta = CuentaPorPagar.objects.create(proveedor=proveedor, categoria=categoria, concepto='Deuda', moneda='USD', tasa_aplicada=Decimal('100'), monto_documento=Decimal('10'), monto_usd=Decimal('10'), monto_ves=Decimal('1000'), saldo=Decimal('10'), fecha_emision=hoy-timedelta(days=60), fecha_vencimiento=hoy-timedelta(days=31))

    def test_antiguedad_y_proyeccion(self):
        edades = reporte('antiguedad-saldos', corte='2026-10-07')
        self.assertEqual(edades[0]['rango'], '31-60')
        self.assertTrue(proyeccion())
