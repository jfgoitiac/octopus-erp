"""
WhatsApp (Meta) por sede — docs/CONTRATO_WHATSAPP_POR_SEDE.md.

Cubre: fallback a la configuración general, envío con las credenciales de la
sede, ruteo del webhook por phone_number_id (firma incluida), respuesta por el
mismo número, enmascarado de secretos, permisos y auditoría.
"""
import json
from unittest.mock import patch

from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from authentication.models import PerfilUsuario
from cobranza.motor import _enviar_whatsapp
from multisede.models import PermisoSede, Sede
from usuarios.models import LogAuditoria

from . import conversaciones as srv
from . import services, webhook_meta
from .config_whatsapp import config_por_phone_id, get_config_whatsapp
from .models import ConfiguracionNotificaciones, ConfiguracionWhatsAppSede, ConversacionWhatsApp, MensajeWhatsApp
from .tests_conversaciones import (
    SECRETO, TELEFONO, WEBHOOK, ConvBase, firmar, payload_texto, respuesta_meta,
)

User = get_user_model()
API = '/api/notificaciones/whatsapp-sedes/'
TOKEN_SEDE = 'token-sede-ABCD1234'
SECRETO_SEDE = 'secreto-sede-WXYZ9876'
PHONE_SEDE = '555111'


def usuario(username, rol):
    u = User.objects.create_user(username, f'{username}@t.com', 'x')
    PerfilUsuario.objects.update_or_create(user=u, defaults={'rol': rol, 'esta_activo': True})
    u.refresh_from_db()    # la señal dejó cacheado el perfil por defecto (cajero)
    return u


class WhatsAppSedeBase(ConvBase):
    def setUp(self):
        super().setUp()    # general: phone 999, token 'tok', secreto SECRETO, verificador
        self.sede2 = Sede.objects.create(nombre='Sede Sur')

    def postear_a(self, phone_id, wa_id, secreto=SECRETO_SEDE, desde='584121234567'):
        cuerpo = json.dumps(payload_texto('Hola', wa_id=wa_id, phone_id=phone_id, desde=desde)).encode()
        return self.api_anonimo().post(WEBHOOK, data=cuerpo, content_type='application/json',
                                       HTTP_X_HUB_SIGNATURE_256=firmar(cuerpo, secreto))

    def api_anonimo(self):
        return APIClient()

    def propia(self, sede=None, **extra):
        datos = dict(activo=True, numero_visible='+58 412 5551111', meta_whatsapp_phone_id=PHONE_SEDE,
                     meta_whatsapp_token=TOKEN_SEDE, meta_waba_id='WABA-S', meta_app_secret=SECRETO_SEDE)
        datos.update(extra)
        return ConfiguracionWhatsAppSede.objects.update_or_create(
            sede=sede or self.sede, defaults=datos)[0]


class ResolucionTest(WhatsAppSedeBase):
    def test_sin_fila_la_sede_hereda_la_general(self):
        for sede in (self.sede, self.sede.id, None):
            c = get_config_whatsapp(sede)
            self.assertEqual((c.origen, c.phone_id, c.token, c.proveedor), ('general', '999', 'tok', 'meta'))

    def test_fila_inactiva_o_incompleta_hereda_la_general(self):
        self.propia(activo=False)
        self.assertEqual(get_config_whatsapp(self.sede).origen, 'general')
        self.propia(activo=True, meta_whatsapp_token='')
        self.assertEqual(get_config_whatsapp(self.sede).origen, 'general')

    def test_sede_activa_usa_la_suya_y_las_demas_la_general(self):
        self.propia()
        c = get_config_whatsapp(self.sede)
        self.assertEqual((c.origen, c.sede_id, c.phone_id, c.token, c.proveedor),
                         ('sede', self.sede.id, PHONE_SEDE, TOKEN_SEDE, 'meta'))
        self.assertEqual(get_config_whatsapp(self.sede2).origen, 'general')

    def test_secretos_vacios_de_la_sede_heredan_los_generales(self):
        self.propia(meta_app_secret='')
        c = get_config_whatsapp(self.sede)
        self.assertEqual((c.app_secret, c.verify_token), (SECRETO, 'verificador'))

    def test_sede_con_numero_propio_usa_meta_aunque_la_general_use_twilio(self):
        ConfiguracionNotificaciones.objects.filter(pk=1).update(whatsapp_proveedor='twilio')
        self.propia()
        self.assertEqual(services._proveedor_whatsapp(self.sede.id), 'meta')
        self.assertEqual(services._proveedor_whatsapp(self.sede2.id), 'twilio')

    def test_config_por_phone_id(self):
        self.propia()
        self.assertEqual(config_por_phone_id(PHONE_SEDE).origen, 'sede')
        self.assertEqual(config_por_phone_id('999').origen, 'general')
        self.assertIsNone(config_por_phone_id('000'))
        self.propia(activo=False)
        self.assertIsNone(config_por_phone_id(PHONE_SEDE))


class EnvioTest(WhatsAppSedeBase):
    def enviar(self, sede):
        with patch('requests.post', return_value=respuesta_meta('wamid.X')) as post:
            ok = services.enviar_whatsapp('04121234567', 'Hola', tipo='prueba', sede=sede)
        return ok, post

    def test_envio_con_credenciales_de_la_sede(self):
        self.propia()
        ok, post = self.enviar(self.sede.id)
        self.assertTrue(ok)
        self.assertIn(f'/{PHONE_SEDE}/messages', post.call_args.args[0])
        self.assertEqual(post.call_args.kwargs['headers']['Authorization'], f'Bearer {TOKEN_SEDE}')

    def test_sede_sin_numero_propio_y_sin_sede_usan_la_general(self):
        self.propia()
        for sede in (self.sede2.id, None):
            ok, post = self.enviar(sede)
            self.assertTrue(ok)
            self.assertIn('/999/messages', post.call_args.args[0])
            self.assertEqual(post.call_args.kwargs['headers']['Authorization'], 'Bearer tok')

    def test_motor_envia_por_el_numero_de_la_sede_de_la_familia(self):
        from cobranza.test_motor_cobranza import WA
        self.propia()
        self.alumno('E1')    # alumno activo de self.sede para self.rep
        with patch(WA, return_value=True) as wa:
            _enviar_whatsapp(self.rep.telefono, 'texto', self.rep, registrar=False)
        self.assertEqual(wa.call_args.kwargs['sede'], self.sede.id)

    def test_respuesta_de_conversacion_sale_por_el_numero_por_el_que_escribio(self):
        self.propia()
        self.assertEqual(self.postear_a(PHONE_SEDE, 'w-1').status_code, 200)
        conv = ConversacionWhatsApp.objects.get()
        with patch('requests.post', return_value=respuesta_meta('wamid.R')) as post:
            srv.enviar_texto(conv, 'Buenas', self.admin)
        self.assertIn(f'/{PHONE_SEDE}/messages', post.call_args.args[0])
        self.assertEqual(post.call_args.kwargs['headers']['Authorization'], f'Bearer {TOKEN_SEDE}')


class WebhookRuteoTest(WhatsAppSedeBase):
    def test_mensaje_al_numero_de_la_sede_crea_conversacion_en_esa_sede(self):
        self.propia(sede=self.sede2)
        self.assertEqual(self.postear_a(PHONE_SEDE, 'w-1', desde='584240000000').status_code, 200)
        conv = ConversacionWhatsApp.objects.get()
        self.assertEqual((conv.sede_id, conv.phone_id_entrante), (self.sede2.id, PHONE_SEDE))
        self.assertEqual(MensajeWhatsApp.objects.get().wa_message_id, 'w-1')

    def test_mensaje_al_numero_general_no_asigna_sede(self):
        self.propia(sede=self.sede2)
        self.assertEqual(self.postear_a('999', 'w-2', secreto=SECRETO, desde='584240000000').status_code, 200)
        conv = ConversacionWhatsApp.objects.get()
        self.assertEqual((conv.sede_id, conv.phone_id_entrante), (None, '999'))

    def test_numero_desconocido_se_ignora_cuando_el_general_tiene_el_suyo(self):
        self.propia()
        self.assertEqual(self.postear_a('777', 'w-3', secreto=SECRETO).status_code, 200)
        self.assertFalse(MensajeWhatsApp.objects.exists())

    def test_la_firma_se_valida_con_el_secreto_de_la_sede_dueña(self):
        self.propia()
        # con el secreto general NO sirve para el número de la sede...
        self.assertEqual(self.postear_a(PHONE_SEDE, 'w-4', secreto=SECRETO).status_code, 403)
        # ...y el de la sede no sirve para el número general.
        self.assertEqual(self.postear_a('999', 'w-5', secreto=SECRETO_SEDE).status_code, 403)
        self.assertFalse(MensajeWhatsApp.objects.exists())
        self.assertEqual(self.postear_a(PHONE_SEDE, 'w-6').status_code, 200)

    def test_sede_sin_secreto_propio_firma_con_el_general(self):
        self.propia(meta_app_secret='')
        self.assertEqual(self.postear_a(PHONE_SEDE, 'w-7', secreto=SECRETO).status_code, 200)

    def test_payload_mixto_firmado_solo_con_el_secreto_de_una_sede_se_rechaza(self):
        self.propia()
        p = payload_texto('Hola', wa_id='w-8', phone_id=PHONE_SEDE)
        p['entry'][0]['changes'].append(payload_texto('x', wa_id='w-9', phone_id='999')['entry'][0]['changes'][0])
        cuerpo = json.dumps(p).encode()
        r = self.api_anonimo().post(WEBHOOK, data=cuerpo, content_type='application/json',
                                    HTTP_X_HUB_SIGNATURE_256=firmar(cuerpo, SECRETO_SEDE))
        self.assertEqual(r.status_code, 403)
        self.assertFalse(MensajeWhatsApp.objects.exists())

    def test_verificacion_get_acepta_el_token_de_la_sede_y_el_general(self):
        self.propia(meta_webhook_verify_token='verif-sede')
        c = APIClient()
        for token in ('verificador', 'verif-sede'):
            r = c.get(WEBHOOK, {'hub.mode': 'subscribe', 'hub.verify_token': token, 'hub.challenge': '7'})
            self.assertEqual((r.status_code, r.content), (200, b'7'))
        r = c.get(WEBHOOK, {'hub.mode': 'subscribe', 'hub.verify_token': 'otro', 'hub.challenge': '7'})
        self.assertEqual(r.status_code, 403)

    def test_sede_inactiva_no_recibe_y_vuelve_a_ser_numero_desconocido(self):
        self.propia(activo=False)
        self.assertEqual(self.postear_a(PHONE_SEDE, 'w-10', secreto=SECRETO).status_code, 200)
        self.assertFalse(MensajeWhatsApp.objects.exists())


class ApiSedeTest(WhatsAppSedeBase):
    def setUp(self):
        super().setUp()
        self.director = usuario('dir', 'director')
        self.cliente = APIClient()
        self.cliente.force_authenticate(self.director)

    def url(self, sede=None):
        return f'{API}{(sede or self.sede).id}/'

    def test_lista_marca_las_sedes_que_usan_la_general(self):
        self.propia(sede=self.sede2)
        r = self.cliente.get(API)
        self.assertEqual(r.status_code, 200)
        por_id = {f['sede']['id']: f for f in r.json()['results']}
        self.assertTrue(por_id[self.sede.id]['usa_configuracion_general'])
        self.assertFalse(por_id[self.sede2.id]['usa_configuracion_general'])
        self.assertEqual(por_id[self.sede.id]['efectiva']['phone_id'], '999')

    def test_secretos_nunca_salen_en_claro(self):
        self.propia()
        for r in (self.cliente.get(self.url()), self.cliente.get(API)):
            self.assertNotIn(TOKEN_SEDE, r.content.decode())
            self.assertNotIn(SECRETO_SEDE, r.content.decode())
        d = self.cliente.get(self.url()).json()
        self.assertEqual((d['meta_whatsapp_token'], d['meta_app_secret']), ('••••1234', '••••9876'))

    def test_patch_crea_activa_y_audita_sin_valores(self):
        r = self.cliente.patch(self.url(), {
            'activo': True, 'meta_whatsapp_phone_id': PHONE_SEDE, 'meta_whatsapp_token': TOKEN_SEDE,
            'meta_app_secret': SECRETO_SEDE, 'numero_visible': '+58 412 5551111'}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertFalse(r.json()['usa_configuracion_general'])
        self.assertNotIn(TOKEN_SEDE, r.content.decode())
        fila = ConfiguracionWhatsAppSede.objects.get(sede=self.sede)
        self.assertEqual(fila.meta_whatsapp_token, TOKEN_SEDE)
        log = LogAuditoria.objects.get(modulo='notificaciones')
        self.assertEqual(log.usuario, self.director)
        self.assertEqual(log.detalles['sede_id'], self.sede.id)
        self.assertEqual(log.detalles['secretos_modificados'], ['meta_app_secret', 'meta_whatsapp_token'])
        self.assertNotIn(TOKEN_SEDE, json.dumps(log.detalles))
        self.assertNotIn(SECRETO_SEDE, json.dumps(log.detalles))

    def test_placeholder_enmascarado_no_pisa_el_secreto(self):
        self.propia()
        d = self.cliente.get(self.url()).json()
        r = self.cliente.patch(self.url(), d, format='json')    # el front reenvía lo recibido
        self.assertEqual(r.status_code, 200, r.content)
        fila = ConfiguracionWhatsAppSede.objects.get(sede=self.sede)
        self.assertEqual((fila.meta_whatsapp_token, fila.meta_app_secret), (TOKEN_SEDE, SECRETO_SEDE))

    def test_no_se_puede_activar_sin_token_ni_phone_id(self):
        r = self.cliente.patch(self.url(), {'activo': True, 'meta_whatsapp_phone_id': PHONE_SEDE}, format='json')
        self.assertEqual(r.status_code, 400)
        self.assertFalse(ConfiguracionWhatsAppSede.objects.exists())

    def test_phone_id_repetido_o_invalido_se_rechaza(self):
        self.propia(sede=self.sede2)
        base = {'meta_whatsapp_token': 't'}
        for pid in (PHONE_SEDE, '999', 'abc'):    # otra sede, la general, no numérico
            r = self.cliente.patch(self.url(), {**base, 'meta_whatsapp_phone_id': pid}, format='json')
            self.assertEqual(r.status_code, 400, pid)

    def test_delete_vuelve_a_la_general(self):
        self.propia()
        r = self.cliente.delete(self.url())
        self.assertEqual(r.status_code, 200)
        self.assertTrue(r.json()['usa_configuracion_general'])
        self.assertFalse(ConfiguracionWhatsAppSede.objects.exists())
        self.assertTrue(LogAuditoria.objects.filter(modulo='notificaciones').exists())

    def test_solo_director_administrador_y_sistemas(self):
        for rol, esperado in (('administrador', 200), ('sistemas', 200), ('director', 200),
                              ('cajero', 403), ('secretaria', 403), ('cobranza', 403)):
            c = APIClient()
            c.force_authenticate(usuario(f'u_{rol}', rol))
            self.assertEqual(c.get(API).status_code, esperado, rol)
            self.assertEqual(c.patch(self.url(), {'numero_visible': 'x'}, format='json').status_code,
                             esperado, rol)
            self.assertEqual(c.delete(self.url()).status_code, esperado, rol)
        self.assertEqual(APIClient().get(API).status_code, 401)

    def test_un_director_de_sede_no_toca_otra_sede(self):
        u = usuario('dir_sur', 'director')
        PermisoSede.objects.create(user=u, sede=self.sede2, rol='director')
        c = APIClient()
        c.force_authenticate(u)
        self.assertEqual([f['sede']['id'] for f in c.get(API).json()['results']], [self.sede2.id])
        self.assertEqual(c.get(self.url()).status_code, 404)
        self.assertEqual(c.patch(self.url(), {'numero_visible': 'x'}, format='json').status_code, 404)
        self.assertEqual(c.patch(self.url(self.sede2), {'numero_visible': 'x'}, format='json').status_code, 200)
        with patch('requests.post', return_value=respuesta_meta()):
            r = c.post('/api/notificaciones/probar/', {
                'canal': 'whatsapp', 'destino': '04121234567', 'sede_id': self.sede.id}, format='json')
        self.assertEqual(r.status_code, 403)

    def test_probar_envia_por_el_numero_de_la_sede(self):
        self.propia()
        with patch('requests.post', return_value=respuesta_meta()) as post:
            r = self.cliente.post('/api/notificaciones/probar/', {
                'canal': 'whatsapp', 'destino': '04121234567', 'sede_id': self.sede.id}, format='json')
        self.assertEqual(r.status_code, 200)
        self.assertIn(f'/{PHONE_SEDE}/messages', post.call_args.args[0])

    def test_config_general_sigue_igual_y_audita_cambios_de_whatsapp(self):
        r = self.cliente.patch('/api/notificaciones/configuracion/', {'meta_waba_id': 'W1'}, format='json')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()['meta_whatsapp_token'], '••••tok')
        self.assertTrue(LogAuditoria.objects.filter(modulo='notificaciones').exists())
