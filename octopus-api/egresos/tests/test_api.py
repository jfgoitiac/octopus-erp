from decimal import Decimal

from django.test import TestCase

from egresos.models import Egreso
from egresos.services import guardar_contado
from finanzas.models import CategoriaGasto, Proveedor


class SnapshotsContadoTests(TestCase):
    def test_registro_contado_guarda_snapshots_de_pago_para_tablero(self):
        categoria = CategoriaGasto.objects.create(nombre='Prueba')
        proveedor = Proveedor.objects.create(razon_social='Proveedor', rif='J-12345678-9')
        egreso = Egreso.objects.create(
            proveedor=proveedor, categoria=categoria, moneda='VES', tasa_aplicada=Decimal('100'),
            total_documento=Decimal('0'), fecha_egreso='2026-10-07',
            porcentaje_iva=Decimal('16'), retiene_iva=True, porcentaje_retencion_iva=Decimal('75'),
        )
        guardar_contado(egreso, {
            'renglones': [{'cantidad': '10', 'precio_unitario': '500', 'descuento': '0'}],
            'moneda': 'VES', 'tasa_aplicada': '100', 'porcentaje_iva': '16',
            'retiene_iva': True, 'porcentaje_retencion_iva': '75',
        })
        egreso.refresh_from_db()
        # 5.000 + IVA 800 - retención IVA 600 = desembolso de 5.200 VES.
        self.assertEqual(egreso.monto_ves_pagado, Decimal('5200.00'))
        self.assertEqual(egreso.monto_usd_pagado, Decimal('52.00'))

    def test_descuento_mayor_al_renglon_es_rechazado(self):
        categoria = CategoriaGasto.objects.create(nombre='Prueba dos')
        proveedor = Proveedor.objects.create(razon_social='Proveedor dos', rif='J-12345678-8')
        egreso = Egreso.objects.create(proveedor=proveedor, categoria=categoria, moneda='USD', tasa_aplicada=Decimal('100'), total_documento=Decimal('0'), fecha_egreso='2026-10-07')
        with self.assertRaises(ValueError):
            guardar_contado(egreso, {'renglones': [{'cantidad': '1', 'precio_unitario': '5', 'descuento': '6'}], 'moneda': 'USD', 'tasa_aplicada': '100'})
