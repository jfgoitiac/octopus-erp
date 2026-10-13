"""
Tests de gestión humana, convenios, bandeja y dashboard de Cobranza Inteligente
(PLAN_COBRANZA_INTELIGENTE.md, Fases 3 y 4). Fechas siempre fijas.
"""
from datetime import date, timedelta
from decimal import Decimal

from rest_framework.test import APIClient

from . import gestion
from .dashboard import calcular_dashboard
from .models import CicloCobranza, ConvenioPago, EventoCiclo, LineaBaseCobranza
from .test_motor_cobranza import AHORA, HOY, MotorBase
from .ciclos import evaluar_ciclos_sede


class GestionBase(MotorBase):
    def ciclo(self, cedula='E1', dia_limite=17, monto=50, rep=None):
        self.mens(self.alumno(cedula, dia_limite, rep), monto=monto)
        self.config()
        evaluar_ciclos_sede(self.sede.id, HOY)
        return CicloCobranza.objects.filter(mensualidad__alumno__cedula_escolar=cedula).get()


class AccionesTest(GestionBase):
    def test_pausar_exige_motivo_y_reanudar_vuelve_a_la_etapa(self):
        c = self.ciclo()
        etapa = c.estado
        with self.assertRaises(gestion.AccionInvalida):
            gestion.pausar_ciclo(c, '  ', self.admin)
        gestion.pausar_ciclo(c, 'viaje', self.admin)
        self.assertEqual(c.estado, CicloCobranza.PAUSADA)
        gestion.reanudar_ciclo(c, self.admin, HOY)
        self.assertEqual(c.estado, etapa)
        tipos = list(c.eventos.values_list('tipo', flat=True))
        self.assertIn('ciclo_pausado', tipos)
        self.assertIn('ciclo_reanudado', tipos)

    def test_cerrar_valida_motivo_y_no_se_repite(self):
        c = self.ciclo()
        with self.assertRaises(gestion.AccionInvalida):
            gestion.cerrar_ciclo(c, 'inventado', self.admin)
        gestion.cerrar_ciclo(c, 'descartada', self.admin)
        self.assertFalse(c.abierto)
        with self.assertRaises(gestion.AccionInvalida):
            gestion.registrar_gestion(c, 'nota', self.admin, 'x')

    def test_nota_vacia_rechazada(self):
        c = self.ciclo()
        with self.assertRaises(gestion.AccionInvalida):
            gestion.registrar_gestion(c, 'nota', self.admin, '')


class ConvenioTest(GestionBase):
    def cuotas(self, *montos):
        return [(HOY + timedelta(days=7 * i), Decimal(m)) for i, m in enumerate(montos, start=1)]

    def test_suma_debe_igualar_saldo(self):
        c = self.ciclo(monto=50)
        with self.assertRaises(gestion.AccionInvalida):
            gestion.crear_convenio(self.rep, [c], self.cuotas('20', '20'), self.admin, hoy=HOY)

    def test_fechas_pasadas_rechazadas(self):
        c = self.ciclo(monto=50)
        with self.assertRaises(gestion.AccionInvalida):
            gestion.crear_convenio(
                self.rep, [c], [(HOY - timedelta(days=1), Decimal('50'))], self.admin, hoy=HOY)

    def test_crear_pausa_y_cumplir_reanuda(self):
        c = self.ciclo(monto=50)
        etapa = c.estado
        conv = gestion.crear_convenio(self.rep, [c], self.cuotas('25', '25'), self.admin, hoy=HOY)
        c.refresh_from_db()
        self.assertEqual((c.estado, c.motivo_pausa), (CicloCobranza.PAUSADA, 'convenio'))
        with self.assertRaises(gestion.AccionInvalida):   # no se duplica
            gestion.crear_convenio(self.rep, [c], self.cuotas('50'), self.admin, hoy=HOY)
        for q in conv.cuotas.all():
            gestion.marcar_cuota_pagada(q, self.admin)
        conv.refresh_from_db(); c.refresh_from_db()
        self.assertEqual(conv.estado, ConvenioPago.CUMPLIDO)
        self.assertEqual(c.estado, etapa)

    def test_incumplimiento_devuelve_al_ciclo(self):
        c = self.ciclo(monto=50)
        conv = gestion.crear_convenio(self.rep, [c], self.cuotas('50'), self.admin, hoy=HOY)
        self.assertEqual(gestion.revisar_convenios(HOY + timedelta(days=7)), 0)   # aún vigente
        self.assertEqual(gestion.revisar_convenios(HOY + timedelta(days=8)), 1)
        conv.refresh_from_db(); c.refresh_from_db()
        self.assertEqual(conv.estado, ConvenioPago.INCUMPLIDO)
        self.assertNotEqual(c.estado, CicloCobranza.PAUSADA)
        self.assertTrue(c.eventos.filter(tipo='convenio_incumplido').exists())

    def test_cancelar_reanuda(self):
        c = self.ciclo(monto=50)
        conv = gestion.crear_convenio(self.rep, [c], self.cuotas('50'), self.admin, hoy=HOY)
        gestion.cancelar_convenio(conv, self.admin)
        c.refresh_from_db()
        self.assertNotEqual(c.estado, CicloCobranza.PAUSADA)


class BandejaTest(GestionBase):
    def test_puntaje_explicable_y_orden(self):
        grave = self.ciclo('E1', dia_limite=1, monto=200)    # 19 días de mora
        leve = self.ciclo('E2', dia_limite=17, monto=20, rep=None)
        filas = gestion.calcular_bandeja(CicloCobranza.objects.all(), HOY, AHORA)
        self.assertEqual(len(filas), 1)   # mismo representante: una fila
        f = filas[0]
        self.assertEqual(f['puntaje'], sum(r['puntos'] for r in f['razones']))
        self.assertEqual(f['dias_mora_max'], 19)
        self.assertEqual(set(f['ciclos']), {grave.id, leve.id})

    def test_pausado_no_cuenta_mora(self):
        c = self.ciclo(dia_limite=1)
        gestion.pausar_ciclo(c, 'reclamo', self.admin)
        self.assertEqual(gestion.calcular_bandeja(CicloCobranza.objects.all(), HOY, AHORA), [])


class ApiTest(GestionBase):
    def setUp(self):
        super().setUp()
        self.api = APIClient()
        self.api.force_authenticate(self.admin)

    def test_apagado_responde_409(self):
        self.config(activo=False)
        for url in ('bandeja/', 'pagos-revision/', 'dashboard/', 'convenios/'):
            r = self.api.get(f'/api/cobranza/inteligente/{url}')
            self.assertEqual(r.status_code, 409, url)

    def test_accion_pausar_y_auditoria(self):
        c = self.ciclo()
        r = self.api.post(f'/api/cobranza/inteligente/ciclos/{c.id}/acciones/',
                          {'accion': 'pausar', 'motivo': 'viaje'}, format='json')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data['estado'], 'pausada')
        self.assertTrue(EventoCiclo.objects.filter(ciclo=c, tipo='ciclo_pausado', usuario=self.admin).exists())
        r = self.api.post(f'/api/cobranza/inteligente/ciclos/{c.id}/acciones/',
                          {'accion': 'pausar', 'motivo': ''}, format='json')
        self.assertEqual(r.status_code, 400)

    def test_crear_convenio_por_api(self):
        c = self.ciclo(monto=50)
        fecha = str(date.today() + timedelta(days=10))
        r = self.api.post('/api/cobranza/inteligente/convenios/', {
            'representante_id': self.rep.id, 'ciclo_ids': [c.id],
            'cuotas': [{'fecha': fecha, 'monto': '50.00'}]}, format='json')
        self.assertEqual(r.status_code, 201, r.data)
        r2 = self.api.post(f"/api/cobranza/inteligente/convenios/cuotas/{r.data['cuotas'][0]['id']}/pagar/")
        self.assertEqual(r2.data['estado'], 'cumplido')

    def test_linea_base_y_dashboard(self):
        self.ciclo(dia_limite=1)
        r = self.api.put('/api/cobranza/inteligente/linea-base/', {'cobrado_al_vencimiento_pct': '120'}, format='json')
        self.assertEqual(r.status_code, 400)
        r = self.api.put(f'/api/cobranza/inteligente/linea-base/?sede={self.sede.id}',
                         {'cobrado_al_vencimiento_pct': '60', 'mora_7_pct': '30'}, format='json')
        self.assertEqual(r.status_code, 200, r.data)
        r = self.api.get('/api/cobranza/inteligente/dashboard/')
        self.assertEqual(r.status_code, 200)
        self.assertIn('comparacion_linea_base', r.data)
        self.assertEqual(r.data['bandeja']['casos_abiertos'], 1)

    def test_dashboard_calcula_recuperado(self):
        c = self.ciclo(dia_limite=1)
        gestion.registrar_gestion(c, 'llamada', self.admin, 'llamé')
        d = calcular_dashboard({self.sede.id}, HOY, AHORA)
        self.assertEqual(d['distribucion_por_etapa'][c.estado]['casos'], 1)
        self.assertEqual(d['recuperado']['casos_totales'], 0)


class AccionSugeridaYTakeoverTest(GestionBase):
    def test_sugiere_recordatorio_en_mora_temprana(self):
        self.ciclo(dia_limite=1)   # 19 días de mora, sin otras señales
        f = gestion.calcular_bandeja(CicloCobranza.objects.all(), HOY, AHORA)[0]
        self.assertEqual(f['accion_sugerida']['codigo'], 'enviar_recordatorio')
        self.assertFalse(f['gestion_humana'])

    def test_sugiere_convenio_con_varias_deudas(self):
        alumno = self.alumno('E1', 1)
        for mes in (5, 6, 7):
            self.mens(alumno, mes=mes)
        self.config()
        evaluar_ciclos_sede(self.sede.id, HOY)
        f = gestion.calcular_bandeja(CicloCobranza.objects.all(), HOY, AHORA)[0]
        self.assertEqual(f['accion_sugerida']['codigo'], 'ofrecer_convenio')

    def test_takeover_calla_al_bot_pero_sigue_en_bandeja(self):
        c = self.ciclo(dia_limite=1)
        etapa = c.estado
        gestion.tomar_conversacion([c], self.admin)
        c.refresh_from_db()
        self.assertEqual((c.estado, c.motivo_pausa, c.responsable), (CicloCobranza.PAUSADA, 'gestion_humana', self.admin))
        filas = gestion.calcular_bandeja(CicloCobranza.objects.all(), HOY, AHORA)
        self.assertEqual(len(filas), 1)
        self.assertTrue(filas[0]['gestion_humana'])
        gestion.devolver_al_bot([c], self.admin)
        c.refresh_from_db()
        self.assertEqual(c.estado, etapa)
        with self.assertRaises(gestion.AccionInvalida):
            gestion.devolver_al_bot([c], self.admin)

    def test_devolver_respeta_otras_pausas(self):
        c = self.ciclo(dia_limite=1)
        gestion.pausar_ciclo(c, 'reclamo', self.admin)
        with self.assertRaises(gestion.AccionInvalida):
            gestion.devolver_al_bot([c], self.admin)

    def test_proxima_accion_se_guarda_y_se_limpia(self):
        c = self.ciclo(dia_limite=1)
        self.assertEqual(gestion.actualizar_proximas_acciones(CicloCobranza.objects.all(), HOY), 1)
        c.refresh_from_db()
        self.assertEqual((c.proxima_accion, c.proxima_accion_fecha), ('Enviar recordatorio por WhatsApp', HOY))
        gestion.pausar_ciclo(c, 'reclamo', self.admin)
        gestion.actualizar_proximas_acciones(CicloCobranza.objects.all(), HOY)
        c.refresh_from_db()
        self.assertEqual(c.proxima_accion, '')


class ConversacionApiTest(GestionBase):
    def setUp(self):
        super().setUp()
        self.api = APIClient()
        self.api.force_authenticate(self.admin)

    def url(self):
        return f'/api/cobranza/inteligente/representantes/{self.rep.id}/conversacion/'

    def test_linea_de_tiempo_une_mensajes_y_gestiones_sin_duplicar(self):
        from notificaciones.models import NotificacionLog
        c = self.ciclo(dia_limite=1)
        gestion.registrar_gestion(c, 'llamada', self.admin, 'prometió pagar')
        log = NotificacionLog.objects.create(canal='whatsapp', tipo='cobro_whatsapp', estado='enviado',
                                             destinatario='0412', mensaje='Hola Maria', representante_cedula='V1')
        gestion.registrar_cobro_whatsapp(self.rep.id, self.admin, 'Hola Maria', log.id)
        r = self.api.get(self.url())
        self.assertEqual(r.status_code, 200, r.data)
        linea = r.data['linea_de_tiempo']
        mensajes = [i for i in linea if i['clase'] == 'mensaje']
        self.assertEqual([(m['autor'], m['texto']) for m in mensajes], [('personal', 'Hola Maria')])
        self.assertTrue(any(i.get('tipo') == 'llamada_registrada' for i in linea))
        self.assertFalse(any(i.get('tipo') == 'whatsapp_manual' for i in linea))
        # La vista usa la fecha real: la deuda de julio ya pasa de 30 días de mora.
        self.assertEqual(r.data['accion_sugerida']['codigo'], 'ofrecer_convenio')
        # El cobro sí cuenta como gestión de la deuda (atribución).
        self.assertTrue(EventoCiclo.objects.filter(ciclo=c, tipo='whatsapp_manual').exists())

    def test_tomar_y_devolver_por_api(self):
        self.ciclo(dia_limite=1)
        r = self.api.post(self.url(), {'accion': 'tomar'}, format='json')
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(r.data['gestion_humana'], {'activa': True, 'responsable': 'admin'})
        self.assertTrue(any(i.get('texto') == 'gestion_humana' for i in r.data['linea_de_tiempo']))
        r = self.api.post(self.url(), {'accion': 'devolver'}, format='json')
        self.assertFalse(r.data['gestion_humana']['activa'])
        self.assertEqual(self.api.post(self.url(), {'accion': 'otra'}, format='json').status_code, 400)

    def test_representante_sin_deudas_404(self):
        self.config()
        self.assertEqual(self.api.get(self.url()).status_code, 404)


class WhatsAppEntranteTest(GestionBase):
    """Respuestas del representante por webhook y contestación desde la conversación."""

    def setUp(self):
        super().setUp()
        self.api = APIClient()
        self.api.force_authenticate(self.admin)

    def meta(self, cuerpo, secreto='secreto'):
        import hashlib, hmac, json
        crudo = json.dumps(cuerpo).encode()
        firma = 'sha256=' + hmac.new(secreto.encode(), crudo, hashlib.sha256).hexdigest()
        return APIClient().post('/api/notificaciones/whatsapp/webhook/meta/', crudo,
                                content_type='application/json', HTTP_X_HUB_SIGNATURE_256=firma)

    def mensaje(self, texto='Pago el viernes', wamid='wamid.1', de='584121234567'):
        return {'entry': [{'changes': [{'value': {'messages': [
            {'from': de, 'id': wamid, 'type': 'text', 'text': {'body': texto}}]}}]}]}

    def test_verificacion_meta(self):
        with self.settings(META_WEBHOOK_VERIFY_TOKEN='tok'):
            url = '/api/notificaciones/whatsapp/webhook/meta/'
            ok = APIClient().get(url, {'hub.mode': 'subscribe', 'hub.verify_token': 'tok', 'hub.challenge': '42'})
            self.assertEqual((ok.status_code, ok.content), (200, b'42'))
            self.assertEqual(APIClient().get(url, {'hub.mode': 'subscribe', 'hub.verify_token': 'x'}).status_code, 403)

    def test_firma_invalida_rechazada_y_valida_guarda_sin_duplicar(self):
        from notificaciones.models import NotificacionLog
        with self.settings(META_APP_SECRET='secreto'):
            self.assertEqual(self.meta(self.mensaje(), secreto='otro').status_code, 403)
            self.assertEqual(self.meta(self.mensaje()).data, {'recibidos': 1})
            self.assertEqual(self.meta(self.mensaje()).data, {'recibidos': 0})   # reintento de Meta
        log = NotificacionLog.objects.get(tipo='respuesta_whatsapp')
        self.assertEqual((log.representante_cedula, log.mensaje), ('V1', 'Pago el viernes'))

    def test_twilio_exige_firma(self):
        from notificaciones.models import NotificacionLog
        import base64, hashlib, hmac
        url = 'http://testserver/api/notificaciones/whatsapp/webhook/twilio/'
        datos = {'From': 'whatsapp:+584121234567', 'Body': 'Hola', 'MessageSid': 'SM1', 'NumMedia': '0'}
        firma = base64.b64encode(hmac.new(b'tw', (url + ''.join(f'{k}{datos[k]}' for k in sorted(datos))).encode(),
                                          hashlib.sha1).digest()).decode()
        with self.settings(TWILIO_AUTH_TOKEN='tw'):
            self.assertEqual(APIClient().post(url, datos, HTTP_X_TWILIO_SIGNATURE='mala').status_code, 403)
            self.assertEqual(APIClient().post(url, datos, HTTP_X_TWILIO_SIGNATURE=firma).status_code, 200)
        self.assertTrue(NotificacionLog.objects.filter(tipo='respuesta_whatsapp', representante_cedula='V1').exists())

    def test_respuesta_aparece_en_bandeja_y_conversacion_hasta_contestarla(self):
        self.ciclo(dia_limite=1)
        with self.settings(META_APP_SECRET='secreto'):
            self.meta(self.mensaje())
        fila = gestion.calcular_bandeja(CicloCobranza.objects.all())[0]
        self.assertEqual(fila['accion_sugerida']['codigo'], 'responder')
        url = f'/api/cobranza/inteligente/representantes/{self.rep.id}/conversacion/'
        r = self.api.get(url)
        entrantes = [i for i in r.data['linea_de_tiempo'] if i.get('autor') == 'representante']
        self.assertEqual([i['texto'] for i in entrantes], ['Pago el viernes'])
        self.assertTrue(r.data['whatsapp']['ventana_abierta'])
        # Sin proveedor configurado la API no puede enviar: se usa el enlace (modo manual).
        self.assertEqual(self.api.post(url, {'accion': 'responder', 'texto': 'Gracias', 'modo': 'api'},
                                       format='json').status_code, 400)
        r = self.api.post(url, {'accion': 'responder', 'texto': 'Gracias, quedamos atentos', 'modo': 'manual'}, format='json')
        self.assertEqual(r.status_code, 200, r.data)
        self.assertIn(('personal', 'Gracias, quedamos atentos'),
                      [(i['autor'], i['texto']) for i in r.data['linea_de_tiempo'] if i['clase'] == 'mensaje'])
        fila = gestion.calcular_bandeja(CicloCobranza.objects.all())[0]
        self.assertNotEqual(fila['accion_sugerida']['codigo'], 'responder')


class WhatsAppEntranteMejorasTest(WhatsAppEntranteTest):
    """Configuración desde la app, adjuntos y aviso push."""

    def respuesta(self, datos, contenido=b'', cabeceras=None):
        from unittest.mock import MagicMock
        r = MagicMock(status_code=200, content=contenido, headers=cabeceras or {})
        r.json.return_value = datos
        r.raise_for_status.return_value = None
        return r

    def test_configuracion_desde_la_app(self):
        from notificaciones.models import ConfiguracionNotificaciones
        from authentication.models import PerfilUsuario
        PerfilUsuario.objects.update_or_create(user=self.admin, defaults={'rol': 'director'})
        self.api.force_authenticate(type(self.admin).objects.get(pk=self.admin.pk))  # sin el perfil cacheado
        r = self.api.get('/api/notificaciones/configuracion/')
        self.assertEqual(r.status_code, 200, r.data)
        token = r.data['meta_webhook_verify_token']
        self.assertTrue(len(token) > 20)
        self.assertTrue(r.data['webhooks_whatsapp']['meta'].endswith('/api/notificaciones/whatsapp/webhook/meta/'))
        r = self.api.patch('/api/notificaciones/configuracion/', {'meta_app_secret': 'secreto'}, format='json')
        self.assertEqual(r.data['meta_app_secret'], '••••reto')
        self.assertEqual(ConfiguracionNotificaciones.objects.get(pk=1).meta_app_secret, 'secreto')
        # El webhook usa lo guardado en la app, sin variables de entorno.
        ok = APIClient().get('/api/notificaciones/whatsapp/webhook/meta/',
                             {'hub.mode': 'subscribe', 'hub.verify_token': token, 'hub.challenge': '7'})
        self.assertEqual(ok.content, b'7')
        self.assertEqual(self.meta(self.mensaje()).data, {'recibidos': 1})

    def mensaje_imagen(self, mime='image/jpeg'):
        return {'entry': [{'changes': [{'value': {'messages': [{
            'from': '584121234567', 'id': 'wamid.img', 'type': 'image',
            'image': {'id': 'MEDIA1', 'mime_type': mime, 'caption': 'El comprobante'}}]}}]}]}

    def test_descarga_y_sirve_el_adjunto(self):
        from unittest.mock import patch
        from notificaciones.models import NotificacionLog
        respuestas = [self.respuesta({'url': 'https://lookaside/x', 'mime_type': 'image/jpeg', 'file_size': 4}),
                      self.respuesta({}, contenido=b'\xff\xd8ok')]
        with self.settings(META_APP_SECRET='secreto'), patch('requests.get', side_effect=respuestas) as get:
            self.meta(self.mensaje_imagen())
        self.assertEqual(get.call_args_list[0].args[0], 'https://graph.facebook.com/v19.0/MEDIA1')
        log = NotificacionLog.objects.get(tipo='respuesta_whatsapp')
        self.assertEqual((log.mensaje, log.adjunto_tipo), ('El comprobante', 'image/jpeg'))
        r = self.api.get(f'/api/notificaciones/whatsapp/adjuntos/{log.id}/')
        self.assertEqual((r.status_code, b''.join(r.streaming_content)), (200, b'\xff\xd8ok'))
        self.assertEqual(APIClient().get(f'/api/notificaciones/whatsapp/adjuntos/{log.id}/').status_code, 401)
        self.ciclo(dia_limite=1)
        conv = self.api.get(f'/api/cobranza/inteligente/representantes/{self.rep.id}/conversacion/').data
        self.assertEqual([i['adjunto'] for i in conv['linea_de_tiempo'] if i.get('autor') == 'representante'],
                         [{'id': log.id, 'tipo': 'image/jpeg'}])

    def test_tipo_no_permitido_o_fallo_deja_constancia(self):
        from unittest.mock import patch
        from notificaciones.models import NotificacionLog
        respuestas = [self.respuesta({'url': 'u', 'mime_type': 'application/x-msdownload', 'file_size': 3}),
                      self.respuesta({}, contenido=b'exe')]
        with self.settings(META_APP_SECRET='secreto'), patch('requests.get', side_effect=respuestas):
            self.meta(self.mensaje_imagen('application/x-msdownload'))
        log = NotificacionLog.objects.get(tipo='respuesta_whatsapp')
        self.assertFalse(log.adjunto)
        self.assertIn('Archivo no permitido', log.mensaje)

    def test_avisa_por_push_al_responsable(self):
        from unittest.mock import patch
        c = self.ciclo(dia_limite=1)
        gestion.tomar_conversacion([c], self.admin)
        with self.settings(META_APP_SECRET='secreto'), patch('notificaciones.services.push_usuarios') as push:
            self.meta(self.mensaje())
        usuarios, tipo, titulo, cuerpo, url = push.call_args.args
        self.assertEqual((list(usuarios), tipo, cuerpo), ([self.admin], 'mensaje', 'Pago el viernes'))
        self.assertIn('respondió por WhatsApp', titulo)
        self.assertEqual(url, f'/cobranza/inteligente/representantes/{self.rep.id}')
