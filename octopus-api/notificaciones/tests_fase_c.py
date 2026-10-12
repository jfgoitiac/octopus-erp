"""
Cobranza Inteligente v4, Fase C (PLAN_COBRANZA_INTELIGENTE_V4.md §5): plantillas de Meta
con botones, árbol de botones (Ya pagué / Necesito un acuerdo / Hablar con alguien),
comprobantes recibidos por WhatsApp (pausa, tarjeta, convertir / descartar) y link al
portal. Todo con instantes fijos y Meta simulado con mocks.
"""
import itertools
from datetime import timedelta
from unittest.mock import patch

from django.core.files.base import ContentFile
from django.utils import timezone
from rest_framework.test import APIClient

from cobranza import flujo_botones, hoy as servicio_hoy
from cobranza.models import CicloCobranza, ConvenioPago, EnvioCobranza, ReglaCobranza
from cobranza.motor import evaluar_reglas_sede, procesar_envio
from cobranza.test_motor_cobranza import AHORA, HOY, WA
from portal.models import ComprobantePago

from . import conversaciones as srv
from .models import ConversacionWhatsApp, MensajeWhatsApp
from .tests_conversaciones import (
    API, PNG, TELEFONO, ConvBase, payload_texto, respuesta_meta,
)

_ids = itertools.count(1)


def meta_ok():
    """requests.post de Meta: cada llamada devuelve un wamid distinto (la columna es única)."""
    return patch('requests.post', side_effect=lambda *a, **k: respuesta_meta(f'out{next(_ids)}'))


def payload_boton(boton_id, titulo='x', wa_id=None):
    return payload_texto(tipo='button', wa_id=wa_id or f'in{next(_ids)}',
                         extra={'button': {'payload': boton_id, 'text': titulo}})


def payload_lista(fila_id, titulo='x', wa_id=None):
    return payload_texto(tipo='interactive', wa_id=wa_id or f'in{next(_ids)}', extra={
        'interactive': {'type': 'list_reply', 'list_reply': {'id': fila_id, 'title': titulo}}})


def payload_imagen(wa_id=None):
    return payload_texto(tipo='image', wa_id=wa_id or f'in{next(_ids)}', extra={
        'image': {'id': 'MEDIA1', 'mime_type': 'image/png', 'caption': 'pago'}})


def media_get(url, **kw):
    from unittest.mock import MagicMock
    r = MagicMock()
    r.raise_for_status.return_value = None
    if url.endswith('/MEDIA1'):
        r.json.return_value = {'url': 'https://lookaside/x', 'mime_type': 'image/png', 'file_size': len(PNG)}
    else:
        r.content = PNG
    return r


class FaseCBase(ConvBase):
    def setUp(self):
        super().setUp()
        p = patch('cobranza.flujo_botones._hoy', return_value=HOY)
        p.start()
        self.addCleanup(p.stop)
        self.ciclo_e1 = self.ciclo('E1', dia_limite=17)    # +3 hoy, saldo 50
        self.mens_e1 = self.ciclo_e1.mensualidad

    def boton(self, boton_id, titulo='x'):
        with meta_ok() as post:
            self.assertEqual(self.postear(payload_boton(boton_id, titulo)).status_code, 200)
        return post

    def lista(self, fila_id):
        with meta_ok() as post:
            self.assertEqual(self.postear(payload_lista(fila_id)).status_code, 200)
        return post

    def imagen(self, wa_id=None):
        with meta_ok(), patch('requests.get', side_effect=media_get):
            self.assertEqual(self.postear(payload_imagen(wa_id)).status_code, 200)

    def bot(self, conv=None):
        conv = conv or ConversacionWhatsApp.objects.get(telefono=TELEFONO)
        return list(conv.mensajes.filter(direccion='saliente').order_by('id'))

    def preparar_envio(self):
        evaluar_reglas_sede(self.sede.id, HOY)
        return EnvioCobranza.objects.get()


# ── 1. Plantilla de Meta con botones desde el motor ───────────────────────────

class PlantillaMetaMotorTest(FaseCBase):
    def test_con_plantilla_meta_sale_como_plantilla_con_botones_y_queda_en_la_conversacion(self):
        ReglaCobranza.objects.filter(sede=self.sede, dia_relativo=3).update(plantilla_meta='cobro_seguimiento')
        envio = self.preparar_envio()
        with meta_ok() as post:
            self.assertEqual(procesar_envio(envio, AHORA), 'enviado')
        enviado = post.call_args.kwargs['json']
        self.assertEqual(enviado['type'], 'template')
        t = enviado['template']
        self.assertEqual((t['name'], t['language']['code']), ('cobro_seguimiento', 'es'))
        cuerpo = next(c for c in t['components'] if c['type'] == 'body')['parameters']
        self.assertEqual(len(cuerpo), 6)
        self.assertEqual(cuerpo[0]['text'], 'Maria')
        self.assertEqual(cuerpo[2]['text'], '50.00')
        self.assertTrue(cuerpo[5]['text'].endswith('/portal?pagar=1'))
        botones = [c for c in t['components'] if c['type'] == 'button']
        self.assertEqual([(b['sub_type'], b['index'], b['parameters'][0]['payload']) for b in botones],
                         [('quick_reply', '0', 'YA_PAGUE'), ('quick_reply', '1', 'NECESITO_ACUERDO'),
                          ('quick_reply', '2', 'HABLAR')])
        m = MensajeWhatsApp.objects.get(direccion='saliente')
        self.assertEqual((m.tipo, m.envio_cobranza_id), ('plantilla', envio.id))
        self.assertEqual(m.payload['plantilla'], 'cobro_seguimiento')
        self.assertEqual(m.payload['origen'], 'motor')
        self.assertEqual(m.payload['botones'], ['YA_PAGUE', 'NECESITO_ACUERDO', 'HABLAR'])
        self.assertIn('Hola Maria', m.cuerpo)      # el hilo muestra el texto equivalente

    def test_sin_plantilla_meta_sale_texto_libre_como_siempre(self):
        envio = self.preparar_envio()
        with meta_ok() as post:
            self.assertEqual(procesar_envio(envio, AHORA), 'enviado')
        self.assertEqual(post.call_args.kwargs['json']['type'], 'text')
        self.assertIn('/portal?pagar=1', post.call_args.kwargs['json']['text']['body'])
        self.assertEqual(MensajeWhatsApp.objects.get(direccion='saliente').tipo, 'texto')

    def test_plantilla_meta_con_proveedor_twilio_cae_a_texto_libre(self):
        from .models import ConfiguracionNotificaciones
        ConfiguracionNotificaciones.objects.filter(pk=1).update(whatsapp_proveedor='twilio')
        ReglaCobranza.objects.filter(sede=self.sede, dia_relativo=3).update(plantilla_meta='cobro_seguimiento')
        envio = self.preparar_envio()
        with patch(WA, return_value=True) as wa:
            procesar_envio(envio, AHORA)
        self.assertIsNone(wa.call_args.kwargs['template_data'])

    def test_aviso_al_director_no_usa_la_plantilla_del_representante(self):
        ReglaCobranza.objects.filter(sede=self.sede).update(plantilla_meta='cobro_x')
        regla = ReglaCobranza.objects.get(sede=self.sede, dia_relativo=30)
        self.assertEqual(regla.destinatario, 'director')
        from cobranza.motor import _enviar_whatsapp
        with patch(WA, return_value=True) as wa:
            _enviar_whatsapp('04141111111', 'texto', self.rep, registrar=False, regla=regla,
                             ciclos=[self.ciclo_e1])
        self.assertIsNone(wa.call_args.kwargs['template_data'])


# ── 2. Árbol de botones ───────────────────────────────────────────────────────

class ArbolBotonesTest(FaseCBase):
    def test_ya_pague_pide_el_comprobante_y_espera_adjunto(self):
        self.boton('YA_PAGUE', 'Ya pagué')
        conv = ConversacionWhatsApp.objects.get(telefono=TELEFONO)
        self.assertEqual(conv.esperando, 'comprobante')
        self.assertEqual(self.bot()[-1].cuerpo, flujo_botones.TEXTO_PIDE_COMPROBANTE)
        self.assertFalse(conv.requiere_humano)

    def test_el_boton_se_reconoce_tambien_por_su_titulo(self):
        self.boton('Ya pagué', 'Ya pagué')
        self.assertEqual(ConversacionWhatsApp.objects.get().esperando, 'comprobante')

    def test_necesito_un_acuerdo_ofrece_tres_fechas(self):
        post = self.boton('NECESITO_ACUERDO', 'Necesito un acuerdo')
        enviado = post.call_args.kwargs['json']
        self.assertEqual(enviado['type'], 'interactive')
        filas = enviado['interactive']['action']['sections'][0]['rows']
        self.assertEqual([f['id'] for f in filas],
                         [f'FECHA_ACUERDO:{(HOY + timedelta(days=d)).isoformat()}' for d in (3, 7, 14)])
        conv = ConversacionWhatsApp.objects.get()
        self.assertEqual(conv.esperando, 'fecha_acuerdo')
        self.assertEqual(self.bot()[-1].tipo, 'lista')
        self.assertFalse(ConvenioPago.objects.exists())     # todavía no prometió nada

    def test_elegir_la_fecha_crea_la_promesa_pausa_el_ciclo_y_confirma(self):
        self.boton('NECESITO_ACUERDO')
        fecha = HOY + timedelta(days=7)
        self.lista(f'FECHA_ACUERDO:{fecha.isoformat()}')
        promesa = ConvenioPago.objects.get()
        self.assertEqual((promesa.tipo, promesa.origen, promesa.estado), ('promesa', 'whatsapp', 'vigente'))
        self.assertEqual(promesa.cuotas.get().fecha, fecha)
        self.assertEqual(promesa.representante_id, self.rep.id)
        self.ciclo_e1.refresh_from_db()
        self.assertEqual(self.ciclo_e1.estado, CicloCobranza.PAUSADA)
        conv = ConversacionWhatsApp.objects.get()
        self.assertEqual(conv.esperando, '')
        self.assertIn(fecha.strftime('%d/%m/%Y'), self.bot()[-1].cuerpo)
        # El ciclo pausado no genera más recordatorios (aunque llegue su día +7).
        self.assertEqual(evaluar_reglas_sede(self.sede.id, HOY + timedelta(days=4))['creados'], 0)

    def test_tocar_dos_veces_la_lista_no_duplica_la_promesa(self):
        self.boton('NECESITO_ACUERDO')
        fila = f'FECHA_ACUERDO:{(HOY + timedelta(days=3)).isoformat()}'
        self.lista(fila)
        self.lista(fila)
        self.assertEqual(ConvenioPago.objects.count(), 1)
        self.assertIn('registramos', self.bot()[-1].cuerpo)

    def test_fecha_fuera_de_rango_vuelve_a_ofrecer_la_lista(self):
        self.boton('NECESITO_ACUERDO')
        post = self.lista(f'FECHA_ACUERDO:{(HOY + timedelta(days=60)).isoformat()}')
        self.assertFalse(ConvenioPago.objects.exists())
        self.assertEqual(post.call_args.kwargs['json']['type'], 'interactive')

    def test_acuerdo_sin_deuda_o_sin_vincular_va_a_una_persona(self):
        conv = srv.obtener_conversacion('+584249999999')      # sin vincular
        self.assertIsNone(conv.representante_id)
        with meta_ok():
            self.postear(payload_texto(tipo='button', wa_id='x1', desde='584249999999', extra={
                'button': {'payload': 'NECESITO_ACUERDO', 'text': 'Necesito un acuerdo'}}))
        conv.refresh_from_db()
        self.assertTrue(conv.requiere_humano)
        self.assertFalse(ConvenioPago.objects.exists())

    def test_hablar_con_alguien_marca_requiere_humano_y_responde(self):
        self.boton('HABLAR', 'Hablar con alguien')
        conv = ConversacionWhatsApp.objects.get()
        self.assertTrue(conv.requiere_humano)
        self.assertEqual(self.bot()[-1].cuerpo, flujo_botones.TEXTO_HABLAR)
        tarjetas = servicio_hoy.calcular_hoy({self.sede.id}, HOY, timezone.now())['tarjetas']
        self.assertIn('conversacion_espera', [t['tipo'] for t in tarjetas])

    def test_texto_libre_marca_requiere_humano_sin_responder(self):
        with meta_ok() as post:
            self.postear(payload_texto('hola, quiero hablar de mi deuda', wa_id='t1'))
        self.assertTrue(ConversacionWhatsApp.objects.get().requiere_humano)
        post.assert_not_called()
        self.assertEqual(self.bot(), [])

    def test_boton_desconocido_va_a_una_persona(self):
        self.boton('OTRA_COSA', 'Otra cosa')
        self.assertTrue(ConversacionWhatsApp.objects.get().requiere_humano)

    def test_conversacion_tomada_el_arbol_no_responde(self):
        conv = self.conversacion()
        srv.tomar(conv, self.admin, timezone.now())
        for boton in ('YA_PAGUE', 'NECESITO_ACUERDO', 'HABLAR'):
            post = self.boton(boton)
            post.assert_not_called()
        conv.refresh_from_db()
        self.assertEqual((conv.esperando, conv.requiere_humano), ('', False))
        self.assertEqual(self.bot(conv), [])
        self.assertFalse(ConvenioPago.objects.exists())

    def test_baja_sigue_funcionando(self):
        with meta_ok():
            self.postear(payload_texto('BAJA', wa_id='b1'))
        from cobranza.models import BajaCobranza
        self.assertTrue(BajaCobranza.objects.filter(representante=self.rep, canal='whatsapp').exists())


# ── 3. Comprobantes entrantes ─────────────────────────────────────────────────

class ComprobanteEntranteTest(FaseCBase):
    def test_el_adjunto_queda_pendiente_se_acusa_recibo_y_el_motor_no_escribe(self):
        envio = self.preparar_envio()
        self.imagen()
        m = MensajeWhatsApp.objects.get(direccion='entrante')
        self.assertEqual(m.estado_adjunto, 'pendiente')
        self.assertEqual(self.bot()[-1].cuerpo, flujo_botones.TEXTO_COMPROBANTE_RECIBIDO)
        self.assertFalse(ConversacionWhatsApp.objects.get().requiere_humano)
        with patch(WA, return_value=True) as wa:
            self.assertEqual(procesar_envio(envio, AHORA), 'omitido')
        wa.assert_not_called()
        envio.refresh_from_db()
        self.assertEqual(envio.motivo_omision, 'comprobante_pendiente')

    def test_con_ya_pague_el_adjunto_cierra_el_paso_esperando(self):
        self.boton('YA_PAGUE')
        self.imagen()
        self.assertEqual(ConversacionWhatsApp.objects.get().esperando, '')

    def test_varios_adjuntos_seguidos_reciben_un_solo_acuse(self):
        self.imagen('i1')
        self.imagen('i2')
        acuses = [b for b in self.bot() if b.cuerpo == flujo_botones.TEXTO_COMPROBANTE_RECIBIDO]
        self.assertEqual(len(acuses), 1)

    def test_en_conversacion_tomada_queda_pendiente_pero_sin_acuse_automatico(self):
        srv.tomar(self.conversacion(), self.admin, timezone.now())
        self.imagen()
        self.assertEqual(MensajeWhatsApp.objects.get(direccion='entrante').estado_adjunto, 'pendiente')
        self.assertEqual(self.bot(), [])

    def test_tarjeta_en_hoy_hasta_resolverlo(self):
        self.imagen()
        m = MensajeWhatsApp.objects.get(direccion='entrante')
        tarjetas = [t for t in servicio_hoy.calcular_hoy({self.sede.id}, HOY, timezone.now())['tarjetas']
                    if t['tipo'] == 'comprobante_whatsapp']
        self.assertEqual(len(tarjetas), 1)
        t = tarjetas[0]
        self.assertEqual(t['clave'], f'comprobante_whatsapp:{m.id}')
        self.assertEqual([a['accion'] for a in t['acciones']],
                         ['convertir_comprobante', 'abrir_chat', 'descartar_comprobante'])
        self.assertEqual(t['detalle']['mensaje'], m.id)
        self.assertEqual(t['representante']['id'], self.rep.id)

    def test_comprobante_sin_vincular_no_ofrece_convertir(self):
        with meta_ok(), patch('requests.get', side_effect=media_get):
            self.postear(payload_texto(tipo='image', wa_id='u1', desde='584249999999', extra={
                'image': {'id': 'MEDIA1', 'mime_type': 'image/png'}}))
        t = next(t for t in servicio_hoy.calcular_hoy({self.sede.id}, HOY, timezone.now())['tarjetas']
                 if t['tipo'] == 'comprobante_whatsapp')
        self.assertNotIn('convertir_comprobante', [a['accion'] for a in t['acciones']])
        self.assertIsNone(t['representante'])

    def test_media_que_no_se_pudo_descargar_va_a_una_persona(self):
        with meta_ok(), patch('requests.get', side_effect=Exception('boom')):
            self.postear(payload_imagen())
        m = MensajeWhatsApp.objects.get(direccion='entrante')
        self.assertEqual(m.estado_adjunto, '')
        self.assertTrue(ConversacionWhatsApp.objects.get().requiere_humano)


class ResolverComprobanteTest(FaseCBase):
    def setUp(self):
        super().setUp()
        self.imagen()
        self.msg = MensajeWhatsApp.objects.get(direccion='entrante')
        self.url = f'{API}adjuntos/{self.msg.id}/convertir-comprobante/'

    def test_convertir_crea_el_comprobante_del_portal_y_marca_convertido(self):
        r = self.api.post(self.url, {'mensualidades': [self.mens_e1.id], 'referencia_bancaria': 'ab 123',
                                     'metodo_pago': 'transferencia'}, format='json')
        self.assertEqual(r.status_code, 201, r.content)
        c = ComprobantePago.objects.get()
        self.assertEqual((c.mensualidad_id, c.estatus, c.referencia_bancaria), (self.mens_e1.id, 'pendiente', 'AB 123'))
        self.assertTrue(c.archivo.name.startswith('comprobantes/'))
        self.assertTrue(c.hash_archivo)
        self.msg.refresh_from_db()
        self.assertEqual(self.msg.estado_adjunto, 'convertido')
        self.assertEqual(self.msg.payload['comprobantes'], [c.id])
        self.assertEqual(r.data['mensaje']['estado_adjunto'], 'convertido')
        self.assertEqual(r.data['comprobantes'][0]['id'], c.id)
        # Deja de haber tarjeta y de estar pendiente por WhatsApp.
        tipos = [t['tipo'] for t in servicio_hoy.calcular_hoy({self.sede.id}, HOY, timezone.now())['tarjetas']]
        self.assertNotIn('comprobante_whatsapp', tipos)

    def test_tras_convertir_el_motor_sigue_sin_escribir_por_pago_en_revision(self):
        envio = self.preparar_envio()
        self.api.post(self.url, {'mensualidades': [self.mens_e1.id]}, format='json')
        with patch(WA, return_value=True) as wa:
            self.assertEqual(procesar_envio(envio, AHORA), 'omitido')
        wa.assert_not_called()
        envio.refresh_from_db()
        self.assertEqual(envio.motivo_omision, 'pago_en_revision')

    def test_convertir_varias_mensualidades_crea_un_comprobante_por_cada_una(self):
        e2 = self.ciclo('E2', dia_limite=17).mensualidad
        r = self.api.post(self.url, {'mensualidades': [self.mens_e1.id, e2.id]}, format='json')
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(ComprobantePago.objects.count(), 2)
        self.assertEqual({c.mensualidad_id for c in ComprobantePago.objects.all()}, {self.mens_e1.id, e2.id})

    def test_no_se_convierte_dos_veces(self):
        self.api.post(self.url, {'mensualidades': [self.mens_e1.id]}, format='json')
        r = self.api.post(self.url, {'mensualidades': [self.mens_e1.id]}, format='json')
        self.assertEqual(r.status_code, 400)
        self.assertEqual(ComprobantePago.objects.count(), 1)

    def test_validaciones(self):
        for cuerpo in ({}, {'mensualidades': []}, {'mensualidades': ['x']}, {'mensualidades': [999999]},
                       {'mensualidades': [self.mens_e1.id], 'metodo_pago': 'trueque'},
                       {'mensualidades': [self.mens_e1.id], 'banco_receptor_id': 999999}):
            r = self.api.post(self.url, cuerpo, format='json')
            self.assertEqual(r.status_code, 400, cuerpo)
            self.assertIn('detail', r.data)
        self.assertFalse(ComprobantePago.objects.exists())

    def test_mensualidad_de_otro_representante_se_rechaza(self):
        from secretaria.models import Representante
        otro = Representante.objects.create(cedula='V2', nombre='Otro', apellido='Rep', telefono='04245550000',
                                            correo='o@t.com', direccion='c')
        ajena = self.ciclo('E9', dia_limite=17, rep=otro).mensualidad
        r = self.api.post(self.url, {'mensualidades': [ajena.id]}, format='json')
        self.assertEqual(r.status_code, 400)
        self.assertFalse(ComprobantePago.objects.exists())

    def test_mensualidad_con_comprobante_pendiente_se_rechaza(self):
        ComprobantePago.objects.create(mensualidad=self.mens_e1, archivo=ContentFile(PNG, name='a.png'),
                                       hash_archivo='otro')
        r = self.api.post(self.url, {'mensualidades': [self.mens_e1.id]}, format='json')
        self.assertEqual(r.status_code, 400)

    def test_mismo_archivo_ya_presentado_se_rechaza(self):
        import hashlib
        e2 = self.ciclo('E2', dia_limite=17).mensualidad
        ComprobantePago.objects.create(mensualidad=e2, archivo=ContentFile(PNG, name='a.png'),
                                       hash_archivo=hashlib.sha256(PNG).hexdigest())
        r = self.api.post(self.url, {'mensualidades': [self.mens_e1.id]}, format='json')
        self.assertEqual(r.status_code, 400)
        self.assertIn('ya fue presentado', r.data['detail'])

    def test_conversacion_sin_vincular_exige_vincular_primero(self):
        ConversacionWhatsApp.objects.filter(pk=self.msg.conversacion_id).update(representante=None)
        r = self.api.post(self.url, {'mensualidades': [self.mens_e1.id]}, format='json')
        self.assertEqual(r.status_code, 400)
        self.assertIn('Vincule', r.data['detail'])

    def test_descartar_exige_motivo_y_libera_al_motor(self):
        url = f'{API}adjuntos/{self.msg.id}/descartar/'
        self.assertEqual(self.api.post(url, {'motivo': '  '}, format='json').status_code, 400)
        r = self.api.post(url, {'motivo': 'Foto borrosa, no es un pago'}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        self.msg.refresh_from_db()
        self.assertEqual(self.msg.estado_adjunto, 'descartado')
        self.assertEqual(self.msg.payload['motivo_descarte'], 'Foto borrosa, no es un pago')
        self.assertEqual(self.api.post(url, {'motivo': 'otra vez'}, format='json').status_code, 400)
        self.assertFalse(ComprobantePago.objects.exists())
        envio = self.preparar_envio()
        with meta_ok():
            self.assertEqual(procesar_envio(envio, AHORA), 'enviado')   # ya no está pausado

    def test_mensualidades_pendientes_para_elegir(self):
        conv = ConversacionWhatsApp.objects.get()
        r = self.api.get(f'{API}conversaciones/{conv.id}/mensualidades-pendientes/')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data['count'], 1)
        fila = r.data['results'][0]
        self.assertEqual((fila['id'], fila['saldo_usd'], fila['tiene_comprobante_pendiente']),
                         (self.mens_e1.id, '50.00', False))

    def test_apagado_responde_409_y_sin_credenciales_401(self):
        self.config(activo=False)
        for ruta, cuerpo in ((f'adjuntos/{self.msg.id}/convertir-comprobante/', {'mensualidades': [1]}),
                             (f'adjuntos/{self.msg.id}/descartar/', {'motivo': 'x'})):
            r = self.api.post(API + ruta, cuerpo, format='json')
            self.assertEqual((r.status_code, r.data['apagada']), (409, True))
        self.assertEqual(self.api.get(f'{API}conversaciones/{self.msg.conversacion_id}/mensualidades-pendientes/'
                                      ).status_code, 409)
        self.assertEqual(APIClient().post(self.url, {}, format='json').status_code, 401)

    def test_mensaje_inexistente_es_404(self):
        self.assertEqual(self.api.post(f'{API}adjuntos/99999/descartar/', {'motivo': 'x'}, format='json').status_code,
                         404)

    def test_un_mensaje_que_no_es_adjunto_pendiente_es_400(self):
        texto = MensajeWhatsApp.objects.create(conversacion=self.msg.conversacion, direccion='entrante', tipo='texto')
        r = self.api.post(f'{API}adjuntos/{texto.id}/descartar/', {'motivo': 'x'}, format='json')
        self.assertEqual(r.status_code, 400)


# ── 4. Link al portal ─────────────────────────────────────────────────────────

class LinkPortalTest(FaseCBase):
    def test_link_portal_en_variables_y_respuestas_rapidas_abre_la_seccion_de_pago(self):
        conv = self.conversacion()
        vars_ = srv.variables_conversacion(conv)
        self.assertTrue(vars_['link_portal'].endswith('/portal?pagar=1'))
        self.assertEqual(srv.renderizar_respuesta('Pague aquí: {link_portal}', conv),
                         f"Pague aquí: {vars_['link_portal']}")

    def test_el_texto_del_recordatorio_lleva_el_link(self):
        from cobranza.motor import construir_mensaje
        _, texto = construir_mensaje(self.rep, [self.ciclo_e1], ReglaCobranza.objects.get(
            sede=self.sede, dia_relativo=3))
        self.assertIn('/portal?pagar=1', texto)


class ReglaPlantillaMetaModeloTest(FaseCBase):
    def test_plantilla_meta_es_opcional(self):
        self.assertEqual(ReglaCobranza.objects.filter(sede=self.sede).exclude(plantilla_meta='').count(), 0)
