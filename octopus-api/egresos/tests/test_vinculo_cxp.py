"""Reglas del vínculo Egresos <-> Cuentas por Pagar."""
from decimal import Decimal

from django.apps import apps
from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from egresos import services
from egresos.models import Egreso
from finanzas.models import CategoriaGasto, Proveedor


class VinculoCxPTests(TestCase):
    def setUp(self):
        self.hoy = timezone.localdate()
        self.proveedor = Proveedor.objects.create(razon_social='Proveedor vínculo', rif='J-11112222-3')
        self.categoria = CategoriaGasto.objects.create(nombre='Vínculo')
        self.cuenta = {'proveedor': self.proveedor, 'categoria': self.categoria, 'sede': None, 'moneda': 'USD',
                       'tasa_aplicada': Decimal('100'), 'fecha_emision': self.hoy, 'concepto': 'Servicio'}
        self.abonos = [{'fecha_pago': self.hoy, 'moneda': 'USD', 'tasa_aplicada': '100', 'metodo_pago': 'zelle',
                        'monto_documento': '50.00', 'monto_usd': '50.00', 'monto_ves': '5000.00'}]

    def test_app_cuentas_pagar_instalada(self):
        self.assertTrue(apps.is_installed('cuentas_pagar'))
        self.assertIn('abono', services.marcar_pagado(1, []))

    def test_no_reutiliza_egreso_anulado(self):
        primero = services.crear_desde_cuenta_pagada(9001, self.cuenta, self.abonos)['egreso_id']
        services.anular_por_cuenta(9001, 'Reversa')
        segundo = services.crear_desde_cuenta_pagada(9001, self.cuenta, self.abonos)
        self.assertTrue(segundo['creado'])
        self.assertNotEqual(segundo['egreso_id'], primero)
        self.assertEqual(Egreso.objects.get(pk=primero).estado, 'anulado')
        tercero = services.crear_desde_cuenta_pagada(9001, self.cuenta, self.abonos)
        self.assertEqual(tercero['egreso_id'], segundo['egreso_id'])
        self.assertFalse(tercero['creado'])

    def test_no_se_anula_dos_veces(self):
        egreso = Egreso.objects.get(pk=services.crear_desde_cuenta_pagada(9002, self.cuenta, self.abonos)['egreso_id'])
        services.anular(egreso, 'Primera', desde_cuenta=True)
        with self.assertRaises(ValueError):
            services.anular(egreso, 'Segunda', desde_cuenta=True)

    def test_api_no_permite_delete(self):
        usuario = get_user_model().objects.create_user(username='dir-vinculo', password='clave')
        usuario.perfil.rol = 'director'
        usuario.perfil.esta_activo = True
        usuario.perfil.save()
        api = APIClient()
        api.force_authenticate(usuario)
        egreso_id = services.crear_desde_cuenta_pagada(9003, self.cuenta, self.abonos)['egreso_id']
        self.assertEqual(api.delete('/api/egresos/%s/' % egreso_id).status_code, 405)
        self.assertTrue(Egreso.objects.filter(pk=egreso_id).exists())
