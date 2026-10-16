"""
Tests de la tasa de cambio propia de Cantina: permiso para cambiarla,
historial inmutable con valor anterior, caída a la tasa BCV cuando no hay
tasa propia y venta que conserva su tasa tras un cambio.
"""
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from cobranza.models import TasaCambio

from .models import AperturaCajaCantina, CategoriaProducto, ProductoCantina, TasaCantina, VentaCantina
from .utils import tasa_cantina_activa

User = get_user_model()

URL_VIGENTE = '/api/cantina/tasa-vigente/'
URL_TASA = '/api/cantina/tasa/'
URL_HISTORIAL = '/api/cantina/tasa/historial/'


def crear_usuario(username, rol, puede_tasa=False):
    user = User.objects.create_user(username=username, password='password123')
    user.perfil.rol = rol
    user.perfil.esta_activo = True
    user.perfil.puede_gestionar_tasa_cantina = puede_tasa
    user.perfil.save()
    return user


class TasaCantinaBase(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.director = crear_usuario('director_tasa', 'director')
        self.cajero = crear_usuario('cajero_tasa', 'cajero')
        self.cajero_autorizado = crear_usuario('cajero_auth_tasa', 'cajero', puede_tasa=True)
        self.bcv = TasaCambio.objects.create(valor_bs=Decimal('40.0000'))


class PermisoTasaTests(TasaCantinaBase):
    def test_cajero_sin_flag_no_puede_cambiar(self):
        self.client.force_authenticate(user=self.cajero)
        resp = self.client.post(URL_TASA, {'valor_bs': '50'}, format='json')
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(TasaCantina.objects.count(), 0)

    def test_cajero_con_flag_puede_cambiar(self):
        self.client.force_authenticate(user=self.cajero_autorizado)
        resp = self.client.post(URL_TASA, {'valor_bs': '50', 'motivo': 'Ajuste'}, format='json')
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)
        self.assertEqual(TasaCantina.objects.get().modificado_por, self.cajero_autorizado)

    def test_director_puede_cambiar(self):
        self.client.force_authenticate(user=self.director)
        resp = self.client.post(URL_TASA, {'valor_bs': '51.25'}, format='json')
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)

    def test_cualquier_cajero_lee_y_puede_editar_refleja_el_permiso(self):
        self.client.force_authenticate(user=self.cajero)
        self.assertFalse(self.client.get(URL_VIGENTE).data['puede_editar'])
        self.client.force_authenticate(user=self.cajero_autorizado)
        self.assertTrue(self.client.get(URL_VIGENTE).data['puede_editar'])
        self.assertEqual(self.client.get(URL_HISTORIAL).status_code, status.HTTP_200_OK)

    def test_valores_invalidos_son_rechazados(self):
        self.client.force_authenticate(user=self.director)
        for valor in ('0', '-5', 'abc', '12345678901'):
            resp = self.client.post(URL_TASA, {'valor_bs': valor}, format='json')
            self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST, valor)
        self.assertEqual(TasaCantina.objects.count(), 0)

    def test_sin_autenticar_es_rechazado(self):
        self.assertIn(self.client.get(URL_VIGENTE).status_code, (401, 403))


class HistorialTasaTests(TasaCantinaBase):
    def test_valor_anterior_y_referencia_bcv(self):
        self.client.force_authenticate(user=self.director)
        self.client.post(URL_TASA, {'valor_bs': '50'}, format='json')
        TasaCambio.objects.create(valor_bs=Decimal('42.0000'))
        self.client.post(URL_TASA, {'valor_bs': '55', 'motivo': 'Mercado'}, format='json')

        primera, segunda = TasaCantina.objects.order_by('id')
        self.assertIsNone(primera.valor_anterior)
        self.assertEqual(primera.tasa_bcv_referencia, Decimal('40.0000'))
        self.assertEqual(segunda.valor_anterior, Decimal('50.0000'))
        self.assertEqual(segunda.tasa_bcv_referencia, Decimal('42.0000'))

        data = self.client.get(URL_HISTORIAL).data
        self.assertEqual(data['count'], 2)
        self.assertEqual(Decimal(data['results'][0]['valor_bs']), Decimal('55'))  # más reciente primero
        self.assertEqual(data['results'][0]['motivo'], 'Mercado')
        self.assertEqual(data['results'][0]['usuario'], self.director.username)

    def test_historial_paginado(self):
        for i in range(5):
            TasaCantina.objects.create(valor_bs=Decimal('50') + i, modificado_por=self.director)
        self.client.force_authenticate(user=self.cajero)
        data = self.client.get(URL_HISTORIAL, {'page_size': 2, 'page': 3}).data
        self.assertEqual(data['num_pages'], 3)
        self.assertEqual(len(data['results']), 1)

    def test_el_historial_es_inmutable(self):
        fila = TasaCantina.objects.create(valor_bs=Decimal('50'), modificado_por=self.director)
        fila.valor_bs = Decimal('60')
        with self.assertRaises(ValueError):
            fila.save()
        with self.assertRaises(ValueError):
            fila.delete()


class FallbackBcvTests(TasaCantinaBase):
    def test_sin_tasa_propia_usa_la_bcv(self):
        tasa = tasa_cantina_activa()
        self.assertEqual(tasa.valor_bs, Decimal('40.0000'))
        self.assertEqual(tasa.fuente, 'bcv')
        self.client.force_authenticate(user=self.cajero)
        data = self.client.get(URL_VIGENTE).data
        self.assertEqual(Decimal(data['valor_bs']), Decimal('40'))
        self.assertEqual(data['fuente'], 'bcv')

    def test_con_tasa_propia_la_bcv_queda_como_referencia(self):
        TasaCantina.objects.create(valor_bs=Decimal('48'), modificado_por=self.director)
        self.client.force_authenticate(user=self.cajero)
        data = self.client.get(URL_VIGENTE).data
        self.assertEqual(Decimal(data['valor_bs']), Decimal('48'))
        self.assertEqual(data['fuente'], 'manual')
        self.assertEqual(Decimal(data['bcv_referencia']), Decimal('40'))

    def test_sin_ninguna_tasa_devuelve_404(self):
        TasaCambio.objects.all().delete()
        self.client.force_authenticate(user=self.cajero)
        self.assertEqual(self.client.get(URL_VIGENTE).status_code, status.HTTP_404_NOT_FOUND)


class VentaConservaTasaTests(TasaCantinaBase):
    def test_venta_pasada_conserva_su_tasa_tras_un_cambio(self):
        categoria = CategoriaProducto.objects.create(nombre='Snacks')
        jugo = ProductoCantina.objects.create(
            nombre='Jugo', categoria=categoria, codigo_barras='7592222222222',
            precio=Decimal('2.00'), stock_actual=10, stock_minimo=1,
        )
        AperturaCajaCantina.objects.create(cajero=self.cajero, monto_inicial=Decimal('0.00'))
        TasaCantina.objects.create(valor_bs=Decimal('50'), modificado_por=self.director)

        self.client.force_authenticate(user=self.cajero)
        payload = {'items': [{'producto_id': jugo.id, 'cantidad': 1}], 'metodo_pago': 'efectivo'}
        resp1 = self.client.post('/api/cantina/ventas/registrar/', payload, format='json')
        self.assertEqual(resp1.status_code, status.HTTP_201_CREATED, resp1.data)
        self.assertEqual(Decimal(resp1.data['total_ves']), Decimal('100.00'))

        TasaCantina.objects.create(valor_bs=Decimal('60'), modificado_por=self.director)
        resp2 = self.client.post('/api/cantina/ventas/registrar/', payload, format='json')
        self.assertEqual(Decimal(resp2.data['total_ves']), Decimal('120.00'))

        v1 = VentaCantina.objects.get(pk=resp1.data['id'])
        self.assertEqual(v1.tasa_aplicada, Decimal('50.0000'))
        self.assertEqual(v1.total_ves, Decimal('100.00'))
