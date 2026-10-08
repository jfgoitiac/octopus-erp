from datetime import date
from decimal import Decimal
from unittest.mock import patch

from django.test import TestCase

from finanzas.models import CategoriaGasto, Proveedor
from cuentas_pagar.models import CuentaPorPagar, PlantillaRecurrente
from cuentas_pagar.recurrentes import generar_cuentas_recurrentes


class RecurrentesTests(TestCase):
    def setUp(self):
        categoria = CategoriaGasto.objects.create(nombre='Prueba recurrente')
        proveedor = Proveedor.objects.create(razon_social='Proveedor recurrente', rif='J-12345678-2')
        self.plantilla = PlantillaRecurrente.objects.create(proveedor=proveedor, categoria=categoria, nombre='Internet', concepto='Internet', moneda='USD', monto=Decimal('10'), dia_emision=1, dia_vencimiento=5)

    @patch('cuentas_pagar.recurrentes.tasa_para_fecha')
    def test_unica_por_periodo(self, tasa):
        tasa.return_value.valor_bs = Decimal('100')
        hoy = date(2026, 10, 7)
        self.assertEqual(len(generar_cuentas_recurrentes(hoy)), 1)
        self.assertEqual(len(generar_cuentas_recurrentes(hoy)), 0)
        self.assertEqual(CuentaPorPagar.objects.filter(plantilla=self.plantilla, periodo='2026-10').count(), 1)
