"""
Conversaciones de WhatsApp de Cobranza Inteligente v4, Fase B
(PLAN_COBRANZA_INTELIGENTE_V4.md §5): webhook de Meta (firma, idempotencia,
estados, baja, media), vinculación por teléfono, ventana de 24 h, takeover y su
efecto en el motor, devolución automática, endpoints y tarjetas de Hoy.
Todo con instantes fijos y Meta simulado con mocks.
"""
import hashlib
import hmac
import json
from datetime import timedelta
from unittest.mock import MagicMock, patch

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from cobranza import control_envios, hoy as servicio_hoy
from cobranza.models import BajaCobranza, EnvioCobranza
from cobranza.motor import procesar_envio, simular_reglas_sede
from cobranza.test_gestion_cobranza import GestionBase
from cobranza.test_motor_cobranza import AHORA, HOY, WA
from secretaria.models import Representante

from . import conversaciones as srv
from . import webhook_meta
from .models import (
    ConfiguracionNotificaciones, ConversacionWhatsApp, MensajeWhatsApp, RespuestaRapida,
)

WEBHOOK = '/api/notificaciones/whatsapp/webhook/'
API = '/api/cobranza/inteligente/'
SECRETO = 'secreto-de-prueba'
TELEFONO = '+584121234567'     # el del representante de MotorBase (04121234567)
WAMID = 'wamid.ENTRANTE1'
PNG = b'\x89PNG\r\n\x1a\n' + b'\x00' * 32


def payload_texto(texto='Hola', wa_id=WAMID, desde='584121234567', ts=None, tipo='text', extra=None,
                  phone_id='999'):
    mensaje = {'from': desde, 'id': wa_id, 'timestamp': str(ts or int(timezone.now().timestamp())),
               'type': tipo}
    if tipo == 'text':
        mensaje['text'] = {'body': texto}
    mensaje.update(extra or {})
    return {'object': 'whatsapp_business_account', 'entry': [{'id': 'WABA', 'changes': [{
        'field': 'messages', 'value': {
            'messaging_product': 'whatsapp', 'metadata': {'phone_number_id': phone_id},
            'contacts': [{'profile': {'name': 'Maria P'}, 'wa_id': desde}], 'messages': [mensaje]}}]}]}


def payload_status(wa_id, estado, errors=None, phone_id='999'):
    st = {'id': wa_id, 'status': estado, 'timestamp': str(int(timezone.now().timestamp())),
          'recipient_id': '584121234567'}
    if errors:
        st['errors'] = errors
    return {'object': 'whatsapp_business_account', 'entry': [{'id': 'WABA', 'changes': [{
        'field': 'messages', 'value': {'messaging_product': 'whatsapp',
                                       'metadata': {'phone_number_id': phone_id}, 'statuses': [st]}}]}]}


def firmar(cuerpo, secreto=SECRETO):
    return 'sha256=' + hmac.new(secreto.encode(), cuerpo, hashlib.sha256).hexdigest()


def respuesta_meta(wa_id='wamid.SALIENTE1'):
    r = MagicMock()
    r.raise_for_status.return_value = None
    r.json.return_value = {'messages': [{'id': wa_id}]}
    return r


class ConvBase(GestionBase):
    def setUp(self):
        super().setUp()
        ConfiguracionNotificaciones.objects.update_or_create(pk=1, defaults={
            'whatsapp_activo': True, 'whatsapp_proveedor': 'meta', 'meta_whatsapp_token': 'tok',
            'meta_whatsapp_phone_id': '999', 'meta_app_secret': SECRETO,
            'meta_webhook_verify_token': 'verificador'})
        self.api = APIClient()
        self.api.force_authenticate(self.admin)
        # La tarea Celery se ejecuta en línea.
        p = patch('notificaciones.tasks.procesar_webhook_meta.delay',
                  side_effect=lambda payload: webhook_meta.procesar_payload(payload))
        self.delay = p.start()
        self.addCleanup(p.stop)

    def postear(self, payload, firma='valida'):
        cuerpo = json.dumps(payload).encode()
        extra = {}
        if firma == 'valida':
            extra['HTTP_X_HUB_SIGNATURE_256'] = firmar(cuerpo)
        elif firma:
            extra['HTTP_X_HUB_SIGNATURE_256'] = firma
        return APIClient().post(WEBHOOK, data=cuerpo, content_type='application/json', **extra)

    def conversacion(self, **campos):
        self.config()
        conv = srv.obtener_conversacion(TELEFONO)
        for k, v in campos.items():
            setattr(conv, k, v)
        if campos:
            conv.save()
        return conv


# ── Webhook ───────────────────────────────────────────────────────────────────

class WebhookTest(ConvBase):
    def test_verificacion_get(self):
        c = APIClient()
        r = c.get(WEBHOOK, {'hub.mode': 'subscribe', 'hub.verify_token': 'verificador', 'hub.challenge': '123'})
        self.assertEqual((r.status_code, r.content), (200, b'123'))
        r = c.get(WEBHOOK, {'hub.mode': 'subscribe', 'hub.verify_token': 'otro', 'hub.challenge': '123'})
        self.assertEqual(r.status_code, 403)

    def test_firma_invalida_o_ausente_responde_403_y_no_guarda_nada(self):
        for firma in ('sha256=' + '0' * 64, None, 'basura'):
            r = self.postear(payload_texto(), firma=firma)
            self.assertEqual(r.status_code, 403)
        self.assertFalse(MensajeWhatsApp.objects.exists())
        self.delay.assert_not_called()

    def test_sin_app_secret_configurado_rechaza_todo(self):
        ConfiguracionNotificaciones.objects.filter(pk=1).update(meta_app_secret='')
        self.assertEqual(self.postear(payload_texto()).status_code, 403)

    def test_mismo_wa_message_id_dos_veces_no_duplica(self):
        self.assertEqual(self.postear(payload_texto()).status_code, 200)
        self.assertEqual(self.postear(payload_texto()).status_code, 200)
        self.assertEqual(MensajeWhatsApp.objects.filter(wa_message_id=WAMID).count(), 1)
        self.assertEqual(ConversacionWhatsApp.objects.get().no_leidos, 1)

    def test_entrante_crea_conversacion_vinculada_y_marca_requiere_humano(self):
        self.config()
        self.assertEqual(self.postear(payload_texto('¿Cuánto debo?')).status_code, 200)
        c = ConversacionWhatsApp.objects.get()
        self.assertEqual((c.telefono, c.representante_id, c.sede_id), (TELEFONO, self.rep.id, None))
        self.assertEqual((c.nombre_contacto, c.no_leidos, c.estado), ('Maria P', 1, 'automatico'))
        self.assertTrue(c.requiere_humano)
        self.assertIsNotNone(c.ultimo_entrante_en)
        m = c.mensajes.get()
        self.assertEqual((m.direccion, m.tipo, m.cuerpo), ('entrante', 'texto', '¿Cuánto debo?'))

    def test_boton_e_interactive_se_guardan_sin_marcar_requiere_humano(self):
        self.postear(payload_texto(tipo='button', wa_id='w1', extra={'button': {'payload': 'YA_PAGUE', 'text': 'Ya pagué'}}))
        self.postear(payload_texto(tipo='interactive', wa_id='w2', extra={'interactive': {
            'type': 'list_reply', 'list_reply': {'id': 'dias_7', 'title': 'En 7 días'}}}))
        tipos = list(MensajeWhatsApp.objects.order_by('id').values_list('tipo', 'payload__boton_id'))
        self.assertEqual(tipos, [('boton', 'YA_PAGUE'), ('lista', 'dias_7')])
        # Desde la Fase C, "Ya pagué" es un botón conocido (no marca) pero una fila de lista
        # desconocida ('dias_7') sí pasa a una persona (v4 §1.6).
        self.assertTrue(ConversacionWhatsApp.objects.get().requiere_humano)

    def test_status_read_actualiza_la_entrega_y_no_retrocede(self):
        conv = self.conversacion()
        m = srv.registrar_saliente(conv, 'texto', 'hola', wa_message_id='wamid.OUT')
        self.assertEqual(m.estado_entrega, 'enviado')
        self.postear(payload_status('wamid.OUT', 'delivered'))
        m.refresh_from_db()
        self.assertEqual(m.estado_entrega, 'entregado')
        self.postear(payload_status('wamid.OUT', 'read'))
        self.postear(payload_status('wamid.OUT', 'sent'))     # llega tarde: no retrocede
        m.refresh_from_db()
        self.assertEqual(m.estado_entrega, 'leido')

    def test_status_desconocido_se_ignora(self):
        self.assertEqual(self.postear(payload_status('wamid.NO_EXISTE', 'read')).status_code, 200)

    def test_status_failed_marca_fallido_y_reintenta_el_envio_del_motor(self):
        self.ciclo('E1', dia_limite=17)
        self.config()
        from cobranza.motor import evaluar_reglas_sede
        evaluar_reglas_sede(self.sede.id, HOY)
        envio = EnvioCobranza.objects.get()
        with patch(WA, return_value=True):
            self.assertEqual(procesar_envio(envio, AHORA), 'enviado')
        m = MensajeWhatsApp.objects.get(envio_cobranza=envio)
        m.wa_message_id = 'wamid.MOTOR'
        m.save()
        self.postear(payload_status('wamid.MOTOR', 'failed', errors=[{'code': 131026, 'title': 'No entregable'}]))
        m.refresh_from_db(); envio.refresh_from_db()
        self.assertEqual(m.estado_entrega, 'fallido')
        self.assertEqual(m.payload['errores'][0]['code'], 131026)
        self.assertEqual(envio.estado, EnvioCobranza.REINTENTO)
        self.assertIsNotNone(envio.proximo_intento)

    def test_numero_de_otro_phone_id_se_ignora(self):
        self.postear(payload_texto(phone_id='otro'))
        self.assertFalse(MensajeWhatsApp.objects.exists())

    def test_baja_crea_baja_cobranza_y_confirma(self):
        for texto in ('BAJA', 'stop', 'No más.'):
            BajaCobranza.objects.all().delete()
            MensajeWhatsApp.objects.all().delete()
            with patch('requests.post', return_value=respuesta_meta('wamid.CONF')) as post:
                self.postear(payload_texto(texto, wa_id=f'w-{texto}'))
            self.assertTrue(BajaCobranza.objects.filter(representante=self.rep, canal='whatsapp').exists(), texto)
            conf = MensajeWhatsApp.objects.get(direccion='saliente')
            self.assertIn('no volverá a recibir', conf.cuerpo)
            self.assertEqual(conf.payload['origen'], 'bot')
            self.assertEqual(post.call_args.kwargs['json']['to'], '584121234567')
            self.assertFalse(ConversacionWhatsApp.objects.get().requiere_humano)

    def test_baja_en_conversacion_sin_vincular_pide_ayuda_humana(self):
        with patch('requests.post', return_value=respuesta_meta()):
            self.postear(payload_texto('BAJA', desde='584240000000'))
        self.assertFalse(BajaCobranza.objects.exists())
        self.assertTrue(ConversacionWhatsApp.objects.get().requiere_humano)

    def test_imagen_se_descarga_con_los_limites_del_portal(self):
        def get(url, **kw):
            r = MagicMock()
            r.raise_for_status.return_value = None
            if url.endswith('/MEDIA1'):
                r.json.return_value = {'url': 'https://lookaside/x', 'mime_type': 'image/png',
                                       'file_size': len(PNG)}
            else:
                r.content = PNG
            return r
        with patch('requests.get', side_effect=get):
            self.postear(payload_texto(tipo='image', wa_id='wimg', extra={
                'image': {'id': 'MEDIA1', 'mime_type': 'image/png', 'caption': 'comprobante'}}))
        m = MensajeWhatsApp.objects.get(wa_message_id='wimg')
        self.assertEqual((m.tipo, m.cuerpo), ('imagen', 'comprobante'))
        self.assertTrue(m.adjunto.name.startswith('whatsapp_adjuntos/'))
        self.assertTrue(m.adjunto.name.endswith('.png'))
        self.assertEqual(m.estado_adjunto, 'pendiente')   # Fase C: queda por asignar

    def test_media_invalida_o_muy_grande_no_se_guarda(self):
        def get(url, **kw):
            r = MagicMock()
            r.raise_for_status.return_value = None
            r.json.return_value = {'url': 'https://lookaside/x', 'mime_type': 'image/png',
                                   'file_size': 50 * 1024 * 1024}
            return r
        with patch('requests.get', side_effect=get):
            self.postear(payload_texto(tipo='image', wa_id='wgrande', extra={'image': {'id': 'M2'}}))
        m = MensajeWhatsApp.objects.get(wa_message_id='wgrande')
        self.assertFalse(m.adjunto)
        self.assertIn('tamaño', m.payload['media_error'])


# ── Vinculación ───────────────────────────────────────────────────────────────

class VinculacionTest(ConvBase):
    def test_telefono_unico_vincula_y_pone_la_sede(self):
        self.ciclo('E1')
        conv = srv.obtener_conversacion(TELEFONO)
        self.assertEqual((conv.representante_id, conv.sede_id), (self.rep.id, self.sede.id))

    def test_telefono_compartido_por_dos_representantes_queda_sin_vincular(self):
        Representante.objects.create(cedula='V2', nombre='Pedro', apellido='Gil',
                                     telefono='+58 412-123-4567', correo='p@t.com', direccion='c')
        conv = srv.obtener_conversacion(TELEFONO)
        self.assertIsNone(conv.representante_id)

    def test_telefono_desconocido_queda_sin_vincular_y_se_vincula_a_mano(self):
        self.config()
        conv = srv.obtener_conversacion('+584249999999')
        self.assertIsNone(conv.representante_id)
        r = self.api.post(f'{API}conversaciones/{conv.id}/vincular/', {'representante_id': self.rep.id}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.data['representante']['id'], self.rep.id)


# ── Takeover y motor ──────────────────────────────────────────────────────────

class TakeoverMotorTest(ConvBase):
    def preparar_envio(self):
        self.ciclo('E1', dia_limite=17)    # +3 hoy
        from cobranza.motor import evaluar_reglas_sede
        evaluar_reglas_sede(self.sede.id, HOY)
        return EnvioCobranza.objects.get()

    def test_con_conversacion_humana_procesar_envio_omite(self):
        envio = self.preparar_envio()
        conv = srv.obtener_conversacion(TELEFONO)
        srv.tomar(conv, self.admin, AHORA)
        with patch(WA, return_value=True) as wa:
            self.assertEqual(procesar_envio(envio, AHORA), 'omitido')
        wa.assert_not_called()
        envio.refresh_from_db()
        self.assertEqual(envio.motivo_omision, 'conversacion_humana')

    def test_la_simulacion_tambien_lo_omite(self):
        self.preparar_envio()
        conv = srv.obtener_conversacion(TELEFONO)
        srv.tomar(conv, self.admin, AHORA)
        EnvioCobranza.objects.all().delete()
        filas = simular_reglas_sede(self.sede.id, HOY, AHORA)
        self.assertEqual((filas[0]['estado'], filas[0]['motivos_omision']), ('se_omitiria', ['conversacion_humana']))
        srv.devolver(conv, self.admin, AHORA)
        self.assertEqual(simular_reglas_sede(self.sede.id, HOY, AHORA)[0]['estado'], 'saldria')

    def test_comprobante_pendiente_omite_el_envio(self):
        envio = self.preparar_envio()
        conv = srv.obtener_conversacion(TELEFONO)
        MensajeWhatsApp.objects.create(conversacion=conv, direccion='entrante', tipo='imagen',
                                       estado_adjunto='pendiente')
        self.assertTrue(control_envios.comprobante_whatsapp_pendiente(self.rep))
        with patch(WA, return_value=True) as wa:
            self.assertEqual(procesar_envio(envio, AHORA), 'omitido')
        wa.assert_not_called()
        envio.refresh_from_db()
        self.assertEqual(envio.motivo_omision, 'comprobante_pendiente')

    def test_cobro_manual_con_conversacion_tomada_avisa_pero_no_bloquea(self):
        self.ciclo('E1')
        srv.tomar(srv.obtener_conversacion(TELEFONO), self.admin, AHORA)
        v = control_envios.puede_enviar_cobro(self.rep, 'whatsapp', control_envios.ORIGEN_MANUAL_API, AHORA)
        self.assertTrue(v.permitido)
        self.assertIn('conversacion_humana', [a['codigo'] for a in v.avisos])

    def test_el_saliente_del_motor_queda_en_la_conversacion(self):
        envio = self.preparar_envio()
        with patch(WA, return_value=True):
            procesar_envio(envio, AHORA)
        m = MensajeWhatsApp.objects.get(direccion='saliente')
        self.assertEqual((m.envio_cobranza_id, m.payload['origen'], m.enviado_por_id), (envio.id, 'motor', None))
        self.assertIsNotNone(m.conversacion.ultimo_saliente_en)
        self.assertIsNone(m.conversacion.ultimo_humano_en)

    def test_cobro_manual_modo_a_y_b_se_registran_en_la_conversacion(self):
        self.ciclo('E1')
        control_envios.registrar_cobro(self.rep, 'whatsapp', control_envios.ORIGEN_MANUAL_WAME,
                                       self.admin, 'Hola, recordatorio')
        with patch('requests.post', return_value=respuesta_meta('wamid.B')):
            from notificaciones.services import enviar_whatsapp
            enviar_whatsapp('04121234567', 'Plantilla', template_data={'nombre': 'cobro', 'idioma': 'es'})
        control_envios.registrar_cobro(self.rep, 'whatsapp', control_envios.ORIGEN_MANUAL_API,
                                       self.admin, 'Texto de la plantilla')
        a, b = MensajeWhatsApp.objects.order_by('id')
        self.assertEqual((a.tipo, a.payload['origen'], a.enviado_por_id), ('texto', 'manual_wame', self.admin.id))
        self.assertEqual((b.tipo, b.payload['origen'], b.wa_message_id), ('plantilla', 'manual_api', 'wamid.B'))


class DevolucionAutomaticaTest(ConvBase):
    def test_devuelve_a_los_3_dias_sin_mensajes_del_cobrador(self):
        conv = srv.obtener_conversacion(TELEFONO)
        srv.tomar(conv, self.admin, AHORA - timedelta(days=3))
        self.assertEqual(srv.devolver_inactivas(AHORA - timedelta(minutes=1)), 0)   # 2 d 23 h 59 min
        self.assertEqual(srv.devolver_inactivas(AHORA), 1)
        conv.refresh_from_db()
        self.assertEqual((conv.estado, conv.tomada_por_id, conv.requiere_humano), ('automatico', None, False))
        self.assertFalse(control_envios.conversacion_humana(self.rep))

    def test_un_mensaje_del_cobrador_reinicia_el_plazo(self):
        conv = srv.obtener_conversacion(TELEFONO)
        srv.tomar(conv, self.admin, AHORA - timedelta(days=5))
        srv.registrar_saliente(conv, 'texto', 'seguimos', usuario=self.admin, humano=True,
                               ahora=AHORA - timedelta(days=2))
        self.assertEqual(srv.devolver_inactivas(AHORA), 0)
        conv.refresh_from_db()
        self.assertEqual(conv.estado, 'humano')
        self.assertEqual(srv.devolver_inactivas(AHORA + timedelta(days=1)), 1)

    def test_tarea_celery_registrada_en_el_beat(self):
        from django.conf import settings
        tareas = {v['task'] for v in settings.CELERY_BEAT_SCHEDULE.values()}
        self.assertIn('notificaciones.tasks.devolver_conversaciones_inactivas', tareas)
        from notificaciones.tasks import devolver_conversaciones_inactivas
        conv = srv.obtener_conversacion(TELEFONO)
        srv.tomar(conv, self.admin, timezone.now() - timedelta(days=4))
        self.assertIn('1', devolver_conversaciones_inactivas())


# ── Ventana de 24 h ───────────────────────────────────────────────────────────

class VentanaTest(ConvBase):
    def url(self, conv, ruta):
        return f'{API}conversaciones/{conv.id}/{ruta}/'

    def test_texto_libre_fuera_de_ventana_da_400_y_plantilla_se_permite(self):
        conv = self.conversacion(ultimo_entrante_en=timezone.now() - timedelta(hours=25))
        with patch('requests.post') as post:
            r = self.api.post(self.url(conv, 'mensajes'), {'cuerpo': 'Hola'}, format='json')
            self.assertEqual(r.status_code, 400)
            self.assertTrue(r.data['ventana_cerrada'])
            post.assert_not_called()
        self.assertFalse(r.data['detail'] == '')
        with patch('requests.post', return_value=respuesta_meta('wamid.T')) as post:
            r = self.api.post(self.url(conv, 'plantilla'), {
                'nombre': 'reabrir_conversacion', 'idioma': 'es', 'parametros': ['Maria'],
                'cuerpo': 'Hola Maria, ¿podemos ayudarle?'}, format='json')
        self.assertEqual(r.status_code, 201, r.content)
        enviado = post.call_args.kwargs['json']
        self.assertEqual(enviado['type'], 'template')
        self.assertEqual(enviado['template']['name'], 'reabrir_conversacion')
        self.assertEqual(r.data['mensaje']['tipo'], 'plantilla')
        self.assertEqual(r.data['conversacion']['estado'], 'automatico')   # la plantilla no toma la conversación

    def test_texto_libre_dentro_de_ventana_se_envia_y_toma_la_conversacion(self):
        conv = self.conversacion(ultimo_entrante_en=timezone.now() - timedelta(hours=23, minutes=59))
        self.assertTrue(srv.ventana(conv)['abierta'])
        with patch('requests.post', return_value=respuesta_meta('wamid.L')) as post:
            r = self.api.post(self.url(conv, 'mensajes'), {'cuerpo': ' Buenas tardes '}, format='json')
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(post.call_args.kwargs['json']['text']['body'], 'Buenas tardes')
        self.assertEqual(r.data['mensaje']['estado_entrega'], 'enviado')
        self.assertEqual(r.data['conversacion']['estado'], 'humano')
        self.assertEqual(r.data['conversacion']['tomada_por']['id'], self.admin.id)
        self.assertTrue(MensajeWhatsApp.objects.filter(wa_message_id='wamid.L', enviado_por=self.admin).exists())

    def test_sin_mensajes_entrantes_la_ventana_esta_cerrada(self):
        conv = self.conversacion()
        r = self.api.post(self.url(conv, 'mensajes'), {'cuerpo': 'Hola'}, format='json')
        self.assertEqual(r.status_code, 400)
        self.assertEqual(r.data['ventana_cerrada'], True)

    def test_meta_rechaza_el_envio_devuelve_502_sin_registrar(self):
        conv = self.conversacion(ultimo_entrante_en=timezone.now())
        with patch('requests.post', side_effect=Exception('boom')):
            r = self.api.post(self.url(conv, 'mensajes'), {'cuerpo': 'Hola'}, format='json')
        self.assertEqual(r.status_code, 502)
        self.assertFalse(MensajeWhatsApp.objects.exists())

    def test_mensaje_vacio_es_400(self):
        conv = self.conversacion(ultimo_entrante_en=timezone.now())
        r = self.api.post(self.url(conv, 'mensajes'), {'cuerpo': '  '}, format='json')
        self.assertEqual(r.status_code, 400)
        self.assertNotIn('ventana_cerrada', r.data)


# ── Endpoints ─────────────────────────────────────────────────────────────────

class EndpointsTest(ConvBase):
    def test_apagado_responde_409_en_todo(self):
        self.config(activo=False)
        conv = ConversacionWhatsApp.objects.create(telefono=TELEFONO)
        for metodo, ruta in (
                ('get', 'conversaciones/'), ('get', f'conversaciones/{conv.id}/'),
                ('get', f'conversaciones/{conv.id}/mensajes/'), ('post', f'conversaciones/{conv.id}/mensajes/'),
                ('post', f'conversaciones/{conv.id}/plantilla/'), ('post', f'conversaciones/{conv.id}/nota/'),
                ('post', f'conversaciones/{conv.id}/tomar/'), ('post', f'conversaciones/{conv.id}/devolver/'),
                ('post', f'conversaciones/{conv.id}/vincular/'), ('post', f'conversaciones/{conv.id}/leida/'),
                ('post', 'conversaciones/iniciar/'), ('get', 'conversaciones/plantillas/'),
                ('get', 'respuestas-rapidas/'), ('post', 'respuestas-rapidas/')):
            r = getattr(self.api, metodo)(API + ruta)
            self.assertEqual(r.status_code, 409, ruta)
            self.assertTrue(r.data['apagada'])

    def test_sin_autenticar_o_sin_rol_no_entra(self):
        self.config()
        self.assertEqual(APIClient().get(API + 'conversaciones/').status_code, 401)

    def test_lista_con_filtros_y_desde_incremental(self):
        self.config()
        a = srv.obtener_conversacion(TELEFONO)
        b = srv.obtener_conversacion('+584249999999')
        t0 = timezone.now() - timedelta(hours=1)
        ConversacionWhatsApp.objects.filter(pk=a.pk).update(actualizado_en=t0 - timedelta(minutes=5))
        ConversacionWhatsApp.objects.filter(pk=b.pk).update(actualizado_en=t0 - timedelta(minutes=10))
        srv.registrar_entrante(a, 'texto', 'Hola, necesito ayuda')
        r = self.api.get(API + 'conversaciones/')
        self.assertEqual(r.status_code, 200)
        self.assertEqual([c['id'] for c in r.data['results']], [a.id, b.id])   # más reciente primero
        fila = r.data['results'][0]
        self.assertEqual(fila['no_leidos'], 1)
        self.assertEqual(fila['ultimo_mensaje']['cuerpo'], 'Hola, necesito ayuda')
        self.assertTrue(fila['ventana']['abierta'])
        self.assertEqual(fila['representante']['id'], self.rep.id)

        self.assertEqual([c['id'] for c in self.api.get(API + 'conversaciones/', {'filtro': 'sin_vincular'}).data['results']], [b.id])
        self.assertEqual([c['id'] for c in self.api.get(API + 'conversaciones/', {'filtro': 'no_leidas'}).data['results']], [a.id])
        self.assertEqual(self.api.get(API + 'conversaciones/', {'filtro': 'humano'}).data['count'], 0)
        self.assertEqual(self.api.get(API + 'conversaciones/', {'filtro': 'inventado'}).status_code, 400)
        self.assertEqual([c['id'] for c in self.api.get(API + 'conversaciones/', {'q': 'maria'}).data['results']], [a.id])

        incremental = self.api.get(API + 'conversaciones/', {'desde': t0.isoformat()})
        self.assertEqual([c['id'] for c in incremental.data['results']], [a.id])   # solo lo cambiado
        self.assertEqual(self.api.get(API + 'conversaciones/', {'desde': 'ayer'}).status_code, 400)

    def test_hilo_incremental_incluye_cambios_de_entrega(self):
        conv = self.conversacion()
        m1 = srv.registrar_entrante(conv, 'texto', 'uno', wa_message_id='e1')
        m2 = srv.registrar_saliente(conv, 'texto', 'dos', wa_message_id='s1', usuario=self.admin, humano=True)
        srv.agregar_nota(conv, 'nota privada', self.admin)
        r = self.api.get(f'{API}conversaciones/{conv.id}/mensajes/')
        self.assertEqual([m['cuerpo'] for m in r.data['results']], ['uno', 'dos', 'nota privada'])
        self.assertEqual([m['direccion'] for m in r.data['results']], ['entrante', 'saliente', 'nota'])
        self.assertFalse(r.data['hay_mas'])
        corte = r.data['ahora']
        self.assertEqual(self.api.get(f'{API}conversaciones/{conv.id}/mensajes/', {'desde': corte}).data['count'], 0)
        webhook_meta.procesar_status({'id': 's1', 'status': 'read'})
        r = self.api.get(f'{API}conversaciones/{conv.id}/mensajes/', {'desde': corte})
        self.assertEqual([(m['id'], m['estado_entrega']) for m in r.data['results']], [(m2.id, 'leido')])
        self.assertNotEqual(m1.id, m2.id)

    def test_tomar_devolver_leida_nota(self):
        conv = self.conversacion()
        srv.registrar_entrante(conv, 'texto', 'hola')
        r = self.api.post(f'{API}conversaciones/{conv.id}/tomar/')
        self.assertEqual((r.status_code, r.data['estado']), (200, 'humano'))
        self.assertEqual(r.data['tomada_por']['id'], self.admin.id)
        self.assertFalse(r.data['requiere_humano'])
        r = self.api.post(f'{API}conversaciones/{conv.id}/nota/', {'cuerpo': 'Llamar mañana'}, format='json')
        self.assertEqual((r.status_code, r.data['mensaje']['direccion']), (201, 'nota'))
        self.assertEqual(self.api.post(f'{API}conversaciones/{conv.id}/nota/', {'cuerpo': ''}, format='json').status_code, 400)
        r = self.api.post(f'{API}conversaciones/{conv.id}/leida/')
        self.assertEqual(r.data['no_leidos'], 0)
        r = self.api.post(f'{API}conversaciones/{conv.id}/devolver/')
        self.assertEqual((r.data['estado'], r.data['tomada_por']), ('automatico', None))
        self.assertEqual(self.api.post(f'{API}conversaciones/9999/tomar/').status_code, 404)

    def test_iniciar_conversacion_de_un_representante(self):
        self.config()
        r = self.api.post(API + 'conversaciones/iniciar/', {'representante_id': self.rep.id}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual((r.data['telefono'], r.data['representante']['id']), (TELEFONO, self.rep.id))
        self.assertFalse(r.data['ventana']['abierta'])
        again = self.api.post(API + 'conversaciones/iniciar/', {'representante_id': self.rep.id}, format='json')
        self.assertEqual(again.data['id'], r.data['id'])
        self.assertEqual(self.api.post(API + 'conversaciones/iniciar/', {'representante_id': 0}, format='json').status_code, 400)

    def test_plantillas_disponibles(self):
        from .models import PlantillaWhatsApp
        PlantillaWhatsApp.objects.create(nombre='Aviso', cuerpo='x', nombre_plantilla_meta='cobro_pendiente')
        PlantillaWhatsApp.objects.create(nombre='Manual', cuerpo='y')
        self.config()
        r = self.api.get(API + 'conversaciones/plantillas/')
        self.assertEqual([p['nombre_meta'] for p in r.data['results']], ['cobro_pendiente'])

    def test_respuestas_rapidas_crud_y_variables(self):
        self.ciclo('E1', monto=50)
        conv = srv.obtener_conversacion(TELEFONO)
        r = self.api.post(API + 'respuestas-rapidas/', {
            'titulo': 'Saldo', 'cuerpo': 'Hola {nombre}, su saldo es ${saldo_usd}. Alumno(s): {alumnos}. {nada}'},
            format='json')
        self.assertEqual(r.status_code, 201, r.content)
        rid = r.data['id']
        self.assertEqual(self.api.post(API + 'respuestas-rapidas/', {'titulo': '', 'cuerpo': 'x'}, format='json').status_code, 400)
        r = self.api.get(API + 'respuestas-rapidas/', {'conversacion': conv.id})
        self.assertEqual(r.data['results'][0]['cuerpo_renderizado'],
                         'Hola Maria, su saldo es $50.00. Alumno(s): Ana E1. {nada}')
        r = self.api.patch(f'{API}respuestas-rapidas/{rid}/', {'activa': False, 'orden': 3}, format='json')
        self.assertEqual((r.status_code, r.data['activa'], r.data['orden']), (200, False, 3))
        self.assertEqual(self.api.get(API + 'respuestas-rapidas/').data['count'], 0)
        self.assertEqual(self.api.get(API + 'respuestas-rapidas/', {'todas': '1'}).data['count'], 1)
        self.assertEqual(self.api.delete(f'{API}respuestas-rapidas/{rid}/').status_code, 204)
        self.assertFalse(RespuestaRapida.objects.exists())

    def test_descarga_autenticada_del_adjunto(self):
        from django.core.files.base import ContentFile
        conv = self.conversacion()
        m = MensajeWhatsApp.objects.create(conversacion=conv, direccion='entrante', tipo='imagen')
        m.adjunto.save('foto.png', ContentFile(PNG))
        r = self.api.get(f'{API}mensajes/{m.id}/archivo/')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(b''.join(r.streaming_content), PNG)
        self.assertEqual(APIClient().get(f'{API}mensajes/{m.id}/archivo/').status_code, 401)
        self.assertEqual(self.api.get(f'{API}mensajes/9999/archivo/').status_code, 404)


# ── Hoy ───────────────────────────────────────────────────────────────────────

class HoyConversacionesTest(ConvBase):
    def tarjetas(self):
        return servicio_hoy.calcular_hoy({self.sede.id}, HOY, AHORA)['tarjetas']

    def test_requiere_humano_genera_tarjeta_urgente_con_abrir_chat_habilitado(self):
        conv = self.conversacion(requiere_humano=True, ultimo_entrante_en=AHORA - timedelta(minutes=5))
        t = [x for x in self.tarjetas() if x['tipo'] == 'conversacion_espera'][0]
        self.assertEqual((t['clave'], t['urgente']), (f'conversacion_espera:{conv.id}', True))
        self.assertEqual(t['representante']['id'], self.rep.id)
        self.assertEqual(t['acciones'], [{'accion': 'abrir_chat', 'etiqueta': 'Abrir chat',
                                          'disponible': True, 'conversacion': conv.id}])

    def test_sin_respuesta_por_mas_de_2_horas(self):
        conv = self.conversacion(ultimo_entrante_en=AHORA - timedelta(hours=1, minutes=59))
        self.assertFalse([x for x in self.tarjetas() if x['tipo'] == 'conversacion_espera'])
        conv.ultimo_entrante_en = AHORA - timedelta(hours=2, minutes=1)
        conv.save()
        self.assertEqual(len([x for x in self.tarjetas() if x['tipo'] == 'conversacion_espera']), 1)
        conv.ultimo_humano_en = AHORA - timedelta(hours=1)    # ya le respondieron
        conv.save()
        self.assertFalse([x for x in self.tarjetas() if x['tipo'] == 'conversacion_espera'])

    def test_conversacion_tomada_sin_actividad_por_mas_de_24_horas(self):
        conv = self.conversacion(estado='humano', tomada_en=AHORA - timedelta(hours=23))
        self.assertFalse([x for x in self.tarjetas() if x['tipo'] == 'conversacion_tomada'])
        conv.tomada_en = AHORA - timedelta(hours=25)
        conv.save()
        t = [x for x in self.tarjetas() if x['tipo'] == 'conversacion_tomada'][0]
        self.assertEqual([a['accion'] for a in t['acciones']], ['abrir_chat', 'devolver_automatico'])
        conv.ultimo_humano_en = AHORA - timedelta(hours=1)
        conv.save()
        self.assertFalse([x for x in self.tarjetas() if x['tipo'] == 'conversacion_tomada'])

    def test_marcar_hecha_oculta_hasta_un_nuevo_mensaje(self):
        conv = self.conversacion(requiere_humano=True, ultimo_entrante_en=AHORA - timedelta(hours=3))
        clave = f'conversacion_espera:{conv.id}'
        self.assertTrue(servicio_hoy.marcar_tarjeta_hecha(clave, self.admin, {self.sede.id}, HOY, AHORA))
        # `ahora` de la tarjeta: el evento se crea con la hora real, posterior a `desde`
        self.assertNotIn(clave, [t['clave'] for t in self.tarjetas()])

    def test_abrir_chat_de_otras_tarjetas_queda_habilitado(self):
        self.ciclo('E1', dia_limite=1, monto=200)
        conv = srv.obtener_conversacion(TELEFONO)
        t = [x for x in self.tarjetas() if x['tipo'] == 'caso_prioritario'][0]
        chat = [a for a in t['acciones'] if a['accion'] == 'abrir_chat'][0]
        self.assertEqual((chat['disponible'], chat['conversacion']), (True, conv.id))

    def test_contadores_incluyen_no_leidos(self):
        self.config()
        conv = srv.obtener_conversacion(TELEFONO)
        srv.registrar_entrante(conv, 'texto', 'a')
        srv.registrar_entrante(conv, 'texto', 'b')
        r = self.api.get(API + 'contadores/')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data['no_leidos'], 2)
        self.assertEqual(r.data['total'], r.data['no_leidos'] + r.data['tarjetas_urgentes'])
