from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from finanzas.models import CategoriaGasto, Proveedor
from cuentas_pagar.models import CuentaPorPagar, PlantillaRecurrente
from cuentas_pagar.filters import filtrar_por_situacion


def _lista(data):
    return data['results'] if isinstance(data, dict) and 'results' in data else data


class FiltrosYErroresTests(TestCase):
    def setUp(self):
        u = get_user_model().objects.create_user(username='dir-filtros', password='clave')
        u.perfil.rol = 'director'; u.perfil.esta_activo = True; u.perfil.save()
        self.api = APIClient(); self.api.force_authenticate(u)
        self.cat = CategoriaGasto.objects.create(nombre='Filtros')
        self.prov = Proveedor.objects.create(razon_social='Prov filtros', rif='J-12345678-5')
        self.otro = Proveedor.objects.create(razon_social='Otro prov', rif='J-12345678-6')
        self.hoy = timezone.localdate()
        self.cuentas = {}
        for nombre, dias in (('vencida', -3), ('vence_hoy', 0), ('por_vencer', 4), ('al_dia', 30)):
            self.cuentas[nombre] = self._cuenta(nombre, dias)

    def _cuenta(self, concepto, dias, estado='pendiente'):
        return CuentaPorPagar.objects.create(proveedor=self.prov, categoria=self.cat, concepto=concepto, moneda='USD',
            tasa_aplicada=Decimal('100'), monto_documento=Decimal('10'), monto_usd=Decimal('10'), monto_ves=Decimal('1000'),
            saldo=Decimal('10'), fecha_emision=self.hoy - timedelta(days=40), fecha_vencimiento=self.hoy + timedelta(days=dias), estado=estado)

    def test_filtro_situacion_queryset(self):
        for nombre, cuenta in self.cuentas.items():
            ids = list(filtrar_por_situacion(CuentaPorPagar.objects.all(), nombre).values_list('id', flat=True))
            self.assertEqual(ids, [cuenta.id], nombre)
        self.assertFalse(filtrar_por_situacion(CuentaPorPagar.objects.all(), 'inexistente').exists())

    def test_situacion_excluye_pagadas(self):
        self._cuenta('pagada vieja', -10, estado='pagada')
        self.assertEqual(filtrar_por_situacion(CuentaPorPagar.objects.all(), 'vencida').count(), 1)

    def test_filtro_situacion_api(self):
        r = self.api.get('/api/cuentas-por-pagar/', {'situacion': 'vencida'})
        self.assertEqual(r.status_code, 200)
        self.assertEqual([c['id'] for c in _lista(r.data)], [self.cuentas['vencida'].id])

    def test_filtros_plantillas(self):
        base = dict(categoria=self.cat, concepto='x', moneda='USD', monto=Decimal('5'))
        a = PlantillaRecurrente.objects.create(proveedor=self.prov, nombre='A', activa=True, **base)
        PlantillaRecurrente.objects.create(proveedor=self.otro, nombre='B', activa=False, **base)

        def ids(**p):
            r = self.api.get('/api/cuentas-por-pagar/plantillas/', p)
            self.assertEqual(r.status_code, 200)
            return [x['id'] for x in _lista(r.data)]
        self.assertEqual(ids(activa='true'), [a.id])
        self.assertEqual(len(ids(activa='false')), 1)
        self.assertEqual(ids(proveedor=self.prov.id), [a.id])

    def test_error_validacion_normalizado(self):
        r = self.api.post('/api/cuentas-por-pagar/', {}, format='json')
        self.assertEqual(r.status_code, 400)
        self.assertIn('detalle', r.data)
        self.assertIsInstance(r.data['campos'], dict)

    def test_404_normalizado(self):
        r = self.api.get('/api/cuentas-por-pagar/999999/')
        self.assertEqual(r.status_code, 404)
        self.assertEqual(list(r.data.keys()), ['detalle'])

    def test_no_autenticado_normalizado(self):
        r = APIClient().get('/api/cuentas-por-pagar/')
        self.assertIn(r.status_code, (401, 403))
        self.assertIn('detalle', r.data)

    def test_otras_rutas_conservan_formato_drf(self):
        r = APIClient().get('/api/dashboard/')
        self.assertNotIn('detalle', getattr(r, 'data', None) or {})
