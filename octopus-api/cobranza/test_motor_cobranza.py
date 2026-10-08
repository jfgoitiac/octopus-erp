"""
Tests del motor de reglas y envíos de Cobranza Inteligente
(PLAN_COBRANZA_INTELIGENTE.md, Fase 2). `hoy` y `ahora` siempre fijos; los
envíos reales de WhatsApp/email están simulados con mocks.
"""
from datetime import date, datetime, timedelta
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from multisede.models import Sede
from secretaria.models import Alumno, Representante

from .ciclos import evaluar_ciclos_sede
from .models import (
    BajaCobranza, CicloCobranza, ConfiguracionCobranzaInteligente, EnvioCobranza,
    EventoCiclo, Mensualidad, Pago, ReglaCobranza,
)
from .motor import (
    cancelar_envios_pendientes_sede, crear_reglas_por_defecto, dentro_de_horario,
    evaluar_reglas_sede, procesar_envio, procesar_envios, proxima_ventana,
)

User = get_user_model()
HOY = date(2026, 7, 20)  # lunes
AHORA = timezone.make_aware(datetime(2026, 7, 20, 10, 0))  # lunes 10:00, dentro de horario
TODAS = ['preventiva', 'temprana', 'prioritaria']

WA = 'notificaciones.services.enviar_whatsapp'
EM = 'notificaciones.services.enviar_email'


class MotorBase(TestCase):
    def setUp(self):
        self.sede = Sede.objects.create(nombre='Sede Norte')
        self.rep = Representante.objects.create(
            cedula='V1', nombre='Maria', apellido='Perez', telefono='04121234567',
            correo='maria@t.com', direccion='c')
        self.admin = User.objects.create_superuser('admin', 'a@t.com', 'x')
        crear_reglas_por_defecto(self.sede.id)

    def alumno(self, cedula='E1', dia_limite=17, rep=None):
        return Alumno.objects.create(
            cedula_escolar=cedula, nombre='Ana', apellido=cedula,
            fecha_nacimiento=date(2015, 1, 1), dia_limite_pago=dia_limite,
            representante=rep or self.rep, sede=self.sede)

    def mens(self, alumno, mes=7, monto=50, pagado=0):
        return Mensualidad.objects.create(
            alumno=alumno, mes=mes, anio=2026, monto_usd=monto, monto_pagado=pagado)

    def config(self, activo=True, sombra=False, etapas=TODAS):
        ConfiguracionCobranzaInteligente.objects.update_or_create(
            sede=self.sede,
            defaults={'activo': activo, 'modo_sombra': sombra, 'etapas_envio_activas': etapas})

    def preparar(self, **cfg):
        self.config(**cfg)
        evaluar_ciclos_sede(self.sede.id, HOY)
        return evaluar_reglas_sede(self.sede.id, HOY)


class EvaluacionTest(MotorBase):
    def test_modulo_apagado_no_crea_envios(self):
        self.mens(self.alumno())
        self.config(activo=False)
        self.assertEqual(evaluar_reglas_sede(self.sede.id, HOY)['creados'], 0)
        self.assertEqual(EnvioCobranza.objects.count(), 0)

    def test_dia_exacto_crea_el_envio_y_sin_retroactivos(self):
        self.mens(self.alumno(dia_limite=17))   # vence el 17 => +3 hoy
        self.preparar()
        e = EnvioCobranza.objects.get()
        self.assertEqual(e.regla.dia_relativo, 3)
        self.assertEqual(e.estado, 'pendiente')

        # un día sin regla (+4) no genera nada: no hay avisos atrasados
        EnvioCobranza.objects.all().delete()
        self.assertEqual(evaluar_reglas_sede(self.sede.id, HOY + timedelta(days=1))['creados'], 0)

    def test_es_idempotente(self):
        self.mens(self.alumno())
        self.preparar()
        evaluar_reglas_sede(self.sede.id, HOY)
        evaluar_reglas_sede(self.sede.id, HOY)
        self.assertEqual(EnvioCobranza.objects.count(), 1)

    def test_un_mensaje_por_representante_con_varios_hijos(self):
        self.mens(self.alumno('E1'))
        self.mens(self.alumno('E2'))
        self.preparar()
        e = EnvioCobranza.objects.get()
        self.assertEqual(len(e.detalle['ciclos']), 2)
        self.assertEqual(e.detalle['saldo_total'], '100.00')

    def test_con_etapas_distintas_manda_la_mas_avanzada(self):
        self.mens(self.alumno('E1', dia_limite=17))   # +3
        self.mens(self.alumno('E2', dia_limite=13))   # +7
        self.preparar()
        e = EnvioCobranza.objects.get()
        self.assertEqual(e.regla.dia_relativo, 7)
        self.assertEqual(len(e.detalle['ciclos']), 2)

    def test_modo_sombra_simula_y_no_envia(self):
        self.mens(self.alumno())
        self.preparar(sombra=True)
        e = EnvioCobranza.objects.get()
        self.assertEqual(e.estado, 'simulado')
        with patch(WA) as wa, patch(EM) as em:
            procesar_envios(AHORA)
        wa.assert_not_called()
        em.assert_not_called()

    def test_etapa_no_habilitada_solo_simula(self):
        self.mens(self.alumno())   # +3 => temprana
        self.preparar(etapas=['preventiva'])
        self.assertEqual(EnvioCobranza.objects.get().estado, 'simulado')

    def test_saldo_minimo_de_la_regla(self):
        self.mens(self.alumno(), monto=50)
        ReglaCobranza.objects.filter(sede=self.sede).update(saldo_minimo=100)
        self.preparar()
        self.assertEqual(EnvioCobranza.objects.count(), 0)

    def test_pausada_no_genera_envio(self):
        m = self.mens(self.alumno())
        self.config()
        evaluar_ciclos_sede(self.sede.id, HOY)
        CicloCobranza.objects.filter(mensualidad=m).update(estado='pausada', motivo_pausa='reclamo')
        evaluar_reglas_sede(self.sede.id, HOY)
        self.assertEqual(EnvioCobranza.objects.count(), 0)


class EnvioTest(MotorBase):
    def test_envia_por_whatsapp_y_registra_el_evento(self):
        self.mens(self.alumno())   # regla +3 => solo whatsapp
        self.preparar()
        with patch(WA, return_value=True) as wa, patch(EM, return_value=True) as em:
            procesar_envios(AHORA)
        wa.assert_called_once()
        em.assert_not_called()
        e = EnvioCobranza.objects.get()
        self.assertEqual(e.estado, 'enviado')
        self.assertTrue(EventoCiclo.objects.filter(tipo='mensaje_enviado').exists())
        self.assertIn('Maria', wa.call_args[0][1])

    def test_regla_ambos_envia_por_los_dos_canales(self):
        self.mens(self.alumno(dia_limite=13))   # +7 => ambos
        self.preparar()
        with patch(WA, return_value=True) as wa, patch(EM, return_value=True) as em:
            procesar_envios(AHORA)
        wa.assert_called_once()
        em.assert_called_once()

    def test_deuda_saldada_antes_de_enviar_se_omite(self):
        m = self.mens(self.alumno())
        self.preparar()
        m.monto_pagado = 50
        m.save()   # la señal ya cierra el ciclo
        with patch(WA) as wa:
            procesar_envios(AHORA)
        wa.assert_not_called()
        e = EnvioCobranza.objects.get()
        self.assertEqual(e.estado, 'omitido')
        self.assertEqual(e.motivo_omision, 'deuda_saldada')

    def test_pago_en_revision_pausa_el_aviso(self):
        a = self.alumno()
        self.mens(a)
        self.preparar()
        Pago.objects.create(
            alumno=a, usuario_receptor=self.admin, metodo_pago='transferencia',
            monto_usd=50, tasa_aplicada=40, estatus='en_revision')
        with patch(WA) as wa:
            procesar_envios(AHORA)
        wa.assert_not_called()
        e = EnvioCobranza.objects.get()
        self.assertEqual((e.estado, e.motivo_omision), ('omitido', 'pago_en_revision'))

    def test_fuera_de_horario_no_envia_y_queda_para_la_ventana(self):
        self.mens(self.alumno())
        self.preparar()
        domingo = timezone.make_aware(datetime(2026, 7, 19, 11, 0))
        noche = timezone.make_aware(datetime(2026, 7, 20, 21, 0))
        self.assertFalse(dentro_de_horario(domingo))
        self.assertFalse(dentro_de_horario(noche))
        self.assertTrue(dentro_de_horario(AHORA))
        with patch(WA) as wa:
            procesar_envios(noche)
        wa.assert_not_called()
        e = EnvioCobranza.objects.get()
        self.assertEqual(e.estado, 'pendiente')
        self.assertEqual(timezone.localtime(e.proximo_intento).hour, 8)
        self.assertEqual(timezone.localtime(e.proximo_intento).date(), date(2026, 7, 21))
        # el domingo salta al lunes
        self.assertEqual(timezone.localtime(proxima_ventana(domingo)).weekday(), 0)

    def test_limite_semanal(self):
        self.mens(self.alumno())
        self.preparar()
        regla = ReglaCobranza.objects.get(sede=self.sede, dia_relativo=-5)
        for i in range(3):
            EnvioCobranza.objects.create(
                representante=self.rep, regla=regla, fecha=HOY - timedelta(days=i + 1),
                estado='enviado', enviado_en=AHORA - timedelta(days=i + 1))
        with patch(WA) as wa:
            procesar_envios(AHORA)
        wa.assert_not_called()
        self.assertEqual(EnvioCobranza.objects.get(fecha=HOY).motivo_omision, 'limite_semanal')

    def test_baja_voluntaria_parcial_envia_por_el_otro_canal(self):
        self.mens(self.alumno(dia_limite=13))   # +7 => ambos
        self.preparar()
        BajaCobranza.objects.create(representante=self.rep, canal='whatsapp')
        with patch(WA) as wa, patch(EM, return_value=True) as em:
            procesar_envios(AHORA)
        wa.assert_not_called()
        em.assert_called_once()
        self.assertEqual(EnvioCobranza.objects.get().estado, 'enviado')

    def test_baja_en_el_unico_canal_omite(self):
        self.mens(self.alumno())   # +3 => solo whatsapp
        self.preparar()
        BajaCobranza.objects.create(representante=self.rep, canal='whatsapp')
        with patch(WA) as wa:
            procesar_envios(AHORA)
        wa.assert_not_called()
        self.assertEqual(EnvioCobranza.objects.get().motivo_omision, 'baja_voluntaria')

    def test_sin_contacto(self):
        Representante.objects.filter(pk=self.rep.pk).update(telefono='')
        self.mens(self.alumno())
        self.preparar()
        procesar_envios(AHORA)
        self.assertEqual(EnvioCobranza.objects.get().motivo_omision, 'sin_contacto')

    def test_reintentos_con_espera_y_fallo_definitivo(self):
        self.mens(self.alumno())
        self.preparar()
        e = EnvioCobranza.objects.get()
        with patch(WA, return_value=False):
            procesar_envio(e, AHORA)
            e.refresh_from_db()
            self.assertEqual(e.estado, 'reintento')
            self.assertEqual(e.proximo_intento, AHORA + timedelta(hours=1))
            # aún no le toca: procesar_envios lo salta
            self.assertEqual(procesar_envios(AHORA + timedelta(minutes=10)), {})
            procesar_envio(e, AHORA + timedelta(hours=1))
            e.refresh_from_db()
            self.assertEqual(e.proximo_intento, AHORA + timedelta(hours=1) + timedelta(hours=4))
            procesar_envio(e, AHORA + timedelta(hours=5))
            e.refresh_from_db()
        self.assertEqual((e.estado, e.intentos), ('fallido', 3))
        self.assertTrue(EventoCiclo.objects.filter(tipo='mensaje_fallido').exists())

    def test_apagar_cancela_lo_pendiente_y_no_se_envia(self):
        self.mens(self.alumno())
        self.preparar()
        self.assertEqual(cancelar_envios_pendientes_sede(self.sede.id), 1)
        with patch(WA) as wa:
            procesar_envios(AHORA)
        wa.assert_not_called()
        self.assertEqual(EnvioCobranza.objects.get().estado, 'cancelado')

    def test_modulo_apagado_justo_antes_de_enviar_cancela(self):
        self.mens(self.alumno())
        self.preparar()
        self.config(activo=False)
        with patch(WA) as wa:
            procesar_envios(AHORA)
        wa.assert_not_called()
        self.assertEqual(EnvioCobranza.objects.get().estado, 'cancelado')

    @override_settings(COBRANZA_INTELIGENTE_GLOBAL_OFF=True)
    def test_corte_global_cancela(self):
        self.config()
        e = EnvioCobranza.objects.create(
            representante=self.rep, regla=ReglaCobranza.objects.get(sede=self.sede, dia_relativo=3),
            fecha=HOY, estado='pendiente', detalle={'ciclos': []})
        with patch(WA) as wa:
            procesar_envio(e, AHORA)
        wa.assert_not_called()
        e.refresh_from_db()
        self.assertEqual(e.estado, 'cancelado')

    def test_aviso_al_director_usa_su_contacto_no_el_del_representante(self):
        self.mens(self.alumno('E5', dia_limite=20), mes=6)   # venció el 20/jun => +30 hoy
        self.preparar()
        e = EnvioCobranza.objects.get()
        self.assertEqual(e.regla.dia_relativo, 30)
        with patch('notificaciones.services._notif_cfg') as cfg, \
                patch(WA, return_value=True) as wa, patch(EM, return_value=True) as em:
            cfg.return_value.director_email = 'director@t.com'
            cfg.return_value.director_whatsapp = '04140000000'
            procesar_envio(e, AHORA)
        self.assertEqual(wa.call_args[0][0], '04140000000')
        self.assertEqual(em.call_args[0][0], 'director@t.com')


class ApiSombraTest(MotorBase):
    def setUp(self):
        super().setUp()
        self.client = APIClient()
        self.client.force_authenticate(self.admin)

    def test_resumen_y_listado_de_la_sombra(self):
        self.mens(self.alumno())
        self.preparar(sombra=True)
        r = self.client.get('/api/cobranza/inteligente/sombra/resumen/')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data['por_estado'], {'simulado': 1})
        self.assertEqual(r.data['cantidad_falsos_positivos'], 0)
        r = self.client.get('/api/cobranza/inteligente/envios/', {'estado': 'simulado'})
        self.assertEqual(r.data['count'], 1)
        self.assertEqual(r.data['results'][0]['regla']['dia_relativo'], 3)

    def test_detecta_un_falso_positivo(self):
        m = self.mens(self.alumno())
        self.preparar(sombra=True)
        # la deuda figuraba pagada ANTES de generarse el aviso (ciclo desincronizado)
        Mensualidad.objects.filter(pk=m.pk).update(
            pagado=True, fecha_pago=timezone.now() - timedelta(days=1))
        r = self.client.get('/api/cobranza/inteligente/sombra/resumen/')
        self.assertEqual(r.data['cantidad_falsos_positivos'], 1)

    def test_apagado_responde_409(self):
        self.assertEqual(self.client.get('/api/cobranza/inteligente/envios/').status_code, 409)
        self.assertEqual(self.client.get('/api/cobranza/inteligente/sombra/resumen/').status_code, 409)

    def test_encender_crea_reglas_y_apagar_cancela_pendientes(self):
        ReglaCobranza.objects.all().delete()
        url = f'/api/cobranza/inteligente/configuracion/?sede={self.sede.id}'
        self.client.patch(url, {'activo': True}, format='json')
        self.assertEqual(ReglaCobranza.objects.filter(sede=self.sede).count(), 7)
        regla = ReglaCobranza.objects.get(sede=self.sede, dia_relativo=3)
        EnvioCobranza.objects.create(
            representante=self.rep, regla=regla, fecha=HOY, estado='pendiente', detalle={})
        self.client.patch(url, {'activo': False}, format='json')
        self.assertEqual(EnvioCobranza.objects.get().estado, 'cancelado')
