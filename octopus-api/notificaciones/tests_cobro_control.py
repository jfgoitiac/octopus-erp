"""
Control de recordatorios de cobro con Cobranza Inteligente encendida
(PLAN_COBRANZA_INTELIGENTE_V4.md §1.8 / §5):
  - cobro manual Modo A (wa.me) y Modo B (API) pasan por `control_envios`
    SOLO con el toggle de la sede encendido; apagado, todo igual que antes;
  - la señal y la tarea del flujo anterior no envían nada con el toggle encendido.
"""
from datetime import date
from unittest.mock import patch

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from cobranza.models import (
    BajaCobranza, ConfiguracionCobranzaInteligente, EnvioCobranza, EventoCiclo, Mensualidad, Pago,
    ReglaCobranza,
)
from multisede.models import Sede
from .models import ConfiguracionNotificaciones, NotificacionLog, PlantillaWhatsApp
from .tests_cobro_whatsapp import crear_representante_con_deuda, crear_usuario_cobranza

PREVIEW = '/api/notificaciones/cobro-whatsapp/previsualizar/'
MANUAL = '/api/notificaciones/cobro-whatsapp/registrar-envio-manual/'
ENVIAR = '/api/notificaciones/cobro-whatsapp/enviar/'


class ControlBase(TestCase):
    cedula = 'V3000001'

    def setUp(self):
        self.client = APIClient()
        self.user = crear_usuario_cobranza()
        self.client.force_authenticate(user=self.user)
        self.sede = Sede.objects.create(nombre='Sede Norte')
        self.plantilla = PlantillaWhatsApp.objects.create(
            nombre='Recordatorio', tipo='recordatorio', predeterminada=True,
            cuerpo='Hola {{representante.nombre}}, debe {{monto}}.', nombre_plantilla_meta='cobro_pendiente')

    def encender(self):
        ConfiguracionCobranzaInteligente.objects.update_or_create(
            sede=self.sede, defaults={'activo': True, 'modo_sombra': True})

    def crear_rep(self, encendido=True):
        if encendido:
            self.encender()   # antes de crear la deuda: la señal solo crea el ciclo con el toggle encendido
        rep, alumnos = crear_representante_con_deuda(self.cedula, sede=self.sede)
        return rep

    def activar_api(self):
        ConfiguracionNotificaciones.objects.create(
            pk=1, whatsapp_activo=True, whatsapp_proveedor='meta',
            meta_whatsapp_token='token-fake', meta_whatsapp_phone_id='123456')

    def enviar_b(self, **extra):
        return self.client.post(ENVIAR, {
            'representante_cedula': self.cedula, 'plantilla_id': self.plantilla.id, **extra}, format='json')


class ToggleApagadoTest(ControlBase):
    def test_previsualizar_no_trae_control_y_modo_a_no_registra_eventos(self):
        rep = self.crear_rep(encendido=False)
        r = self.client.post(PREVIEW, {'representante_cedula': self.cedula,
                                       'plantilla_id': self.plantilla.id}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertNotIn('control', r.data)
        r = self.client.post(MANUAL, {'representante_cedula': self.cedula, 'mensaje': 'hola'}, format='json')
        self.assertEqual(r.status_code, 201, r.content)
        self.assertFalse(EventoCiclo.objects.filter(tipo='cobro_manual').exists())
        self.assertEqual(rep.cedula, self.cedula)

    @patch('requests.post')
    def test_modo_b_ignora_bajas_y_no_registra_eventos(self, post):
        post.return_value.raise_for_status.return_value = None
        self.activar_api()
        rep = self.crear_rep(encendido=False)
        BajaCobranza.objects.create(representante=rep, canal='whatsapp')
        r = self.enviar_b()
        self.assertEqual(r.status_code, 200, r.content)   # comportamiento de siempre
        post.assert_called_once()
        self.assertFalse(EventoCiclo.objects.filter(tipo='cobro_manual').exists())


class ToggleEncendidoTest(ControlBase):
    def test_previsualizar_informa_el_control_por_modo(self):
        rep = self.crear_rep()
        BajaCobranza.objects.create(representante=rep, canal='whatsapp')
        r = self.client.post(PREVIEW, {'representante_cedula': self.cedula,
                                       'plantilla_id': self.plantilla.id}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        c = r.data['control']
        self.assertTrue(c['activo'])
        self.assertTrue(c['modo_a']['permitido'])    # wa.me solo avisa
        self.assertEqual([a['codigo'] for a in c['modo_a']['avisos']], ['baja_voluntaria'])
        self.assertFalse(c['modo_b']['permitido'])
        self.assertEqual([b['codigo'] for b in c['modo_b']['bloqueos']], ['baja_voluntaria'])

    def test_modo_a_registra_el_cobro_en_el_ciclo_y_cuenta_para_el_tope(self):
        from cobranza.control_envios import mensajes_en_semana
        rep = self.crear_rep()
        r = self.client.post(MANUAL, {'representante_cedula': self.cedula, 'mensaje': 'hola'}, format='json')
        self.assertEqual(r.status_code, 201, r.content)
        ev = EventoCiclo.objects.get(tipo='cobro_manual')
        self.assertEqual((ev.usuario, ev.detalle['origen'], ev.detalle['canal']),
                         (self.user, 'manual_wame', 'whatsapp'))
        self.assertIsNotNone(ev.ciclo)
        self.assertEqual(mensajes_en_semana(rep, timezone.now()), 1)
        # el segundo en el día sigue pidiendo confirmación (regla de siempre) y con confirmar se registra
        r2 = self.client.post(MANUAL, {'representante_cedula': self.cedula, 'mensaje': 'otra'}, format='json')
        self.assertEqual(r2.status_code, 409)
        self.assertTrue(r2.data['requiere_confirmacion'])

    @patch('requests.post')
    def test_modo_b_se_bloquea_con_baja(self, post):
        self.activar_api()
        rep = self.crear_rep()
        BajaCobranza.objects.create(representante=rep, canal='whatsapp')
        r = self.enviar_b()
        self.assertEqual(r.status_code, 400)
        self.assertTrue(r.data['bloqueado'])
        self.assertEqual(r.data['motivo'], 'baja_voluntaria')
        post.assert_not_called()
        self.assertFalse(EventoCiclo.objects.filter(tipo='cobro_manual').exists())

    @patch('requests.post')
    def test_modo_b_se_bloquea_con_pago_en_revision(self, post):
        self.activar_api()
        rep = self.crear_rep()
        alumno = rep.alumnos.first()
        Pago.objects.create(alumno=alumno, usuario_receptor=self.user, metodo_pago='transferencia',
                            monto_usd=50, tasa_aplicada=40, estatus='en_revision')
        r = self.enviar_b()
        self.assertEqual((r.status_code, r.data['motivo']), (400, 'pago_en_revision'))
        post.assert_not_called()

    @patch('requests.post')
    def test_modo_b_pide_confirmar_si_ya_recibio_un_mensaje_automatico_hoy(self, post):
        post.return_value.raise_for_status.return_value = None
        self.activar_api()
        rep = self.crear_rep()
        regla = ReglaCobranza.objects.create(sede=self.sede, nombre='r', etapa='temprana', dia_relativo=3,
                                             canal='whatsapp', plantilla='seguimiento_1')
        EnvioCobranza.objects.create(representante=rep, regla=regla, fecha=date.today(), estado='enviado',
                                     canal='whatsapp', enviado_en=timezone.now())
        r = self.enviar_b()
        self.assertEqual(r.status_code, 409)
        self.assertTrue(r.data['requiere_confirmacion'])
        self.assertEqual(r.data['avisos'][0]['codigo'], 'cobro_automatico_hoy')
        post.assert_not_called()
        ok = self.enviar_b(confirmar=True)
        self.assertEqual(ok.status_code, 200, ok.content)
        post.assert_called_once()
        self.assertEqual(EventoCiclo.objects.get(tipo='cobro_manual').detalle['origen'], 'manual_api')
        self.assertTrue(NotificacionLog.objects.filter(
            tipo='cobro_whatsapp', modo='automatico', representante_cedula=self.cedula).exists())

    @patch('requests.post')
    def test_modo_b_envia_y_registra_cuando_no_hay_impedimentos(self, post):
        post.return_value.raise_for_status.return_value = None
        self.activar_api()
        self.crear_rep()
        r = self.enviar_b()
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(EventoCiclo.objects.filter(tipo='cobro_manual').values('detalle__origen').get(),
                         {'detalle__origen': 'manual_api'})


class FlujoAnteriorExcluidoTest(ControlBase):
    """Con el toggle encendido ni la señal ni la tarea vieja envían un solo mensaje."""

    def test_senal_y_tareas_viejas_no_envian_nada(self):
        from notificaciones.tasks import (
            revisar_y_programar_notificaciones_pendientes, task_notificar_mora_programada,
        )
        self.encender()
        with patch('notificaciones.services.enviar_email') as email, \
                patch('notificaciones.services.enviar_whatsapp') as wa, \
                patch('notificaciones.tasks.task_notificar_mora_programada.apply_async') as agendar, \
                patch('notificaciones.tasks.task_notificar_mora_programada.delay') as delay:
            rep, _ = crear_representante_con_deuda('V3000009', sede=self.sede)   # dispara la señal
            m = Mensualidad.objects.filter(alumno__representante=rep).get()
            for tipo in ('mora_dia_0', 'mora_dia_5', 'mora_dia_10', 'mora_dia_15'):
                task_notificar_mora_programada(m.id, tipo)   # aviso ya agendado: se descarta

            class _Hoy(date):
                @classmethod
                def today(cls):
                    return date(m.anio, m.mes, m.alumno.dia_limite_pago)   # día 0
            with patch('datetime.date', _Hoy):
                revisar_y_programar_notificaciones_pendientes()
        agendar.assert_not_called()
        delay.assert_not_called()
        email.assert_not_called()
        wa.assert_not_called()
        self.assertFalse(NotificacionLog.objects.exists())

    def test_apagado_la_senal_si_agenda(self):
        with patch('notificaciones.tasks.task_notificar_mora_programada.apply_async') as agendar:
            crear_representante_con_deuda('V3000010', sede=self.sede)
        self.assertEqual(agendar.call_count, 4)
