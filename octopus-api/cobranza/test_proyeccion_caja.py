"""
Tests de la proyección de caja de la semana (v4 fase D). `hoy` fijo: lunes 2026-07-20,
semana 20 al 26 de julio.
"""
from datetime import date, timedelta
from decimal import Decimal
from unittest.mock import patch

from rest_framework.test import APIClient

from secretaria.models import Representante

from . import gestion, hoy as servicio_hoy, proyeccion
from .models import ConvenioPago, CuotaConvenio, Mensualidad
from .test_gestion_cobranza import GestionBase
from .test_motor_cobranza import AHORA, HOY

URL = '/api/cobranza/inteligente/proyeccion-caja/'


def d(n):
    return HOY + timedelta(days=n)


class ProyeccionBase(GestionBase):
    def setUp(self):
        super().setUp()
        self.api = APIClient()
        self.api.force_authenticate(self.admin)
        p = patch('cobranza.views_hoy._hoy', return_value=HOY)
        p.start()
        self.addCleanup(p.stop)
        self.rep2 = Representante.objects.create(cedula='V2', nombre='Luis', apellido='Gil',
                                                 telefono='04141234567', direccion='c')

    def sedes(self):
        return {self.sede.id}

    def cronico(self):
        """rep2 con 3 impagas atrasadas en el historial => perfil crónico."""
        a = self.alumno('E2', dia_limite=10, rep=self.rep2)
        for mes in (4, 5, 6):
            Mensualidad.objects.create(alumno=a, mes=mes, anio=2026, monto_usd=50)
        return a


class SemanaTest(ProyeccionBase):
    def test_semana_de_lunes_a_domingo(self):
        self.assertEqual(proyeccion.semana_de(HOY), (date(2026, 7, 20), date(2026, 7, 26)))
        self.assertEqual(proyeccion.semana_de(date(2026, 7, 26)), (date(2026, 7, 20), date(2026, 7, 26)))
        self.assertEqual(proyeccion.semana_de(date(2026, 7, 19)), (date(2026, 7, 13), date(2026, 7, 19)))


class CalculoTest(ProyeccionBase):
    def test_pondera_promesas_y_convenios_por_perfil(self):
        # rep (sin historial evaluable: dia_limite 17 => julio impaga 3 días, en gracia) + convenio de 2 cuotas
        c1 = self.ciclo('E1', dia_limite=17, monto=50)
        gestion.crear_convenio(self.rep, [c1], [(d(1), Decimal('25')), (d(4), Decimal('25'))], self.admin, hoy=HOY)
        # rep2 crónico + promesa de 30
        self.cronico()
        c2 = self.ciclo('E3', dia_limite=17, monto=30, rep=self.rep2)
        gestion.crear_promesa(self.rep2, [c2], d(2), self.admin, hoy=HOY)
        # fuera de la semana: no cuenta
        c3 = self.ciclo('E4', dia_limite=17, monto=40)
        gestion.crear_convenio(self.rep, [c3], [(d(7), Decimal('40'))], self.admin, hoy=HOY)

        p = proyeccion.calcular_proyeccion(self.sedes(), HOY)
        self.assertEqual((str(p['semana']['desde']), str(p['semana']['hasta'])), ('2026-07-20', '2026-07-26'))
        self.assertEqual(p['casos'], 3)
        self.assertEqual(p['comprometido_usd'], '80.00')
        # rep sin historial (0.60): 50 * .60 = 30.00 ; rep2 crónico (0.25): 30 * .25 = 7.50
        self.assertEqual(p['por_perfil']['sin_historial']['esperado_usd'], '30.00')
        self.assertEqual(p['por_perfil']['cronico']['esperado_usd'], '7.50')
        self.assertEqual(p['esperado_usd'], '37.50')
        self.assertEqual(p['por_fuente']['convenios'], {'casos': 2, 'comprometido_usd': '50.00', 'esperado_usd': '30.00'})
        self.assertEqual(p['por_fuente']['promesas'], {'casos': 1, 'comprometido_usd': '30.00', 'esperado_usd': '7.50'})
        self.assertEqual(p['por_perfil']['cronico']['probabilidad']['fuente'], 'por_defecto')
        self.assertEqual(len(p['por_dia']), 7)
        martes = next(x for x in p['por_dia'] if str(x['fecha']) == '2026-07-21')
        self.assertEqual((martes['casos'], martes['comprometido_usd']), (1, '25.00'))
        self.assertEqual({x['tipo'] for x in p['detalle']}, {'convenio', 'promesa'})

    def test_no_cuentan_pagadas_canceladas_ni_incumplidas(self):
        c1 = self.ciclo('E1', dia_limite=17, monto=50)
        conv = gestion.crear_convenio(self.rep, [c1], [(d(1), Decimal('25')), (d(2), Decimal('25'))], self.admin, hoy=HOY)
        gestion.marcar_cuota_pagada(conv.cuotas.first(), self.admin)
        self.assertEqual(proyeccion.calcular_proyeccion(self.sedes(), HOY)['casos'], 1)
        gestion.cancelar_convenio(conv, self.admin)
        self.assertEqual(proyeccion.calcular_proyeccion(self.sedes(), HOY)['casos'], 0)

    def test_probabilidad_historica_con_muestra_suficiente(self):
        c1 = self.ciclo('E1', dia_limite=17, monto=50)
        gestion.crear_promesa(self.rep, [c1], d(1), self.admin, hoy=HOY)
        # Historial de otros representantes crónicos: 12 cuotas vencidas, 3 pagadas => 0.25 -> 0.25 histórico
        self.cronico()
        previa = self.ciclo('E5', dia_limite=17, monto=10, rep=self.rep2)
        viejo = ConvenioPago.objects.create(representante=self.rep2, estado=ConvenioPago.INCUMPLIDO)
        viejo.ciclos.add(previa)
        for i in range(1, 13):
            CuotaConvenio.objects.create(convenio=viejo, numero=i, fecha=d(-i), monto_usd=Decimal('5'),
                                         pagada=i <= 3)
        p = proyeccion.calcular_proyeccion(self.sedes(), HOY)
        cron = p['por_perfil']['cronico']['probabilidad']
        self.assertEqual((cron['fuente'], cron['muestra'], cron['valor']), ('historica', 12, '0.25'))
        # el rep de la promesa sigue con el valor por defecto (sin muestra propia)
        self.assertEqual(p['por_perfil']['sin_historial']['probabilidad']['fuente'], 'por_defecto')

    def test_sede_y_fecha(self):
        c1 = self.ciclo('E1', dia_limite=17, monto=50)
        gestion.crear_promesa(self.rep, [c1], d(8), self.admin, hoy=HOY)   # semana siguiente
        self.assertEqual(proyeccion.calcular_proyeccion(self.sedes(), HOY)['casos'], 0)
        self.assertEqual(proyeccion.calcular_proyeccion(self.sedes(), HOY, d(8))['casos'], 1)
        self.assertEqual(proyeccion.calcular_proyeccion({999}, HOY, d(8))['casos'], 0)


class ApiTest(ProyeccionBase):
    def test_endpoint_y_hoy(self):
        c1 = self.ciclo('E1', dia_limite=17, monto=50)
        gestion.crear_promesa(self.rep, [c1], d(1), self.admin, hoy=HOY)
        r = self.api.get(URL)
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data['casos'], 1)
        self.assertEqual(r.data['esperado_usd'], '30.00')
        self.assertEqual(self.api.get(URL, {'fecha': '2026-07-30'}).data['casos'], 0)
        self.assertEqual(self.api.get(URL, {'fecha': 'hoy'}).status_code, 400)
        resumen = servicio_hoy.calcular_hoy(self.sedes(), HOY, AHORA)['proyeccion_caja']
        self.assertEqual((resumen['casos'], resumen['comprometido_usd']), (1, '50.00'))
        self.assertNotIn('detalle', resumen)

    def test_apagado_responde_409(self):
        self.config(activo=False)
        self.assertEqual(self.api.get(URL).status_code, 409)
