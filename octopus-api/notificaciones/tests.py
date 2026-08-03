"""
Tests del módulo de Notificaciones — Fase 6 (Web Push).

Cubren:
  - Suscribirse crea una SuscripcionPush ligada al representante autenticado.
  - Resuscribirse con el mismo endpoint reactiva/reasigna en vez de duplicar
    (endpoint es unique).
  - Desuscribirse marca activa=False sin borrar el registro.
  - Actualizar tipos activos aplica a todas las suscripciones activas del
    representante autenticado.
  - enviar_push marca la suscripción inactiva ante un 410 (Gone) del navegador.
"""
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from portal.models import RepresentanteUser, asignar_rol_portal
from secretaria.models import Representante

from .models import SuscripcionPush

User = get_user_model()


def crear_representante_con_portal(cedula, correo, esta_activo=True):
    rep = Representante.objects.create(
        cedula=cedula, nombre='Maria', apellido='Gonzalez',
        telefono='04141234567', correo=correo, direccion='Av. Principal',
    )
    user = User.objects.create_user(username=cedula, password='clave-segura-123', email=correo)
    rep_user = RepresentanteUser.objects.create(representante=rep, user=user, esta_activo=esta_activo)
    asignar_rol_portal(user)
    return rep, user, rep_user


class SuscripcionPushTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        _, self.user, self.rep_user = crear_representante_con_portal('V5555', 'rep5@example.com')
        self.payload = {
            'endpoint': 'https://fcm.googleapis.com/fcm/send/abc123',
            'keys': {'p256dh': 'clave-p256dh', 'auth': 'clave-auth'},
        }

    def test_suscribir_crea_suscripcion_para_el_representante_autenticado(self):
        self.client.force_authenticate(user=self.user)
        resp = self.client.post('/api/portal/notificaciones/push/suscribir/', self.payload, format='json')
        self.assertEqual(resp.status_code, 201, resp.content)

        suscripcion = SuscripcionPush.objects.get(endpoint=self.payload['endpoint'])
        self.assertEqual(suscripcion.usuario_portal, self.rep_user)
        self.assertTrue(suscripcion.activa)
        self.assertEqual(suscripcion.tipos_activos, ['circular', 'nota', 'factura', 'mensaje'])

    def test_suscribir_sin_keys_rechaza(self):
        self.client.force_authenticate(user=self.user)
        resp = self.client.post(
            '/api/portal/notificaciones/push/suscribir/',
            {'endpoint': self.payload['endpoint']}, format='json',
        )
        self.assertEqual(resp.status_code, 400)
        self.assertFalse(SuscripcionPush.objects.exists())

    def test_resuscribir_mismo_endpoint_reactiva_en_vez_de_duplicar(self):
        self.client.force_authenticate(user=self.user)
        self.client.post('/api/portal/notificaciones/push/suscribir/', self.payload, format='json')
        SuscripcionPush.objects.filter(endpoint=self.payload['endpoint']).update(activa=False)

        resp = self.client.post('/api/portal/notificaciones/push/suscribir/', self.payload, format='json')
        self.assertEqual(resp.status_code, 201, resp.content)
        self.assertEqual(SuscripcionPush.objects.filter(endpoint=self.payload['endpoint']).count(), 1)
        self.assertTrue(SuscripcionPush.objects.get(endpoint=self.payload['endpoint']).activa)

    def test_desuscribir_marca_inactiva_sin_borrar(self):
        self.client.force_authenticate(user=self.user)
        self.client.post('/api/portal/notificaciones/push/suscribir/', self.payload, format='json')

        resp = self.client.delete(
            '/api/portal/notificaciones/push/desuscribir/',
            {'endpoint': self.payload['endpoint']}, format='json',
        )
        self.assertEqual(resp.status_code, 204)
        suscripcion = SuscripcionPush.objects.get(endpoint=self.payload['endpoint'])
        self.assertFalse(suscripcion.activa)

    def test_desuscribir_de_otro_representante_no_afecta(self):
        self.client.force_authenticate(user=self.user)
        self.client.post('/api/portal/notificaciones/push/suscribir/', self.payload, format='json')

        _, otro_user, _ = crear_representante_con_portal('V6666', 'rep6@example.com')
        self.client.force_authenticate(user=otro_user)
        resp = self.client.delete(
            '/api/portal/notificaciones/push/desuscribir/',
            {'endpoint': self.payload['endpoint']}, format='json',
        )
        self.assertEqual(resp.status_code, 404)
        self.assertTrue(SuscripcionPush.objects.get(endpoint=self.payload['endpoint']).activa)

    def test_actualizar_tipos_aplica_a_suscripciones_activas_del_representante(self):
        self.client.force_authenticate(user=self.user)
        self.client.post('/api/portal/notificaciones/push/suscribir/', self.payload, format='json')

        resp = self.client.patch(
            '/api/portal/notificaciones/push/tipos/',
            {'tipos': ['circular', 'mensaje']}, format='json',
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        suscripcion = SuscripcionPush.objects.get(endpoint=self.payload['endpoint'])
        self.assertEqual(suscripcion.tipos_activos, ['circular', 'mensaje'])

    def test_get_estado_sin_suscripcion_activa(self):
        self.client.force_authenticate(user=self.user)
        resp = self.client.get('/api/portal/notificaciones/push/suscribir/')
        self.assertEqual(resp.status_code, 200, resp.content)
        self.assertEqual(resp.data, {'activa': False, 'tipos_activos': []})

    def test_get_estado_con_suscripcion_activa(self):
        self.client.force_authenticate(user=self.user)
        self.client.post('/api/portal/notificaciones/push/suscribir/', self.payload, format='json')
        resp = self.client.get('/api/portal/notificaciones/push/suscribir/')
        self.assertEqual(resp.status_code, 200, resp.content)
        self.assertTrue(resp.data['activa'])
        self.assertEqual(resp.data['tipos_activos'], ['circular', 'nota', 'factura', 'mensaje'])

    def test_actualizar_tipos_invalidos_rechaza(self):
        self.client.force_authenticate(user=self.user)
        resp = self.client.patch(
            '/api/portal/notificaciones/push/tipos/',
            {'tipos': ['circular', 'algo_invalido']}, format='json',
        )
        self.assertEqual(resp.status_code, 400)


class EnviarPushTests(TestCase):
    def setUp(self):
        _, self.user, self.rep_user = crear_representante_con_portal('V7777', 'rep7@example.com')
        self.suscripcion = SuscripcionPush.objects.create(
            usuario_portal=self.rep_user,
            endpoint='https://fcm.googleapis.com/fcm/send/expirado',
            p256dh='clave-p256dh', auth='clave-auth',
        )

    def test_enviar_push_marca_inactiva_ante_410(self):
        from pywebpush import WebPushException

        class RespuestaFalsa:
            status_code = 410

        with patch('pywebpush.webpush', side_effect=WebPushException('gone', response=RespuestaFalsa())):
            from .services import enviar_push
            resultado = enviar_push(self.suscripcion, 'Título', 'Cuerpo')

        self.assertFalse(resultado)
        self.suscripcion.refresh_from_db()
        self.assertFalse(self.suscripcion.activa)

    def test_enviar_push_exitoso_no_desactiva(self):
        with patch('pywebpush.webpush', return_value=None):
            from .services import enviar_push
            resultado = enviar_push(self.suscripcion, 'Título', 'Cuerpo')

        self.assertTrue(resultado)
        self.suscripcion.refresh_from_db()
        self.assertTrue(self.suscripcion.activa)
