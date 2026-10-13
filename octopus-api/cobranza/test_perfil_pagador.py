"""
Tests del perfil de pagador y del recordatorio extra en −3 (v4 fase D).
`hoy` siempre fijo (2026-07-20, lunes); ver test_motor_cobranza.HOY.
"""
from datetime import date, datetime, timedelta
from decimal import Decimal

from django.utils import timezone
from rest_framework.test import APIClient

from secretaria.models import Representante

from . import perfil_pagador as pp
from .models import EnvioCobranza, Mensualidad, ReglaCobranza
from .motor import evaluar_reglas_sede, simular_reglas_sede
from .test_motor_cobranza import AHORA, HOY, MotorBase

URL = '/api/cobranza/inteligente/'


def aware(d):
    return timezone.make_aware(datetime(d.year, d.month, d.day, 12, 0))


class PerfilBase(MotorBase):
    def historial(self, alumno, pagos, impagos=()):
        """pagos: {mes: dias_de_atraso}. impagos: meses sin pagar. Vence el día `dia_limite_pago`."""
        for mes, atraso in pagos.items():
            venc = date(2026, mes, alumno.dia_limite_pago)
            Mensualidad.objects.create(alumno=alumno, mes=mes, anio=2026, monto_usd=50,
                                       monto_pagado=50, fecha_pago=aware(venc + timedelta(days=atraso)))
        for mes in impagos:
            Mensualidad.objects.create(alumno=alumno, mes=mes, anio=2026, monto_usd=50)

    def perfil(self, rep=None):
        return pp.perfil_de((rep or self.rep).id, HOY)


class ClasificacionTest(PerfilBase):
    def test_puntual(self):
        self.historial(self.alumno(dia_limite=10), {m: 0 for m in range(3, 8)})
        self.assertEqual(self.perfil(), pp.PUNTUAL)

    def test_tolerancia_de_3_dias_sigue_siendo_puntual(self):
        self.historial(self.alumno(dia_limite=10), {4: 3, 5: 3, 6: 3, 7: 0})
        self.assertEqual(self.perfil(), pp.PUNTUAL)

    def test_paga_tarde_pero_paga(self):
        self.historial(self.alumno(dia_limite=10), {4: 0, 5: 10, 6: 9, 7: 0})
        self.assertEqual(self.perfil(), pp.PAGA_TARDE)

    def test_moroso_nuevo_una_impaga_tras_buen_historial(self):
        self.historial(self.alumno(dia_limite=10), {m: 0 for m in range(3, 7)}, impagos=[7])
        self.assertEqual(self.perfil(), pp.MOROSO_NUEVO)

    def test_cronico_tres_impagas(self):
        self.historial(self.alumno(dia_limite=10), {4: 0}, impagos=[5, 6, 7])
        self.assertEqual(self.perfil(), pp.CRONICO)

    def test_cronico_mitad_impaga_con_cuatro_evaluables(self):
        self.historial(self.alumno(dia_limite=10), {5: 0, 6: 0}, impagos=[3, 7])
        self.assertEqual(self.perfil(), pp.CRONICO)

    def test_impaga_dentro_de_la_gracia_no_define_nada(self):
        a = self.alumno(dia_limite=18)       # venció el 18: 2 días de atraso, aún en gracia
        self.historial(a, {m: 0 for m in range(4, 7)}, impagos=[7])
        self.assertEqual(self.perfil(), pp.PUNTUAL)

    def test_sin_historial_futuras_becados_e_inactivos_no_cuentan(self):
        self.assertEqual(self.perfil(), pp.SIN_HISTORIAL)          # sin alumnos
        a = self.alumno(dia_limite=25)                              # julio aún no vence
        self.historial(a, {}, impagos=[7])
        self.assertEqual(self.perfil(), pp.SIN_HISTORIAL)
        b = self.alumno('E2', dia_limite=10)
        b.estatus_financiero = 'becado'
        b.save()
        self.historial(b, {}, impagos=[5, 6, 7])
        self.assertEqual(self.perfil(), pp.SIN_HISTORIAL)
        c = self.alumno('E3', dia_limite=10)
        c.activo = False
        c.save()
        self.historial(c, {}, impagos=[5, 6, 7])
        self.assertEqual(self.perfil(), pp.SIN_HISTORIAL)

    def test_ventana_de_6_meses(self):
        a = self.alumno(dia_limite=10)
        # Diciembre 2025 queda fuera de la ventana (desde enero 2026) aunque esté impago.
        Mensualidad.objects.create(alumno=a, mes=12, anio=2025, monto_usd=50)
        self.historial(a, {m: 0 for m in range(3, 8)})
        self.assertEqual(self.perfil(), pp.PUNTUAL)

    def test_perfiles_de_varios_en_una_sola_llamada(self):
        otro = Representante.objects.create(cedula='V2', nombre='Luis', apellido='Gil',
                                            telefono='04141234567', direccion='c')
        self.historial(self.alumno(dia_limite=10), {m: 0 for m in range(3, 8)})
        self.historial(self.alumno('E9', dia_limite=10, rep=otro), {}, impagos=[5, 6, 7])
        self.assertEqual(pp.perfiles_de([self.rep.id, otro.id], HOY),
                         {self.rep.id: pp.PUNTUAL, otro.id: pp.CRONICO})


class ApiPerfilTest(PerfilBase):
    def setUp(self):
        super().setUp()
        self.api = APIClient()
        self.api.force_authenticate(self.admin)
        a = self.alumno(dia_limite=10)
        self.historial(a, {4: 0, 5: 0, 6: 0}, impagos=[7])
        self.config()
        from .ciclos import evaluar_ciclos_sede
        evaluar_ciclos_sede(self.sede.id, HOY)
        from unittest.mock import patch
        p = patch('cobranza.views_hoy._hoy', return_value=HOY)
        p.start()
        self.addCleanup(p.stop)

    def test_endpoint_de_ficha(self):
        r = self.api.get(f'{URL}representantes/{self.rep.id}/perfil-pagador/')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data['perfil'], 'moroso_nuevo')
        self.assertEqual(r.data['etiqueta'], 'Moroso nuevo')
        self.assertEqual((r.data['evaluadas'], r.data['impagas_atrasadas'], r.data['pagadas_a_tiempo']), (4, 1, 3))
        self.assertEqual(r.data['meses'][-1]['pagada'], False)
        self.assertEqual(self.api.get(f'{URL}representantes/9999/perfil-pagador/').status_code, 404)

    def test_apagado_responde_409(self):
        self.config(activo=False)
        self.assertEqual(self.api.get(f'{URL}representantes/{self.rep.id}/perfil-pagador/').status_code, 409)

    def test_aparece_en_cartera_y_expediente(self):
        r = self.api.get(URL + 'cartera/')
        self.assertEqual(r.data['results'][0]['perfil_pagador'], {'codigo': 'moroso_nuevo', 'etiqueta': 'Moroso nuevo'})
        e = self.api.get(f'{URL}representantes/{self.rep.id}/expediente/')
        self.assertEqual(e.data['perfil_pagador']['codigo'], 'moroso_nuevo')
        self.assertEqual(e.data['ciclos'][0]['perfil_pagador']['codigo'], 'moroso_nuevo')


class RecordatorioExtraTest(PerfilBase):
    """Alumno que vence el 23: hoy (20) es el día −3 de la mensualidad de julio."""

    def preparar_rep(self, atrasos):
        a = self.alumno(dia_limite=23)
        self.historial(a, atrasos)
        Mensualidad.objects.create(alumno=a, mes=7, anio=2026, monto_usd=50)
        self.config()
        from .ciclos import evaluar_ciclos_sede
        evaluar_ciclos_sede(self.sede.id, HOY)

    def marcar(self, activo=True):
        ReglaCobranza.objects.filter(sede=self.sede, dia_relativo=-5).update(
            recordatorio_extra_paga_tarde=activo)

    def test_paga_tarde_recibe_el_extra_con_la_regla_marcada(self):
        self.preparar_rep({4: 10, 5: 12, 6: 8})
        self.marcar()
        self.assertEqual(evaluar_reglas_sede(self.sede.id, HOY)['creados'], 1)
        e = EnvioCobranza.objects.get()
        self.assertEqual((e.regla.dia_relativo, e.fecha), (-5, HOY))
        self.assertEqual((e.detalle['dia_relativo'], e.detalle['extra']), (-3, 'paga_tarde'))

    def test_sin_marcar_no_hay_extra(self):
        self.preparar_rep({4: 10, 5: 12, 6: 8})
        self.assertEqual(evaluar_reglas_sede(self.sede.id, HOY)['creados'], 0)

    def test_puntual_no_recibe_el_extra(self):
        self.preparar_rep({4: 0, 5: 0, 6: 0})
        self.marcar()
        self.assertEqual(evaluar_reglas_sede(self.sede.id, HOY)['creados'], 0)

    def test_regla_propia_en_menos_3_manda_sobre_el_extra(self):
        self.preparar_rep({4: 10, 5: 12, 6: 8})
        self.marcar()
        ReglaCobranza.objects.create(sede=self.sede, nombre='Propia', etapa='preventiva', dia_relativo=-3,
                                     canal='email', plantilla='preventivo')
        evaluar_reglas_sede(self.sede.id, HOY)
        self.assertEqual(EnvioCobranza.objects.get().regla.nombre, 'Propia')

    def test_regla_inactiva_o_interna_no_da_extra(self):
        self.preparar_rep({4: 10, 5: 12, 6: 8})
        self.marcar()
        ReglaCobranza.objects.filter(sede=self.sede, dia_relativo=-5).update(activa=False)
        self.assertEqual(evaluar_reglas_sede(self.sede.id, HOY)['creados'], 0)

    def test_simulacion_marca_el_extra(self):
        self.preparar_rep({4: 10, 5: 12, 6: 8})
        self.marcar()
        filas = simular_reglas_sede(self.sede.id, HOY, AHORA)
        self.assertEqual(len(filas), 1)
        self.assertTrue(filas[0]['recordatorio_extra'])
        self.assertEqual(filas[0]['regla']['dia_relativo'], -5)

    def test_validacion_de_la_regla_en_el_crud(self):
        api = APIClient()
        api.force_authenticate(self.admin)
        r5 = ReglaCobranza.objects.get(sede=self.sede, dia_relativo=-5)
        r1 = ReglaCobranza.objects.get(sede=self.sede, dia_relativo=-1)
        ok = api.patch(f'{URL}reglas/{r5.id}/', {'recordatorio_extra_paga_tarde': True}, format='json')
        self.assertEqual(ok.status_code, 200)
        self.assertTrue(ok.data['recordatorio_extra_paga_tarde'])
        dos = api.patch(f'{URL}reglas/{r1.id}/', {'recordatorio_extra_paga_tarde': True}, format='json')
        self.assertEqual(dos.status_code, 400)
        director = ReglaCobranza.objects.get(sede=self.sede, dia_relativo=30)
        malo = api.patch(f'{URL}reglas/{director.id}/', {'recordatorio_extra_paga_tarde': True}, format='json')
        self.assertEqual(malo.status_code, 400)
