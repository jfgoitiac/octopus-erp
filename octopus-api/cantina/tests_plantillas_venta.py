"""Tests de plantillas de venta (combos del POS) de cantina/librería."""
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from .models import CategoriaProducto, PlantillaVenta, ProductoCantina

User = get_user_model()
URL = '/api/cantina/plantillas-venta/'


class PlantillasVentaTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.cajero = User.objects.create_user(username='cajero_plantillas', password='password123')
        self.cajero.perfil.rol = 'cajero'
        self.cajero.perfil.esta_activo = True
        self.cajero.perfil.save()
        self.client.force_authenticate(self.cajero)

        cat = CategoriaProducto.objects.create(nombre='Snacks')
        cat_lib = CategoriaProducto.objects.create(nombre='Útiles', area='libreria')
        self.jugo = ProductoCantina.objects.create(nombre='Jugo', categoria=cat, precio=Decimal('1.50'), stock_actual=10)
        self.empanada = ProductoCantina.objects.create(nombre='Empanada', categoria=cat, precio=Decimal('1.00'), stock_actual=10)
        self.cuaderno = ProductoCantina.objects.create(
            nombre='Cuaderno', categoria=cat_lib, precio=Decimal('2.00'), stock_actual=10, area='libreria',
        )

    def _payload(self, **extra):
        data = {
            'nombre': 'Combo desayuno', 'area': 'cantina',
            'items': [{'producto': self.jugo.id, 'cantidad': 1}, {'producto': self.empanada.id, 'cantidad': 2}],
        }
        data.update(extra)
        return data

    def test_crear_y_listar_con_total(self):
        resp = self.client.post(URL, self._payload(), format='json')
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)
        self.assertEqual(Decimal(resp.data['total_usd']), Decimal('3.50'))
        lista = self.client.get(URL, {'area': 'cantina'})
        self.assertEqual(len(lista.data), 1)
        self.assertEqual(len(lista.data[0]['items']), 2)
        self.assertEqual(len(self.client.get(URL, {'area': 'libreria'}).data), 0)

    def test_rechaza_producto_de_otra_area(self):
        resp = self.client.post(
            URL, self._payload(items=[{'producto': self.cuaderno.id, 'cantidad': 1}]), format='json',
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_rechaza_nombre_duplicado_y_sin_items(self):
        self.client.post(URL, self._payload(), format='json')
        self.assertEqual(self.client.post(URL, self._payload(nombre='combo DESAYUNO'), format='json').status_code, 400)
        self.assertEqual(self.client.post(URL, self._payload(nombre='Otro', items=[]), format='json').status_code, 400)

    def test_editar_reemplaza_items_y_eliminar(self):
        pk = self.client.post(URL, self._payload(), format='json').data['id']
        resp = self.client.put(
            f'{URL}{pk}/', {'items': [{'producto': self.jugo.id, 'cantidad': 3}]}, format='json',
        )
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(Decimal(resp.data['total_usd']), Decimal('4.50'))
        self.assertEqual(self.client.delete(f'{URL}{pk}/').status_code, 204)
        self.assertFalse(PlantillaVenta.objects.exists())

    def test_requiere_autenticacion(self):
        self.assertIn(APIClient().get(URL).status_code, (401, 403))
