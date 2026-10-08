"""
Tests del toggle de Cobranza Inteligente (PLAN_COBRANZA_INTELIGENTE.md §3):
  - Viene apagado por defecto.
  - Solo director/sistemas lo cambia; cada cambio queda auditado.
  - Excluyente con el flujo anterior: encendido => no se agendan ni disparan
    avisos antiguos para esa sede; apagado => el flujo anterior sigue igual.
  - El corte global apaga el módulo aunque la sede esté encendida.
"""
from datetime import date
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from multisede.models import Sede
from secretaria.models import Alumno, Representante
from usuarios.models import LogAuditoria

from .inteligente import inteligente_activa_para_sede, obtener_configuracion
from .models import ConfiguracionCobranzaInteligente, Mensualidad

User = get_user_model()
URL = '/api/cobranza/inteligente/configuracion/'


class ToggleBase(TestCase):
    def setUp(self):
        self.sede = Sede.objects.create(nombre='Sede Norte')
        self.admin = User.objects.create_superuser('admin', 'a@t.com', 'x')
        self.rep = Representante.objects.create(
            cedula='V1', nombre='M', apellido='P', telefono='0412',
            correo='m@t.com', direccion='c')
        self.alumno = Alumno.objects.create(
            cedula_escolar='E1', nombre='A', apellido='T',
            fecha_nacimiento=date(2015, 1, 1), dia_limite_pago=5,
            representante=self.rep, sede=self.sede)
        self.client = APIClient()
        self.client.force_authenticate(self.admin)

    def _encender(self):
        ConfiguracionCobranzaInteligente.objects.update_or_create(
            sede=self.sede, defaults={'activo': True})


class ToggleApiTest(ToggleBase):
    def test_apagado_por_defecto(self):
        r = self.client.get(URL, {'sede': self.sede.id})
        self.assertEqual(r.status_code, 200)
        self.assertFalse(r.data['activo'])
        self.assertFalse(r.data['efectivo'])

    def test_director_enciende_y_queda_auditado(self):
        r = self.client.patch(URL + f'?sede={self.sede.id}', {'activo': True, 'motivo': 'piloto'}, format='json')
        self.assertEqual(r.status_code, 200)
        self.assertTrue(r.data['activo'])
        self.assertTrue(inteligente_activa_para_sede(self.sede.id))
        log = LogAuditoria.objects.get(accion='COBRANZA_INTELIGENTE_CAMBIO')
        self.assertFalse(log.detalles['anterior']['activo'])
        self.assertTrue(log.detalles['nuevo']['activo'])

    def test_sin_cambios_no_audita(self):
        self.client.patch(URL + f'?sede={self.sede.id}', {'activo': False}, format='json')
        self.assertFalse(LogAuditoria.objects.filter(accion='COBRANZA_INTELIGENTE_CAMBIO').exists())

    def test_rol_sin_permiso_no_puede_cambiar(self):
        u = User.objects.create_user('cajero', 'c@t.com', 'x')
        c = APIClient()
        c.force_authenticate(u)
        r = c.patch(URL + f'?sede={self.sede.id}', {'activo': True}, format='json')
        self.assertEqual(r.status_code, 403)
        self.assertFalse(inteligente_activa_para_sede(self.sede.id))

    def test_etapas_invalidas_se_rechazan(self):
        r = self.client.patch(URL + f'?sede={self.sede.id}', {'etapas_envio_activas': ['otra']}, format='json')
        self.assertEqual(r.status_code, 400)

    @override_settings(COBRANZA_INTELIGENTE_GLOBAL_OFF=True)
    def test_corte_global_apaga_aunque_la_sede_este_encendida(self):
        self._encender()
        self.assertFalse(inteligente_activa_para_sede(self.sede.id))
        r = self.client.get(URL, {'sede': self.sede.id})
        self.assertTrue(r.data['activo'])
        self.assertFalse(r.data['efectivo'])


class ExclusionFlujoAnteriorTest(ToggleBase):
    def _crear_mensualidad(self):
        return Mensualidad.objects.create(
            alumno=self.alumno, mes=7, anio=2026, monto_usd=50)

    @patch('notificaciones.tasks.programar_notificaciones_mensualidad')
    def test_apagado_el_flujo_anterior_agenda(self, programar):
        self._crear_mensualidad()
        programar.assert_called_once()

    @patch('notificaciones.tasks.programar_notificaciones_mensualidad')
    def test_encendido_el_flujo_anterior_no_agenda(self, programar):
        self._encender()
        self._crear_mensualidad()
        programar.assert_not_called()

    @patch('notificaciones.tasks.task_notificar_mora')
    def test_aviso_ya_agendado_se_descarta_si_se_enciende(self, notificar):
        from notificaciones.tasks import task_notificar_mora_programada
        with patch('notificaciones.tasks.programar_notificaciones_mensualidad'):
            m = self._crear_mensualidad()
        self._encender()
        task_notificar_mora_programada(m.id, 'mora_dia_5')
        notificar.assert_not_called()

    @patch('notificaciones.tasks.task_notificar_mora_programada')
    def test_tarea_diaria_omite_sedes_encendidas(self, programada):
        from notificaciones.tasks import revisar_y_programar_notificaciones_pendientes
        with patch('notificaciones.tasks.programar_notificaciones_mensualidad'):
            self._crear_mensualidad()
        self._encender()

        class _Hoy(date):
            @classmethod
            def today(cls):
                return date(2026, 7, 5)  # día 0 de la mensualidad
        with patch('datetime.date', _Hoy):
            revisar_y_programar_notificaciones_pendientes()
        programada.delay.assert_not_called()
