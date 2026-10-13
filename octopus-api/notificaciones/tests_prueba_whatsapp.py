"""
Tests del envío de prueba de WhatsApp con Meta (POST /api/notificaciones/probar/).

Cubren:
  - Con proveedor Meta la prueba sale como la plantilla 'hello_world' (no
    texto libre, que Meta descarta fuera de la ventana de 24h).
  - Si Meta rechaza el envío, el log y la respuesta llevan el código y el
    mensaje de error de Meta, no solo '400 Client Error'.
"""
from unittest.mock import patch

import requests
from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from .models import ConfiguracionNotificaciones, NotificacionLog

User = get_user_model()


def _respuesta(status, contenido):
    r = requests.Response()
    r.status_code = status
    r._content = contenido
    return r


class PruebaWhatsAppMetaTests(TestCase):
    def setUp(self):
        ConfiguracionNotificaciones.objects.update_or_create(pk=1, defaults={
            'whatsapp_activo': True, 'whatsapp_proveedor': 'meta',
            'meta_whatsapp_token': 'token-de-prueba', 'meta_whatsapp_phone_id': '111222333',
        })
        u = User.objects.create_user(username='dir_wa', password='clave123456')
        u.perfil.rol = 'director'
        u.perfil.save(update_fields=['rol'])
        self.client = APIClient()
        self.client.force_authenticate(user=u)

    def _probar(self):
        return self.client.post('/api/notificaciones/probar/',
                                {'canal': 'whatsapp', 'destino': '04126617733'}, format='json')

    @patch('requests.post')
    def test_envia_plantilla_hello_world(self, post):
        post.return_value = _respuesta(200, b'{"messages":[{"id":"wamid.x"}]}')
        resp = self._probar()
        self.assertEqual(resp.data['resultados']['whatsapp'], 'enviado')
        payload = post.call_args.kwargs['json']
        self.assertEqual(payload['type'], 'template')
        self.assertEqual(payload['template']['name'], 'hello_world')
        self.assertEqual(payload['template']['language']['code'], 'en_US')
        self.assertEqual(payload['to'], '584126617733')
        self.assertIn('/111222333/messages', post.call_args.args[0])

    @patch('requests.post')
    def test_error_de_meta_llega_al_log_y_a_la_respuesta(self, post):
        post.return_value = _respuesta(400, (
            b'{"error":{"message":"(#131030) Recipient phone number not in allowed list",'
            b'"code":131030,"error_data":{"details":"Recipient phone number not in allowed list"}}}'
        ))
        resp = self._probar()
        resultado = resp.data['resultados']['whatsapp']
        self.assertTrue(resultado.startswith('fallido: '))
        self.assertIn('code 131030', resultado)
        log = NotificacionLog.objects.filter(canal='whatsapp', tipo='prueba').latest('id')
        self.assertEqual(log.estado, 'fallido')
        self.assertIn('HTTP 400', log.error_detalle)
        self.assertIn('not in allowed list', log.error_detalle)
