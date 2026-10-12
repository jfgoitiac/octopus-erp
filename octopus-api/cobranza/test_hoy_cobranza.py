"""
Tests de la pestaña "Hoy", promesas de pago, simulación en seco del motor y
control de envíos (PLAN_COBRANZA_INTELIGENTE_V4.md §5). `hoy`/`ahora` siempre fijos.
"""
from datetime import timedelta
from decimal import Decimal
from unittest.mock import patch

from rest_framework.test import APIClient

from secretaria.models import Representante

from . import control_envios, gestion, hoy as servicio_hoy
from .ciclos import evaluar_ciclos_sede
from .models import (
    BajaCobranza, CicloCobranza, ConvenioPago, EnvioCobranza, EventoCiclo, Pago, ReglaCobranza,
)
from .motor import evaluar_reglas_sede, procesar_envios, simular_reglas_sede
from .test_gestion_cobranza import GestionBase
from .test_motor_cobranza import AHORA, EM, HOY, WA

URL = '/api/cobranza/inteligente/'


def sedes(base):
    return {base.sede.id}


class HoyBase(GestionBase):
    def setUp(self):
        super().setUp()
        self.api = APIClient()
        self.api.force_authenticate(self.admin)
        for nombre in ('_hoy', '_ahora'):
            p = patch(f'cobranza.views_hoy.{nombre}', return_value=HOY if nombre == '_hoy' else AHORA)
            p.start()
            self.addCleanup(p.stop)

    def tarjetas(self, **kw):
        return servicio_hoy.calcular_hoy(sedes(self), HOY, AHORA)['tarjetas']


class ApagadoTest(HoyBase):
    def test_todo_responde_409_con_el_modulo_apagado(self):
        self.config(activo=False)
        for metodo, ruta in (
                ('get', 'hoy/'), ('get', 'contadores/'), ('get', 'motor/simulacion/'),
                ('post', 'hoy/tarjetas/x/hecha/'), ('post', 'promesas/'),
                ('get', f'representantes/{self.rep.id}/historial-cobros/')):
            r = getattr(self.api, metodo)(URL + ruta)
            self.assertEqual(r.status_code, 409, ruta)
            self.assertTrue(r.data['apagada'])


class TarjetasTest(HoyBase):
    def test_caso_prioritario_coincide_con_la_bandeja_y_explica_el_por_que(self):
        self.ciclo('E1', dia_limite=1, monto=200)   # 19 días de mora
        r = self.api.get(URL + 'hoy/')
        self.assertEqual(r.status_code, 200)
        fila = gestion.calcular_bandeja(CicloCobranza.objects.all(), HOY, AHORA)[0]
        t = r.data['tarjetas'][0]
        self.assertEqual(t['tipo'], 'caso_prioritario')
        self.assertEqual(t['representante']['id'], fila['representante']['id'])
        self.assertEqual(t['por_que'], fila['razones'])
        self.assertEqual(t['detalle']['puntaje'], fila['puntaje'])
        self.assertEqual(r.data['resumen']['casos_requieren_accion'], 1)
        self.assertIn('1 caso requiere acción', r.data['resumen']['frase'])

    def test_gestion_reciente_oculta_el_caso(self):
        c = self.ciclo('E1', dia_limite=1, monto=200)
        gestion.registrar_gestion(c, 'llamada', self.admin, 'habló')
        self.assertEqual(self.tarjetas(), [])

    def test_caso_leve_no_genera_tarjeta(self):
        self.ciclo('E1', dia_limite=17, monto=20)   # 3 días de mora, saldo bajo
        self.assertEqual([t for t in self.tarjetas() if t['tipo'] == 'caso_prioritario'], [])

    def test_marcar_hecha_deja_evento_y_oculta_hasta_el_dia_siguiente(self):
        c = self.ciclo('E1', dia_limite=1, monto=200)
        clave = self.tarjetas()[0]['clave']
        r = self.api.post(f'{URL}hoy/tarjetas/{clave}/hecha/', {'nota': 'ok'}, format='json')
        self.assertEqual(r.status_code, 200)
        ev = EventoCiclo.objects.get(tipo='tarjeta_hecha')
        self.assertEqual((ev.detalle['clave'], ev.usuario, ev.ciclo), (clave, self.admin, c))
        self.assertEqual(self.tarjetas(), [])
        # idempotente
        self.assertEqual(self.api.post(f'{URL}hoy/tarjetas/{clave}/hecha/').status_code, 200)
        EventoCiclo.objects.filter(tipo='tarjeta_hecha').update(creado_en=AHORA)   # reloj de la prueba
        # al día siguiente la regla vuelve a dispararla
        manana = servicio_hoy.calcular_hoy(sedes(self), HOY + timedelta(days=1), AHORA + timedelta(days=1))
        self.assertEqual(len(manana['tarjetas']), 1)

    def test_clave_inexistente_404(self):
        self.ciclo()
        r = self.api.post(f'{URL}hoy/tarjetas/no_existe:1/hecha/')
        self.assertEqual(r.status_code, 404)

    def test_pago_en_revision_con_mas_de_3_dias(self):
        a = self.alumno()
        self.mens(a)
        self.config()
        evaluar_ciclos_sede(self.sede.id, HOY)
        p = Pago.objects.create(alumno=a, usuario_receptor=self.admin, metodo_pago='transferencia',
                                monto_usd=50, tasa_aplicada=40, estatus='en_revision')
        Pago.objects.filter(pk=p.pk).update(fecha_pago=AHORA - timedelta(days=5))
        t = [x for x in self.tarjetas() if x['tipo'] == 'pago_en_revision']
        self.assertEqual(len(t), 1)
        self.assertEqual(t[0]['clave'], f'pago_en_revision:pago:{p.id}')
        self.assertEqual(t[0]['detalle']['dias_espera'], 5)
        Pago.objects.filter(pk=p.pk).update(fecha_pago=AHORA - timedelta(days=1))
        self.assertEqual([x for x in self.tarjetas() if x['tipo'] == 'pago_en_revision'], [])

    def test_envio_fallido_genera_tarjeta(self):
        self.ciclo()
        regla = ReglaCobranza.objects.filter(sede=self.sede).first()
        e = EnvioCobranza.objects.create(representante=self.rep, regla=regla, fecha=HOY,
                                         estado='fallido', intentos=3, canal='whatsapp')
        t = [x for x in self.tarjetas() if x['tipo'] == 'envio_fallido']
        self.assertEqual([x['clave'] for x in t], [f'envio_fallido:{e.id}'])
        self.assertEqual(t[0]['detalle']['intentos'], 3)

    def test_sin_contacto_valido(self):
        Representante.objects.filter(pk=self.rep.pk).update(telefono='', correo='')
        self.ciclo()
        t = [x for x in self.tarjetas() if x['tipo'] == 'sin_contacto']
        self.assertEqual([x['clave'] for x in t], [f'sin_contacto:{self.rep.id}'])
        self.assertEqual(self.api.get(URL + 'contadores/').data['total_tarjetas'], 1)

    def test_fuente_extra_registrada_por_otra_fase(self):
        self.ciclo()
        extra = {'clave': 'conversacion_espera:1', 'tipo': 'conversacion_espera', 'prioridad': 99,
                 'urgente': True, 'titulo': 'x', 'por_que': [], 'representante': None, 'ciclos': [],
                 'acciones': [], 'desde': AHORA, 'sede': None, 'detalle': {}}
        fuente = lambda ctx: [extra]   # noqa: E731
        servicio_hoy.registrar_fuente(fuente)
        self.addCleanup(servicio_hoy.FUENTES_TARJETAS.remove, fuente)
        self.assertEqual(self.tarjetas()[0]['clave'], 'conversacion_espera:1')
        self.assertEqual(self.api.get(URL + 'contadores/').data['tarjetas_urgentes'], 1)

    def test_kpis_y_actividad(self):
        self.ciclo('E1', dia_limite=1, monto=200)
        d = self.api.get(URL + 'hoy/').data
        self.assertEqual(d['kpis']['distribucion_por_etapa']['critica']['casos']
                         + d['kpis']['distribucion_por_etapa']['prioritaria']['casos']
                         + d['kpis']['distribucion_por_etapa']['seguimiento']['casos']
                         + d['kpis']['distribucion_por_etapa']['vencida']['casos'], 1)
        self.assertEqual(sum(d['kpis']['mora_por_antiguedad'].values()), 1)
        self.assertEqual(d['kpis']['mora_por_antiguedad']['16_30'], 1)
        self.assertEqual(d['actividad'], [])


class PromesaTest(HoyBase):
    def test_promesa_por_api_es_un_convenio_de_una_cuota_que_pausa(self):
        c = self.ciclo(monto=50)
        fecha = (HOY + timedelta(days=5)).isoformat()
        r = self.api.post(URL + 'promesas/', {
            'representante_id': self.rep.id, 'ciclo_ids': [c.id], 'fecha': fecha}, format='json')
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual((r.data['tipo'], r.data['origen']), ('promesa', 'cobrador'))
        self.assertEqual(len(r.data['cuotas']), 1)
        self.assertEqual(r.data['cuotas'][0]['monto_usd'], '50.00')
        c.refresh_from_db()
        self.assertEqual((c.estado, c.motivo_pausa), ('pausada', 'convenio'))
        lista = self.api.get(URL + 'convenios/?tipo=promesa').data['results']
        self.assertEqual([x['id'] for x in lista], [r.data['id']])
        self.assertEqual(self.api.get(URL + 'convenios/?tipo=convenio').data['results'], [])

    def test_promesa_valida_fecha_y_monto(self):
        c = self.ciclo(monto=50)
        malo = self.api.post(URL + 'promesas/', {
            'representante_id': self.rep.id, 'ciclo_ids': [c.id], 'fecha': 'mañana'}, format='json')
        self.assertEqual(malo.status_code, 400)
        pasada = self.api.post(URL + 'promesas/', {
            'representante_id': self.rep.id, 'ciclo_ids': [c.id],
            'fecha': (HOY - timedelta(days=1)).isoformat()}, format='json')
        self.assertEqual(pasada.status_code, 400)
        monto = self.api.post(URL + 'promesas/', {
            'representante_id': self.rep.id, 'ciclo_ids': [c.id], 'monto': '10',
            'fecha': (HOY + timedelta(days=1)).isoformat()}, format='json')
        self.assertEqual(monto.status_code, 400)

    def test_una_promesa_no_admite_varias_cuotas(self):
        c = self.ciclo(monto=50)
        with self.assertRaises(gestion.AccionInvalida):
            gestion.crear_convenio(
                self.rep, [c], [(HOY + timedelta(days=1), Decimal('25')), (HOY + timedelta(days=2), Decimal('25'))],
                self.admin, hoy=HOY, tipo='promesa')

    def test_cumplida_cierra_y_no_genera_tarjeta(self):
        c = self.ciclo(monto=50)
        conv = gestion.crear_promesa(self.rep, [c], HOY + timedelta(days=3), self.admin, hoy=HOY)
        gestion.marcar_cuota_pagada(conv.cuotas.get(), self.admin)
        conv.refresh_from_db()
        self.assertEqual(conv.estado, ConvenioPago.CUMPLIDO)
        self.assertEqual(gestion.revisar_convenios(HOY + timedelta(days=10)), 0)
        self.assertEqual([t for t in self.tarjetas() if t['tipo'] == 'promesa_vencida'], [])

    def test_incumplida_devuelve_el_ciclo_y_genera_tarjeta(self):
        c = self.ciclo(monto=50)
        etapa = c.estado
        conv = gestion.crear_promesa(self.rep, [c], HOY + timedelta(days=3), self.admin, hoy=HOY)
        self.assertEqual([t for t in self.tarjetas() if t['tipo'] == 'promesa_vencida'], [])
        despues = HOY + timedelta(days=4)
        self.assertEqual(gestion.revisar_convenios(despues), 1)
        c.refresh_from_db()
        self.assertEqual(c.estado, etapa)
        tarjetas = [t for t in servicio_hoy.calcular_hoy(sedes(self), despues, AHORA + timedelta(days=4))['tarjetas']
                    if t['tipo'] == 'promesa_vencida']
        self.assertEqual([t['clave'] for t in tarjetas], [f'promesa_vencida:{conv.id}'])
        self.assertTrue(tarjetas[0]['urgente'])
        # al marcarla hecha desaparece
        servicio_hoy.marcar_tarjeta_hecha(tarjetas[0]['clave'], self.admin, sedes(self), despues,
                                          AHORA + timedelta(days=4))
        self.assertEqual(
            [t for t in servicio_hoy.calcular_hoy(sedes(self), despues, AHORA + timedelta(days=4) + timedelta(minutes=1))['tarjetas']
             if t['tipo'] == 'promesa_vencida'], [])


class SimulacionTest(HoyBase):
    def test_no_crea_registros_y_coincide_con_la_evaluacion_real(self):
        self.mens(self.alumno(dia_limite=17))   # +3 hoy => regla de seguimiento
        self.config()
        evaluar_ciclos_sede(self.sede.id, HOY)
        r = self.api.get(URL + 'motor/simulacion/?fecha=2026-07-20')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(EnvioCobranza.objects.count(), 0)
        self.assertEqual(r.data['total'], 1)
        item = r.data['items'][0]
        self.assertEqual((item['estado'], item['regla']['dia_relativo'], item['canal']), ('saldria', 3, 'whatsapp'))
        self.assertEqual(r.data['por_estado'], {'saldria': 1})
        # la evaluación real crea exactamente eso
        self.assertEqual(evaluar_reglas_sede(self.sede.id, HOY)['creados'], 1)
        r2 = self.api.get(URL + 'motor/simulacion/?fecha=2026-07-20')
        self.assertEqual(r2.data['items'][0]['estado'], 'ya_creado')

    def test_otra_fecha_y_sin_retroactivos(self):
        self.mens(self.alumno(dia_limite=17))
        self.config()
        evaluar_ciclos_sede(self.sede.id, HOY)
        manana = self.api.get(URL + 'motor/simulacion/?fecha=2026-07-21')
        self.assertEqual(manana.data['total'], 0)
        d7 = self.api.get(URL + 'motor/simulacion/?fecha=2026-07-24')   # +7 => ambos
        self.assertEqual((d7.data['total'], d7.data['items'][0]['canal']), (1, 'ambos'))
        self.assertEqual(EnvioCobranza.objects.count(), 0)

    def test_modo_sombra_y_omisiones_previstas(self):
        a = self.alumno(dia_limite=17)
        self.mens(a)
        self.config(sombra=True)
        evaluar_ciclos_sede(self.sede.id, HOY)
        self.assertEqual(self.api.get(URL + 'motor/simulacion/').data['items'][0]['estado'], 'solo_simulado')
        self.config(sombra=False)
        BajaCobranza.objects.create(representante=self.rep, canal='whatsapp')
        item = self.api.get(URL + 'motor/simulacion/').data['items'][0]
        self.assertEqual((item['estado'], item['motivos_omision']), ('se_omitiria', ['baja_voluntaria']))
        self.assertEqual(EnvioCobranza.objects.count(), 0)

    def test_fecha_invalida(self):
        self.ciclo()
        self.assertEqual(self.api.get(URL + 'motor/simulacion/?fecha=20-07').status_code, 400)

    def test_resumen_de_hoy_cuenta_los_envios_programados(self):
        self.mens(self.alumno(dia_limite=17))
        self.config()
        evaluar_ciclos_sede(self.sede.id, HOY)
        d = self.api.get(URL + 'hoy/').data
        self.assertEqual(d['resumen']['envios_programados_hoy'], 1)
        self.assertIn('El sistema enviará 1 recordatorio a las 8:00.', d['resumen']['frase'])


class ControlEnviosTest(HoyBase):
    def test_veredictos_por_origen(self):
        c = self.ciclo()
        BajaCobranza.objects.create(representante=self.rep, canal='whatsapp')
        api = control_envios.puede_enviar_cobro(self.rep, 'whatsapp', 'manual_api', AHORA)
        self.assertFalse(api.permitido)
        self.assertEqual([b['codigo'] for b in api.bloqueos], ['baja_voluntaria'])
        wame = control_envios.puede_enviar_cobro(self.rep, 'whatsapp', 'manual_wame', AHORA)
        self.assertTrue(wame.permitido)   # wa.me solo avisa
        self.assertEqual([a['codigo'] for a in wame.avisos], ['baja_voluntaria'])
        # un canal sin baja pasa
        self.assertTrue(control_envios.puede_enviar_cobro(self.rep, 'email', 'manual_api', AHORA).permitido)
        # pago en revisión bloquea
        BajaCobranza.objects.all().delete()
        Pago.objects.create(alumno=c.mensualidad.alumno, usuario_receptor=self.admin,
                            metodo_pago='transferencia', monto_usd=50, tasa_aplicada=40, estatus='en_revision')
        v = control_envios.puede_enviar_cobro(self.rep, 'whatsapp', 'manual_api', AHORA)
        self.assertEqual([b['codigo'] for b in v.bloqueos], ['pago_en_revision'])

    def test_cobro_manual_cuenta_para_el_tope_semanal_y_el_dia(self):
        c = self.ciclo()
        for _ in range(3):
            control_envios.registrar_cobro(self.rep, 'whatsapp', 'manual_wame', self.admin, 'x',
                                           [c], AHORA)
        self.assertEqual(control_envios.mensajes_en_semana(self.rep, AHORA), 3)
        v = control_envios.puede_enviar_cobro(self.rep, 'whatsapp', 'manual_api', AHORA)
        self.assertEqual(sorted(a['codigo'] for a in v.avisos), ['cobro_manual_hoy', 'limite_semanal'])
        self.assertTrue(v.requiere_confirmacion)
        self.assertTrue(EventoCiclo.objects.filter(ciclo=c, tipo='cobro_manual', usuario=self.admin).exists())

    def test_motor_no_envia_el_mismo_dia_de_un_cobro_manual(self):
        c = self.ciclo()          # +3 => whatsapp
        evaluar_reglas_sede(self.sede.id, HOY)
        control_envios.registrar_cobro(self.rep, 'whatsapp', 'manual_api', self.admin, 'x', [c], AHORA)
        with patch(WA) as wa, patch(EM):
            procesar_envios(AHORA)
        wa.assert_not_called()
        self.assertEqual(EnvioCobranza.objects.get().motivo_omision, 'cobro_manual_hoy')

    def test_manual_de_otro_dia_no_afecta_al_motor(self):
        c = self.ciclo()
        evaluar_reglas_sede(self.sede.id, HOY)
        control_envios.registrar_cobro(self.rep, 'whatsapp', 'manual_api', self.admin, 'x', [c], AHORA)
        EventoCiclo.objects.filter(tipo='cobro_manual').update(creado_en=AHORA - timedelta(days=1))
        self.assertFalse(control_envios.hubo_cobro_manual_hoy(self.rep, AHORA))
        with patch(WA, return_value=True) as wa, patch(EM, return_value=True):
            procesar_envios(AHORA)
        self.assertEqual(wa.call_count, 1)

    def test_sin_ciclos_el_cobro_manual_queda_como_evento_de_sede(self):
        control_envios.registrar_cobro(self.rep, 'whatsapp', 'manual_wame', self.admin, 'x', [], AHORA,
                                       sede_id=self.sede.id)
        ev = EventoCiclo.objects.get(tipo='cobro_manual')
        self.assertEqual((ev.ciclo, ev.sede_id), (None, self.sede.id))

    def test_historial_unificado_con_etiqueta_de_origen(self):
        from notificaciones.models import NotificacionLog
        c = self.ciclo()
        regla = ReglaCobranza.objects.filter(sede=self.sede).first()
        EnvioCobranza.objects.create(representante=self.rep, regla=regla, fecha=HOY, estado='enviado',
                                     canal='whatsapp', enviado_en=AHORA)
        NotificacionLog.objects.create(canal='whatsapp', tipo='cobro_whatsapp', modo='manual',
                                       estado='enviado', destinatario='+58', mensaje='hola',
                                       representante_cedula=self.rep.cedula)
        NotificacionLog.objects.create(canal='whatsapp', tipo='cobro_whatsapp', modo='automatico',
                                       estado='enviado', destinatario='+58', mensaje='hola',
                                       representante_cedula=self.rep.cedula)
        NotificacionLog.objects.create(canal='email', tipo='mora_dia_5', estado='enviado',
                                       destinatario='a@b.c', asunto='Recordatorio',
                                       representante_cedula=self.rep.cedula)
        r = self.api.get(f'{URL}representantes/{self.rep.id}/historial-cobros/')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(sorted(f['origen'] for f in r.data['results']),
                         ['aviso_anterior', 'manual_api', 'manual_wame', 'motor'])
        self.assertTrue(all(f['origen_etiqueta'] for f in r.data['results']))
        self.assertEqual(c.mensualidad.alumno.representante_id, self.rep.id)
