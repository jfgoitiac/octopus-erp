"""
Tests de apertura de caja por cajero — AperturaCajaCantinaView (§ apertura
por cajero, no global). El colegio puede tener hasta 3 cajeros vendiendo a
la vez, cada uno con su propia sesión de caja independiente: sigue el mismo
estilo que tests_ventas.py/tests_cierre_caja.py (APIClient +
perfil.rol/perfil.esta_activo).
"""
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from .models import AperturaCajaCantina

User = get_user_model()


def _crear_cajero(username):
    user = User.objects.create_user(username=username, password='password123')
    user.perfil.rol = 'cajero'
    user.perfil.esta_activo = True
    user.perfil.save()
    return user


class AperturaCajaCantinaTestsBase(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.cajero1 = _crear_cajero('cajero_apertura_1')
        self.cajero2 = _crear_cajero('cajero_apertura_2')
        self.cajero3 = _crear_cajero('cajero_apertura_3')
        self.cajero4 = _crear_cajero('cajero_apertura_4')


class AperturaCajaCantinaGetTests(AperturaCajaCantinaTestsBase):
    def test_sin_apertura_devuelve_null(self):
        self.client.force_authenticate(user=self.cajero1)
        resp = self.client.get('/api/cantina/apertura-caja/')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertIsNone(resp.data['apertura'])

    def test_con_apertura_abierta_la_devuelve(self):
        apertura = AperturaCajaCantina.objects.create(cajero=self.cajero1, monto_inicial=Decimal('20.00'))
        self.client.force_authenticate(user=self.cajero1)
        resp = self.client.get('/api/cantina/apertura-caja/')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data['apertura']['id'], apertura.id)
        self.assertEqual(Decimal(resp.data['apertura']['monto_inicial']), Decimal('20.00'))

    def test_no_autenticado_rechazado(self):
        resp = self.client.get('/api/cantina/apertura-caja/')
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)


class AperturaCajaCantinaPostTests(AperturaCajaCantinaTestsBase):
    def test_abrir_caja_crea_apertura(self):
        self.client.force_authenticate(user=self.cajero1)
        resp = self.client.post('/api/cantina/apertura-caja/', {'monto_inicial': '25.00'}, format='json')
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)
        self.assertEqual(resp.data['estado'], 'abierta')
        self.assertEqual(Decimal(resp.data['monto_inicial']), Decimal('25.00'))

        apertura = AperturaCajaCantina.objects.get(pk=resp.data['id'])
        self.assertEqual(apertura.cajero, self.cajero1)
        self.assertEqual(apertura.estado, 'abierta')

    def test_tres_aperturas_simultaneas_son_permitidas(self):
        for cajero in (self.cajero1, self.cajero2, self.cajero3):
            self.client.force_authenticate(user=cajero)
            resp = self.client.post('/api/cantina/apertura-caja/', {'monto_inicial': '10.00'}, format='json')
            self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)

        self.assertEqual(AperturaCajaCantina.objects.filter(estado='abierta').count(), 3)

    def test_una_cuarta_apertura_simultanea_es_rechazada(self):
        for cajero in (self.cajero1, self.cajero2, self.cajero3):
            AperturaCajaCantina.objects.create(cajero=cajero, monto_inicial=Decimal('10.00'))

        self.client.force_authenticate(user=self.cajero4)
        resp = self.client.post('/api/cantina/apertura-caja/', {'monto_inicial': '10.00'}, format='json')

        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('detail', resp.data)
        self.assertEqual(AperturaCajaCantina.objects.filter(estado='abierta').count(), 3)
        self.assertFalse(AperturaCajaCantina.objects.filter(cajero=self.cajero4).exists())

    def test_una_cuarta_apertura_es_posible_tras_cerrar_una_de_las_tres(self):
        aperturas = [
            AperturaCajaCantina.objects.create(cajero=cajero, monto_inicial=Decimal('10.00'))
            for cajero in (self.cajero1, self.cajero2, self.cajero3)
        ]
        aperturas[0].estado = 'cerrada'
        aperturas[0].save(update_fields=['estado'])

        self.client.force_authenticate(user=self.cajero4)
        resp = self.client.post('/api/cantina/apertura-caja/', {'monto_inicial': '10.00'}, format='json')

        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)
        self.assertEqual(AperturaCajaCantina.objects.filter(estado='abierta').count(), 3)

    def test_un_cajero_no_puede_abrir_dos_veces(self):
        self.client.force_authenticate(user=self.cajero1)
        resp1 = self.client.post('/api/cantina/apertura-caja/', {'monto_inicial': '10.00'}, format='json')
        self.assertEqual(resp1.status_code, status.HTTP_201_CREATED, resp1.data)

        resp2 = self.client.post('/api/cantina/apertura-caja/', {'monto_inicial': '5.00'}, format='json')
        self.assertEqual(resp2.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('detail', resp2.data)

        self.assertEqual(AperturaCajaCantina.objects.filter(cajero=self.cajero1, estado='abierta').count(), 1)

    def test_un_cajero_puede_reabrir_tras_cerrar_su_apertura_anterior(self):
        primera = AperturaCajaCantina.objects.create(cajero=self.cajero1, monto_inicial=Decimal('10.00'))
        primera.estado = 'cerrada'
        primera.save(update_fields=['estado'])

        self.client.force_authenticate(user=self.cajero1)
        resp = self.client.post('/api/cantina/apertura-caja/', {'monto_inicial': '5.00'}, format='json')
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)
        self.assertEqual(AperturaCajaCantina.objects.filter(cajero=self.cajero1, estado='abierta').count(), 1)

    def test_sin_monto_inicial_es_rechazado(self):
        self.client.force_authenticate(user=self.cajero1)
        resp = self.client.post('/api/cantina/apertura-caja/', {}, format='json')
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('detail', resp.data)

    def test_monto_inicial_negativo_es_rechazado(self):
        self.client.force_authenticate(user=self.cajero1)
        resp = self.client.post('/api/cantina/apertura-caja/', {'monto_inicial': '-5.00'}, format='json')
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_no_autenticado_rechazado(self):
        resp = self.client.post('/api/cantina/apertura-caja/', {'monto_inicial': '10.00'}, format='json')
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)


class AperturaCajaCantinaAislamientoTests(AperturaCajaCantinaTestsBase):
    """
    Cierre de caja de UN cajero no debe afectar las sesiones abiertas de
    los otros — 3 cajeros con caja abierta simultáneamente, cerrar la de
    uno no debe tocar ni cambiar el estado de las otras dos.
    """
    def test_cerrar_la_apertura_de_un_cajero_no_afecta_las_de_los_otros_dos(self):
        apertura1 = AperturaCajaCantina.objects.create(cajero=self.cajero1, monto_inicial=Decimal('10.00'))
        apertura2 = AperturaCajaCantina.objects.create(cajero=self.cajero2, monto_inicial=Decimal('20.00'))
        apertura3 = AperturaCajaCantina.objects.create(cajero=self.cajero3, monto_inicial=Decimal('30.00'))

        self.client.force_authenticate(user=self.cajero1)
        resp = self.client.post('/api/cantina/cierre-caja/', {'conteo_fisico': '10.00'}, format='json')
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)

        apertura1.refresh_from_db()
        apertura2.refresh_from_db()
        apertura3.refresh_from_db()

        self.assertEqual(apertura1.estado, 'cerrada')
        self.assertEqual(apertura2.estado, 'abierta')
        self.assertEqual(apertura3.estado, 'abierta')

        # Y cada una de las otras dos sigue disponible para que su cajero
        # la use/cierre normalmente — no quedaron huérfanas ni bloqueadas.
        self.client.force_authenticate(user=self.cajero2)
        resp2 = self.client.get('/api/cantina/apertura-caja/')
        self.assertEqual(resp2.data['apertura']['id'], apertura2.id)

        self.client.force_authenticate(user=self.cajero3)
        resp3 = self.client.get('/api/cantina/apertura-caja/')
        self.assertEqual(resp3.data['apertura']['id'], apertura3.id)
