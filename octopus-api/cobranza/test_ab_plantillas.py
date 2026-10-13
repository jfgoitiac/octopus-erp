"""
Tests de la comparación A/B de plantillas de Meta (v4 fase D). `hoy`/`ahora` fijos
(ver test_motor_cobranza.HOY / AHORA).
"""
import itertools
from datetime import timedelta
from unittest.mock import patch

from rest_framework.test import APIClient

from secretaria.models import Representante

from . import ab
from .models import CicloCobranza, EnvioCobranza, ReglaCobranza
from .motor import evaluar_reglas_sede, procesar_envio, simular_reglas_sede, variante_para
from .test_motor_cobranza import AHORA, HOY, WA, MotorBase

URL = '/api/cobranza/inteligente/'
_n = itertools.count(1)


class ABBase(MotorBase):
    def setUp(self):
        super().setUp()
        self.regla = ReglaCobranza.objects.get(sede=self.sede, dia_relativo=3)
        self.rep2 = Representante.objects.create(cedula='V2', nombre='Luis', apellido='Gil',
                                                 telefono='04141234567', direccion='c')

    def dos_plantillas(self, a='cobro_a', b='cobro_b'):
        ReglaCobranza.objects.filter(pk=self.regla.pk).update(plantilla_meta=a, plantilla_meta_b=b)
        self.regla.refresh_from_db()


class AsignacionTest(ABBase):
    def test_solo_con_ambas_plantillas_y_para_whatsapp_al_representante(self):
        self.assertEqual(variante_para(self.rep, self.regla), '')
        self.dos_plantillas()
        self.assertEqual(variante_para(self.rep, self.regla), 'A' if self.rep.id % 2 else 'B')
        # alterna: representantes con id de distinta paridad reciben variantes distintas
        self.assertEqual(self.rep2.id, self.rep.id + 1)     # ids consecutivos => una A y la otra B
        self.assertNotEqual(variante_para(self.rep, self.regla), variante_para(self.rep2, self.regla))
        self.regla.canal = 'email'
        self.assertEqual(variante_para(self.rep, self.regla), '')
        self.regla.canal, self.regla.destinatario = 'whatsapp', 'director'
        self.assertEqual(variante_para(self.rep, self.regla), '')
        self.regla.destinatario, self.regla.plantilla_meta = 'representante', ''
        self.assertEqual(variante_para(self.rep, self.regla), '')

    def test_es_estable_para_el_mismo_representante(self):
        self.dos_plantillas()
        self.assertEqual({variante_para(self.rep, self.regla) for _ in range(5)}.__len__(), 1)

    def test_el_envio_guarda_la_variante_y_la_simulacion_la_muestra(self):
        self.dos_plantillas()
        self.mens(self.alumno('E1', dia_limite=17))
        self.mens(self.alumno('E2', dia_limite=17, rep=self.rep2))
        self.preparar()
        variantes = {e.representante_id: e.variante for e in EnvioCobranza.objects.all()}
        self.assertEqual(variantes[self.rep.id], variante_para(self.rep, self.regla))
        self.assertEqual(variantes[self.rep2.id], variante_para(self.rep2, self.regla))
        self.assertEqual(set(variantes.values()), {'A', 'B'})     # ids consecutivos: una y otra
        EnvioCobranza.objects.all().delete()
        filas = simular_reglas_sede(self.sede.id, HOY, AHORA)
        self.assertEqual({f['variante'] for f in filas}, {'A', 'B'})

    def test_sin_dos_plantillas_la_variante_queda_vacia(self):
        self.mens(self.alumno('E1', dia_limite=17))
        self.preparar()
        self.assertEqual(EnvioCobranza.objects.get().variante, '')


class EnvioTest(ABBase):
    def enviar(self, rep_ids):
        salidas = {}
        for rep_id in rep_ids:
            envio = EnvioCobranza.objects.get(representante_id=rep_id)
            with patch('notificaciones.services._proveedor_whatsapp', return_value='meta'), \
                    patch(WA, return_value=True) as wa:
                self.assertEqual(procesar_envio(envio, AHORA), 'enviado')
            salidas[rep_id] = wa.call_args.kwargs['template_data']
        return salidas

    def test_cada_variante_sale_con_su_plantilla(self):
        self.dos_plantillas('cobro_a', 'cobro_b')
        self.mens(self.alumno('E1', dia_limite=17))
        self.mens(self.alumno('E2', dia_limite=17, rep=self.rep2))
        self.preparar()
        salidas = self.enviar([self.rep.id, self.rep2.id])
        for rep in (self.rep, self.rep2):
            esperado = 'cobro_a' if variante_para(rep, self.regla) == 'A' else 'cobro_b'
            self.assertEqual(salidas[rep.id]['nombre'], esperado)
        self.assertEqual({s['nombre'] for s in salidas.values()}, {'cobro_a', 'cobro_b'})

    def test_la_variante_queda_en_el_mensaje_de_la_conversacion(self):
        from notificaciones.models import MensajeWhatsApp
        self.dos_plantillas()
        self.mens(self.alumno('E1', dia_limite=17))
        self.preparar()
        self.enviar([self.rep.id])
        m = MensajeWhatsApp.objects.get(direccion='saliente')
        self.assertEqual(m.payload['variante'], variante_para(self.rep, self.regla))

    def test_sin_b_usa_solo_la_plantilla_a_sin_variante(self):
        self.dos_plantillas('cobro_a', '')
        self.mens(self.alumno('E1', dia_limite=17))
        self.preparar()
        self.assertEqual(self.enviar([self.rep.id])[self.rep.id]['nombre'], 'cobro_a')


class ReporteTest(ABBase):
    """Envíos armados a mano con ciclos cerrados por pago en días concretos tras el envío."""

    def envio(self, variante, enviado_hace, pago_tras=None, saldo=50):
        n = next(_n)
        alumno = self.alumno(f'R{n}', dia_limite=17)
        m = self.mens(alumno, mes=6, monto=saldo)
        enviado_en = AHORA - timedelta(days=enviado_hace)
        ciclo = CicloCobranza.objects.create(
            mensualidad=m, fecha_vencimiento=HOY - timedelta(days=30),
            estado=CicloCobranza.CERRADA if pago_tras is not None else CicloCobranza.SEGUIMIENTO,
            motivo_cierre='pagada' if pago_tras is not None else '',
            cerrado_en=enviado_en + timedelta(days=pago_tras) if pago_tras is not None else None)
        return EnvioCobranza.objects.create(
            representante=self.rep, regla=self.regla, fecha=HOY - timedelta(days=n), estado='enviado',
            variante=variante, enviado_en=enviado_en,
            detalle={'ciclos': [ciclo.id], 'saldos': {str(ciclo.id): str(saldo)}, 'saldo_total': str(saldo)})

    def armar(self):
        self.dos_plantillas()
        self.envio('A', 10, pago_tras=1)
        self.envio('A', 10, pago_tras=6.5)
        self.envio('A', 10, pago_tras=8)          # pagó, pero fuera de los 7 días
        self.envio('A', 3)                         # inmaduro: aún no se mide
        self.envio('B', 10, pago_tras=2)
        self.envio('B', 10)                        # no pagó

    def fila(self, **params):
        return ab.reporte_ab({self.sede.id}, AHORA, **params)['results'][0]

    def test_recuperado_a_7_dias_por_variante(self):
        self.armar()
        f = self.fila()
        a, b = f['A'], f['B']
        self.assertEqual((a['plantilla'], b['plantilla']), ('cobro_a', 'cobro_b'))
        self.assertEqual((a['enviados'], a['medidos'], a['por_medir'], a['pagaron']), (4, 3, 1, 2))
        self.assertEqual((a['saldo_medido_usd'], a['recuperado_usd'], a['recuperado_pct']), ('150.00', '100.00', 66.67))
        self.assertEqual(a['tasa_pago_pct'], 66.67)
        self.assertEqual((b['enviados'], b['medidos'], b['pagaron'], b['recuperado_pct']), (2, 2, 1, 50.0))
        self.assertEqual(f['regla']['id'], self.regla.id)

    def test_sin_muestra_suficiente_no_hay_ganadora(self):
        self.armar()
        f = self.fila()
        self.assertFalse(f['muestra_suficiente'])
        self.assertIsNone(f['ganadora'])
        self.assertIsNone(f['diferencia_recuperado_pp'])

    def test_con_muestra_declara_ganadora_o_empate(self):
        self.armar()
        with patch('cobranza.ab.MUESTRA_MINIMA', 2):
            f = self.fila()
            self.assertEqual((f['ganadora'], f['diferencia_recuperado_pp']), ('A', '16.67'))
            with patch('cobranza.ab.DIFERENCIA_MINIMA_PP', ab.Decimal('20')):
                self.assertEqual(self.fila()['ganadora'], 'empate')

    def test_solo_cuenta_enviados_reales_y_filtra_por_fecha(self):
        self.armar()
        EnvioCobranza.objects.filter(variante='B').update(estado='simulado')
        self.assertEqual(self.fila()['B']['enviados'], 0)
        self.assertEqual(self.fila(desde=HOY + timedelta(days=1))['A']['enviados'], 0)

    def test_regla_con_ab_sin_envios_aparece_en_cero(self):
        self.dos_plantillas()
        f = self.fila()
        self.assertEqual((f['A']['enviados'], f['B']['enviados'], f['A']['recuperado_pct']), (0, 0, None))
        self.assertTrue(f['regla']['ab_activo'])

    def test_endpoint(self):
        self.armar()
        self.config()
        api = APIClient()
        api.force_authenticate(self.admin)
        with patch('cobranza.views_hoy._ahora', return_value=AHORA):
            r = api.get(URL + 'ab/reporte/', {'regla': self.regla.id})
            self.assertEqual(r.status_code, 200)
            self.assertEqual(r.data['count'], 1)
            self.assertEqual(r.data['results'][0]['A']['medidos'], 3)
            self.assertEqual(r.data['dias_medicion'], 7)
            self.assertEqual(api.get(URL + 'ab/reporte/', {'desde': 'x'}).status_code, 400)
            self.config(activo=False)
            self.assertEqual(api.get(URL + 'ab/reporte/').status_code, 409)


class CrudABTest(ABBase):
    def test_validaciones_de_plantilla_b(self):
        api = APIClient()
        api.force_authenticate(self.admin)
        url = f'{URL}reglas/{self.regla.id}/'
        self.assertEqual(api.patch(url, {'plantilla_meta_b': 'solo_b'}, format='json').status_code, 400)
        self.assertEqual(api.patch(url, {'plantilla_meta': 'x', 'plantilla_meta_b': 'x'}, format='json').status_code, 400)
        r = api.patch(url, {'plantilla_meta': 'cobro_a', 'plantilla_meta_b': 'cobro_b'}, format='json')
        self.assertEqual(r.status_code, 200)
        self.assertTrue(r.data['ab_activo'])
        # vaciar A con B puesta no se puede
        self.assertEqual(api.patch(url, {'plantilla_meta': ''}, format='json').status_code, 400)
        # quitar B apaga el A/B
        self.assertFalse(api.patch(url, {'plantilla_meta_b': ''}, format='json').data['ab_activo'])
