"""Web Push de usuarios del panel (administrativos y docentes). El envío real
(`enviar_push`) se simula: no depende de pywebpush ni de la red."""
from datetime import date
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from authentication.models import PerfilUsuario
from comunicacion.models import MensajeDirecto
from portal.models import ComprobantePago
from secretaria.models import Alumno, Representante
from cobranza.models import Mensualidad

from .models import SuscripcionPushUsuario
from .services import notificar_mensaje_directo, push_usuarios

User = get_user_model()
URL = '/api/notificaciones/push/usuario/'
PAYLOAD = {'endpoint': 'https://fcm.googleapis.com/fcm/send/staff1',
           'keys': {'p256dh': 'k', 'auth': 'a'}}
VAPID = override_settings(VAPID_PUBLIC_KEY='pub', VAPID_PRIVATE_KEY='priv')
ENVIAR = 'notificaciones.services.enviar_push'


def usuario(username, rol):
    u = User.objects.create_user(username=username, password='x', email=f'{username}@t.com')
    PerfilUsuario.objects.update_or_create(user=u, defaults={'rol': rol, 'esta_activo': True})
    u.refresh_from_db()
    return u


def suscribir(user, endpoint, tipos=('mensaje', 'comprobante')):
    return SuscripcionPushUsuario.objects.create(
        usuario=user, endpoint=endpoint, p256dh='k', auth='a', tipos_activos=list(tipos))


class ApiPushUsuarioTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.docente = usuario('doc1', 'docente')
        self.client.force_authenticate(self.docente)

    @override_settings(VAPID_PUBLIC_KEY='pub')
    def test_estado_inicial_trae_clave_publica(self):
        r = self.client.get(URL)
        self.assertEqual((r.status_code, r.data['activa'], r.data['vapid_public_key']), (200, False, 'pub'))

    def test_suscribir_y_desuscribir(self):
        r = self.client.post(URL, PAYLOAD, format='json')
        self.assertEqual(r.status_code, 201)
        self.assertTrue(SuscripcionPushUsuario.objects.get(endpoint=PAYLOAD['endpoint']).activa)
        self.assertTrue(self.client.get(URL).data['activa'])
        r = self.client.delete(URL, {'endpoint': PAYLOAD['endpoint']}, format='json')
        self.assertEqual(r.status_code, 204)
        self.assertFalse(self.client.get(URL).data['activa'])

    def test_endpoint_reasignado_a_otra_cuenta(self):
        self.client.post(URL, PAYLOAD, format='json')
        otro = usuario('cob1', 'cobranza')
        self.client.force_authenticate(otro)
        self.client.post(URL, PAYLOAD, format='json')
        self.assertEqual(SuscripcionPushUsuario.objects.get().usuario, otro)

    def test_validaciones(self):
        self.assertEqual(self.client.post(URL, {'endpoint': 'x'}, format='json').status_code, 400)
        self.assertEqual(self.client.post(URL, {**PAYLOAD, 'tipos': ['otro']}, format='json').status_code, 400)

    def test_exige_autenticacion(self):
        self.assertIn(APIClient().get(URL).status_code, (401, 403))


class EnvioPushUsuarioTests(TestCase):
    def setUp(self):
        self.docente = usuario('doc1', 'docente')

    @VAPID
    def test_respeta_tipos_y_actividad(self):
        suscribir(self.docente, 'https://e/1', tipos=('mensaje',))
        suscribir(self.docente, 'https://e/2', tipos=('comprobante',))
        with patch(ENVIAR) as enviar:
            push_usuarios([self.docente], 'mensaje', 't', 'c', url='/x')
        self.assertEqual(enviar.call_count, 1)
        self.assertEqual(enviar.call_args.args[0].endpoint, 'https://e/1')

    def test_sin_vapid_no_envia(self):
        suscribir(self.docente, 'https://e/1')
        with patch(ENVIAR) as enviar:
            push_usuarios([self.docente], 'mensaje', 't', 'c', url='/x')
        enviar.assert_not_called()


class DisparadoresTests(TestCase):
    def setUp(self):
        self.rep = Representante.objects.create(
            cedula='V1', nombre='Maria', apellido='Perez', telefono='0412', correo='m@t.com', direccion='c')
        self.alumno = Alumno.objects.create(
            cedula_escolar='E1', nombre='Ana', apellido='Perez', fecha_nacimiento=date(2015, 1, 1),
            representante=self.rep)

    @VAPID
    def test_mensaje_de_representante_avisa_al_docente(self):
        from portal.models import RepresentanteUser
        docente = usuario('doc1', 'docente')
        suscribir(docente, 'https://e/doc')
        rep_user = RepresentanteUser.objects.create(
            representante=self.rep, user=User.objects.create_user('V1', password='x'), esta_activo=True)
        m = MensajeDirecto.objects.create(
            alumno=self.alumno, remitente_representante=rep_user, destinatario_docente=docente, cuerpo='Hola profe')
        with patch(ENVIAR) as enviar:
            notificar_mensaje_directo(m)
        enviar.assert_called_once()
        self.assertEqual(enviar.call_args.kwargs['url'], '/portal-docente/mensajes')

    @VAPID
    def test_comprobante_avisa_a_cobranza_y_no_a_docentes(self):
        from portal.tasks import notificar_comprobante_subido
        cobranza = usuario('cob1', 'cobranza')
        docente = usuario('doc1', 'docente')
        suscribir(cobranza, 'https://e/cob')
        suscribir(docente, 'https://e/doc')
        mens = Mensualidad.objects.create(alumno=self.alumno, mes=7, anio=2026, monto_usd=50)
        comp = ComprobantePago.objects.create(
            mensualidad=mens, archivo='x.pdf', hash_archivo='h' * 64, referencia_bancaria='1')
        with patch(ENVIAR) as enviar:
            notificar_comprobante_subido(comp.id)
        destinos = [c.args[0].endpoint for c in enviar.call_args_list]
        self.assertEqual(destinos, ['https://e/cob'])
