from datetime import timedelta
from decimal import Decimal
from unittest.mock import patch

from . import gestion
from .models import RecargoConvenio
from .recargos_convenio import detener_recargos_convenio, generar_recargos_convenio
from .test_recargos_convenio import RecargoConvenioBase
from .test_motor_cobranza import AHORA, HOY


class RegresionesDevengoConvenioTest(RecargoConvenioBase):
    def recurrente(self, **configuracion):
        return self.crear(configuracion=self.configuracion(
            frecuencia_recargo='recurrente', **configuracion))

    def generar(self, convenio, dias):
        return generar_recargos_convenio(
            convenio.pk, fecha_referencia=HOY + timedelta(days=dias),
            momento=AHORA + timedelta(days=dias))

    def test_anulado_conserva_fecha_y_no_duplica_otro_periodo(self):
        _, convenio = self.recurrente()
        gestion.incumplir_convenio(convenio, momento=AHORA)
        self.generar(convenio, 1)
        convenio.recargos_incumplimiento.filter(numero_periodo=1).update(estado=RecargoConvenio.ANULADO)
        self.generar(convenio, 2)
        self.generar(convenio, 2)
        self.assertEqual(list(convenio.recargos_incumplimiento.values_list('fecha_programada', flat=True)),
                         [HOY, HOY + timedelta(days=1), HOY + timedelta(days=2)])

    def test_anular_unico_no_lo_recrea(self):
        _, convenio = self.crear(configuracion=self.configuracion())
        gestion.incumplir_convenio(convenio, momento=AHORA)
        convenio.recargos_incumplimiento.update(estado=RecargoConvenio.ANULADO)
        self.assertEqual(self.generar(convenio, 4), [])
        self.assertEqual(convenio.recargos_incumplimiento.count(), 1)

    def test_anulado_no_consume_maximo_ni_tope(self):
        _, convenio = self.recurrente(maximo_aplicaciones=3, tope_recargo_usd='12.00')
        gestion.incumplir_convenio(convenio, momento=AHORA)
        convenio.recargos_incumplimiento.update(estado=RecargoConvenio.ANULADO)
        self.generar(convenio, 5)
        cobrables = convenio.recargos_incumplimiento.exclude(estado=RecargoConvenio.ANULADO)
        self.assertEqual(list(cobrables.values_list('monto_recargo_usd', flat=True)),
                         [Decimal('5.00'), Decimal('5.00'), Decimal('2.00')])
        self.assertEqual(convenio.recargos_incumplimiento.count(), 4)

    def test_episodios_mismo_dia_tienen_unico_propio(self):
        _, convenio = self.crear(configuracion=self.configuracion())
        gestion.incumplir_convenio(convenio, momento=AHORA)
        # Simula la transición ya regularizada sin alterar cuotas/principal.
        convenio.estado = convenio.VIGENTE
        convenio.save(update_fields=['estado'])
        segundo = AHORA + timedelta(hours=1)
        gestion.incumplir_convenio(convenio, momento=segundo)
        self.generar(convenio, 0)
        self.assertEqual(list(convenio.recargos_incumplimiento.values_list('episodio_iniciado_en', flat=True)),
                         [AHORA, segundo])

    def test_pago_final_liquida_atrasados_antes_de_detener(self):
        _, convenio = self.recurrente()
        gestion.incumplir_convenio(convenio, momento=AHORA)
        with patch('django.utils.timezone.now', return_value=AHORA + timedelta(days=3)):
            gestion.marcar_cuota_pagada(convenio.cuotas.get(), self.admin)
        self.assertEqual(self.generar(convenio, 5), [])
        self.assertEqual(sum(convenio.recargos_incumplimiento.values_list('monto_recargo_usd', flat=True)),
                         Decimal('20.00'))

    def test_job_diario_y_atrasado_coinciden_al_pagar_ese_dia(self):
        # Dos historiales sobre el mismo convenio: el segundo se reconstruye
        # desde las cuotas pagadas, sin depender del orden job/pago del día.
        _, convenio = self.recurrente(modo_recargo='porcentaje', valor_recargo='10.00')
        gestion.incumplir_convenio(convenio, momento=AHORA)
        self.generar(convenio, 3)
        esperado = list(convenio.recargos_incumplimiento.values_list(
            'fecha_programada', 'saldo_base_usd', 'monto_recargo_usd'))
        convenio.recargos_incumplimiento.filter(numero_periodo__gt=1).delete()
        with patch('django.utils.timezone.now', return_value=AHORA + timedelta(days=3)):
            gestion.marcar_cuota_pagada(convenio.cuotas.get(), self.admin)
        self.assertEqual(list(convenio.recargos_incumplimiento.values_list(
            'fecha_programada', 'saldo_base_usd', 'monto_recargo_usd')), esperado)

    def test_pago_parcial_no_cambia_base_del_mismo_dia(self):
        ciclo = self.ciclo(monto=Decimal('100.00'))
        convenio = gestion.crear_convenio(
            self.rep, [ciclo], [(HOY + timedelta(days=7), Decimal('50.00')),
                               (HOY + timedelta(days=14), Decimal('50.00'))],
            self.admin, hoy=HOY, momento=AHORA,
            configuracion=self.configuracion(frecuencia_recargo='recurrente',
                                             modo_recargo='porcentaje', valor_recargo='10.00'))
        gestion.incumplir_convenio(convenio, momento=AHORA)
        self.generar(convenio, 2)
        esperado = list(convenio.recargos_incumplimiento.values_list(
            'fecha_programada', 'saldo_base_usd', 'monto_recargo_usd'))
        convenio.recargos_incumplimiento.filter(numero_periodo__gt=1).delete()
        primera = convenio.cuotas.get(numero=1)
        primera.pagada = True
        primera.pagada_en = AHORA + timedelta(days=2)
        primera.save(update_fields=['pagada', 'pagada_en'])
        self.generar(convenio, 3)
        reconstruido = list(convenio.recargos_incumplimiento.values_list(
            'fecha_programada', 'saldo_base_usd', 'monto_recargo_usd'))
        self.assertEqual(reconstruido[:3], esperado)
        self.assertEqual(list(convenio.recargos_incumplimiento.values_list('saldo_base_usd', flat=True)),
                         [Decimal('100.00'), Decimal('100.00'), Decimal('100.00'), Decimal('50.00')])

    def test_detencion_administrativa_liquida_incluyendo_dia_actual(self):
        _, convenio = self.recurrente()
        gestion.incumplir_convenio(convenio, momento=AHORA)
        with patch('django.utils.timezone.now', return_value=AHORA + timedelta(days=3)):
            detener_recargos_convenio(convenio, self.admin, 'Pausa autorizada')
        self.assertEqual(convenio.recargos_incumplimiento.count(), 4)
        self.assertEqual(self.generar(convenio, 10), [])

    def test_renegociacion_liquida_antes_de_reemplazar(self):
        ciclo, convenio = self.recurrente()
        gestion.incumplir_convenio(convenio, momento=AHORA)
        gestion.crear_convenio(
            self.rep, [ciclo], [(HOY + timedelta(days=10), Decimal('50.00'))],
            self.admin, hoy=HOY, momento=AHORA + timedelta(days=3))
        self.assertEqual(convenio.recargos_incumplimiento.count(), 4)
        self.assertEqual(self.generar(convenio, 10), [])
