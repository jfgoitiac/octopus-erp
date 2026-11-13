"""
Tests de la tasa de cambio de Cantina: alterna de forma auditable entre BCV y
una tasa manual, y cada operación conserva la tasa con la que se registró.
"""
from datetime import timedelta
from decimal import Decimal
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import TestCase
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from cobranza.models import TasaCambio

from .models import AperturaCajaCantina, CategoriaProducto, ProductoCantina, TasaCantina, VentaCantina
from .utils import tasa_cantina_activa

User = get_user_model()

URL_VIGENTE = '/api/cantina/tasa-vigente/'
URL_MANUAL = '/api/cantina/tasa/'
URL_RESTABLECER = '/api/cantina/tasa/restablecer-bcv/'


def crear_usuario(username, rol):
    user = User.objects.create_user(username=username, password='password123')
    user.perfil.rol = rol
    user.perfil.esta_activo = True
    user.perfil.save()
    return user


class TasaCantinaBase(TestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient()
        self.director = crear_usuario('director_tasa', 'director')
        self.cajero = crear_usuario('cajero_tasa', 'cajero')
        self.bcv = TasaCambio.objects.create(valor_bs=Decimal('40.0000'))


class TasaBcvTests(TasaCantinaBase):
    def test_cantina_usa_la_tasa_bcv(self):
        self.assertEqual(tasa_cantina_activa().valor_bs, Decimal('40.0000'))
        self.client.force_authenticate(user=self.cajero)
        data = self.client.get(URL_VIGENTE).data
        self.assertEqual(Decimal(data['valor_bs']), Decimal('40'))
        self.assertEqual(data['fuente'], 'bcv')
        self.assertFalse(data['personalizada_activa'])
        self.assertEqual(Decimal(data['tasa_bcv']), Decimal('40'))
        self.assertFalse(data['puede_gestionar'])

    def test_una_tasa_manual_es_la_tasa_activa(self):
        TasaCantina.objects.create(valor_bs=Decimal('48'), modificado_por=self.director)
        self.client.force_authenticate(user=self.cajero)
        data = self.client.get(URL_VIGENTE).data
        self.assertEqual(Decimal(data['valor_bs']), Decimal('48'))
        self.assertEqual(data['fuente'], 'manual')
        self.assertTrue(data['personalizada_activa'])

    def test_toma_la_bcv_mas_reciente(self):
        TasaCambio.objects.create(valor_bs=Decimal('42.5000'))
        self.assertEqual(tasa_cantina_activa().valor_bs, Decimal('42.5000'))

    def test_sin_tasa_intenta_sincronizar_con_el_bcv(self):
        TasaCambio.objects.all().delete()
        self.client.force_authenticate(user=self.cajero)

        def sincronizar():
            TasaCambio.objects.create(valor_bs=Decimal('41.0000'))

        with patch('cobranza.tasks.sincronizar_tasa_con_blindaje', side_effect=sincronizar):
            resp = self.client.get(URL_VIGENTE)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(Decimal(resp.data['valor_bs']), Decimal('41'))

    def test_sin_tasa_y_sin_sincronizacion_devuelve_404(self):
        TasaCambio.objects.all().delete()
        self.client.force_authenticate(user=self.cajero)
        with patch('cobranza.tasks.sincronizar_tasa_con_blindaje', return_value=None):
            resp = self.client.get(URL_VIGENTE)
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)
        self.assertFalse(resp.data['puede_gestionar'])

    def test_director_puede_activar_manual_si_bcv_no_esta_disponible(self):
        TasaCambio.objects.all().delete()
        self.client.force_authenticate(user=self.director)
        with patch('cobranza.tasks.sincronizar_tasa_con_blindaje', return_value=None):
            resp = self.client.get(URL_VIGENTE)
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)
        self.assertTrue(resp.data['puede_gestionar'])

        activada = self.client.post(URL_MANUAL, {
            'valor_bs': '50', 'motivo': 'Contingencia por caída del BCV',
        }, format='json')
        self.assertEqual(activada.status_code, status.HTTP_201_CREATED, activada.data)
        self.assertEqual(tasa_cantina_activa().valor_bs, Decimal('50'))

    def test_tasa_de_hoy_no_consulta_al_bcv(self):
        self.client.force_authenticate(user=self.cajero)
        with patch('cobranza.tasks.sincronizar_tasa_con_blindaje') as sincronizar:
            self.client.get(URL_VIGENTE)
        sincronizar.assert_not_called()

    def test_tasa_vieja_se_sincroniza_y_devuelve_la_nueva(self):
        TasaCambio.objects.update(fecha=timezone.now() - timedelta(days=5))
        self.client.force_authenticate(user=self.cajero)

        def sincronizar():
            TasaCambio.objects.create(valor_bs=Decimal('45.0000'))

        with patch('cobranza.tasks.sincronizar_tasa_con_blindaje', side_effect=sincronizar):
            resp = self.client.get(URL_VIGENTE)
        self.assertEqual(Decimal(resp.data['valor_bs']), Decimal('45'))

    def test_tasa_vieja_sin_cambios_reintenta_como_mucho_una_vez_por_hora(self):
        TasaCambio.objects.update(fecha=timezone.now() - timedelta(days=2))
        self.client.force_authenticate(user=self.cajero)
        with patch('cobranza.tasks.sincronizar_tasa_con_blindaje', return_value=None) as sincronizar:
            primera = self.client.get(URL_VIGENTE)
            segunda = self.client.get(URL_VIGENTE)
        self.assertEqual(sincronizar.call_count, 1)
        self.assertEqual(Decimal(primera.data['valor_bs']), Decimal('40'))
        self.assertEqual(segunda.status_code, status.HTTP_200_OK)

    def test_sin_autenticar_es_rechazado(self):
        self.assertIn(self.client.get(URL_VIGENTE).status_code, (401, 403))

    def test_director_puede_fijar_una_tasa_propia(self):
        self.client.force_authenticate(user=self.director)
        resp = self.client.post(URL_MANUAL, {
            'valor_bs': '50', 'motivo': 'Tasa de la jornada',
        }, format='json')
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)
        self.assertEqual(TasaCantina.objects.count(), 1)
        self.assertEqual(tasa_cantina_activa().valor_bs, Decimal('50'))
        self.assertTrue(resp.data['personalizada_activa'])

    def test_cajero_sin_permiso_no_puede_cambiar_tasa(self):
        self.client.force_authenticate(user=self.cajero)
        resp = self.client.post(URL_MANUAL, {
            'valor_bs': '50', 'motivo': 'Intento no autorizado',
        }, format='json')
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)
        self.assertFalse(TasaCantina.objects.exists())

    def test_cajero_con_permiso_delegado_puede_cambiar_tasa(self):
        self.cajero.perfil.puede_gestionar_tasa_cantina = True
        self.cajero.perfil.save(update_fields=['puede_gestionar_tasa_cantina'])
        self.client.force_authenticate(user=self.cajero)
        resp = self.client.post(URL_MANUAL, {
            'valor_bs': '47.2500', 'motivo': 'Autorizada por dirección',
        }, format='json')
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)
        self.assertEqual(tasa_cantina_activa().valor_bs, Decimal('47.2500'))

    def test_tasa_manual_exige_valor_positivo_y_motivo(self):
        self.client.force_authenticate(user=self.director)
        resp = self.client.post(URL_MANUAL, {'valor_bs': '0', 'motivo': '  '}, format='json')
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('valor_bs', resp.data)
        self.assertIn('motivo', resp.data)
        self.assertFalse(TasaCantina.objects.exists())

    def test_restaurar_bcv_agrega_historial_y_sigue_actualizaciones(self):
        self.client.force_authenticate(user=self.director)
        self.client.post(URL_MANUAL, {
            'valor_bs': '50', 'motivo': 'Prueba manual',
        }, format='json')
        resp = self.client.post(URL_RESTABLECER, {}, format='json')
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.data)
        self.assertEqual(TasaCantina.objects.count(), 2)
        self.assertEqual(TasaCantina.objects.first().fuente, 'bcv')
        self.assertEqual(tasa_cantina_activa().valor_bs, Decimal('40'))

        TasaCambio.objects.create(valor_bs=Decimal('42.5000'))
        self.assertEqual(tasa_cantina_activa().valor_bs, Decimal('42.5000'))

    def test_restaurar_sin_bcv_no_cambia_el_modo(self):
        self.client.force_authenticate(user=self.director)
        self.client.post(URL_MANUAL, {
            'valor_bs': '50', 'motivo': 'Prueba manual',
        }, format='json')
        TasaCambio.objects.all().delete()
        with patch('cobranza.tasks.sincronizar_tasa_con_blindaje', return_value=None):
            resp = self.client.post(URL_RESTABLECER, {}, format='json')
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(TasaCantina.objects.count(), 1)
        self.assertEqual(tasa_cantina_activa().valor_bs, Decimal('50'))


class HistorialTasaPropiaTests(TasaCantinaBase):
    def test_el_historial_sigue_siendo_inmutable(self):
        fila = TasaCantina.objects.create(valor_bs=Decimal('50'), modificado_por=self.director)
        fila.valor_bs = Decimal('60')
        with self.assertRaises(ValueError):
            fila.save()
        with self.assertRaises(ValueError):
            fila.delete()


class VentaConservaTasaTests(TasaCantinaBase):
    def test_venta_pasada_conserva_su_tasa_tras_un_cambio_de_la_bcv(self):
        categoria = CategoriaProducto.objects.create(nombre='Snacks')
        jugo = ProductoCantina.objects.create(
            nombre='Jugo', categoria=categoria, codigo_barras='7592222222222',
            precio=Decimal('2.00'), stock_actual=10, stock_minimo=1,
        )
        AperturaCajaCantina.objects.create(cajero=self.cajero, monto_inicial=Decimal('0.00'))
        TasaCambio.objects.create(valor_bs=Decimal('50.0000'))

        self.client.force_authenticate(user=self.cajero)
        payload = {'items': [{'producto_id': jugo.id, 'cantidad': 1}], 'metodo_pago': 'efectivo'}
        resp1 = self.client.post('/api/cantina/ventas/registrar/', payload, format='json')
        self.assertEqual(resp1.status_code, status.HTTP_201_CREATED, resp1.data)
        self.assertEqual(Decimal(resp1.data['total_ves']), Decimal('100.00'))

        TasaCambio.objects.create(valor_bs=Decimal('60.0000'))
        resp2 = self.client.post('/api/cantina/ventas/registrar/', payload, format='json')
        self.assertEqual(Decimal(resp2.data['total_ves']), Decimal('120.00'))

        v1 = VentaCantina.objects.get(pk=resp1.data['id'])
        self.assertEqual(v1.tasa_aplicada, Decimal('50.0000'))
        self.assertEqual(v1.total_ves, Decimal('100.00'))
