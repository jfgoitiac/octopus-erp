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
