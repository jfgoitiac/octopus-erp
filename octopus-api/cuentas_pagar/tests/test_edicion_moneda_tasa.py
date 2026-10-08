from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from finanzas.models import CategoriaGasto, Proveedor
from cuentas_pagar.models import CuentaPorPagar, PagoCuentaPagar


class EdicionMonedaTasaTests(TestCase):
    def setUp(self):
        u = get_user_model().objects.create_user(username='dir-moneda', password='clave')
        u.perfil.rol = 'director'; u.perfil.esta_activo = True; u.perfil.save()
        self.api = APIClient(); self.api.force_authenticate(u)
        hoy = timezone.localdate()
        self.cuenta = CuentaPorPagar.objects.create(
            proveedor=Proveedor.objects.create(razon_social='P moneda', rif='J-12345678-7'),
            categoria=CategoriaGasto.objects.create(nombre='Moneda'), concepto='c', moneda='USD',
            tasa_aplicada=Decimal('100'), monto_documento=Decimal('10'), saldo=Decimal('10'),
            fecha_emision=hoy, fecha_vencimiento=hoy + timedelta(days=10))
        self.url = f'/api/cuentas-por-pagar/{self.cuenta.id}/'

    def _pago(self, estado):
        PagoCuentaPagar.objects.create(cuenta=self.cuenta, fecha_pago=timezone.localdate(), moneda='USD',
            tasa_aplicada=Decimal('100'), monto_pagado=Decimal('1'), monto_aplicado=Decimal('1'), estado=estado)

    def test_con_pago_valido_rechaza_moneda_y_tasa(self):
        self._pago('valido')
        for campo, valor in (('moneda', 'VES'), ('tasa_aplicada', '120.0000')):
            r = self.api.patch(self.url, {campo: valor}, format='json')
            self.assertEqual(r.status_code, 400, campo)
            self.assertIn(campo, r.data['campos'])
            self.assertIn('confirmar-monto', str(r.data['campos'][campo]))

    def test_con_pago_por_aprobar_rechaza(self):
        self._pago('por_aprobar')
        self.assertEqual(self.api.patch(self.url, {'tasa_aplicada': '120'}, format='json').status_code, 400)

    def test_mismo_valor_con_pagos_no_falla(self):
        self._pago('valido')
        self.assertEqual(self.api.patch(self.url, {'tasa_aplicada': '100'}, format='json').status_code, 200)

    def test_pago_anulado_no_bloquea(self):
        self._pago('anulado')
        self.assertEqual(self.api.patch(self.url, {'tasa_aplicada': '120'}, format='json').status_code, 200)

    def test_sin_pagos_recalcula_snapshots_y_saldo(self):
        r = self.api.patch(self.url, {'tasa_aplicada': '120'}, format='json')
        self.assertEqual(r.status_code, 200, r.data)
        self.cuenta.refresh_from_db()
        self.assertEqual((self.cuenta.monto_usd, self.cuenta.monto_ves, self.cuenta.saldo),
                         (Decimal('10.00'), Decimal('1200.00'), Decimal('10.00')))
        r = self.api.patch(self.url, {'moneda': 'VES', 'tasa_aplicada': '100'}, format='json')
        self.assertEqual(r.status_code, 200, r.data)
        self.cuenta.refresh_from_db()
        self.assertEqual((self.cuenta.monto_ves, self.cuenta.monto_usd, self.cuenta.saldo),
                         (Decimal('10.00'), Decimal('0.10'), Decimal('10.00')))
