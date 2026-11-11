from datetime import date
from decimal import Decimal

from multisede.models import Sede
from . import gestion
from .models import CicloCobranza, ReglaRecargoPago
from .test_recargos_convenio import RecargoConvenioBase
from .test_motor_cobranza import AHORA, HOY


class BandejaPenalidadesConvenioTest(RecargoConvenioBase):
    def preparar(self):
        primero, convenio = self.crear(configuracion=self.configuracion())
        segundo = self.ciclo(cedula='E2')
        convenio.ciclos.add(segundo)
        gestion.incumplir_convenio(convenio, momento=AHORA)
        primero.refresh_from_db()
        segundo.refresh_from_db()
        return primero, segundo, convenio

    def bandeja(self, qs=None):
        return gestion.calcular_bandeja(qs if qs is not None else CicloCobranza.objects.all(), HOY, AHORA)

    def test_hermanos_suman_una_penalidad_y_separan_principal(self):
        primero, segundo, convenio = self.preparar()
        fila, = self.bandeja()
        self.assertEqual(fila['saldo_total_usd'], '105.00')
        self.assertEqual(fila['saldo_principal_usd'], '100.00')
        self.assertEqual(fila['total_penalidades_convenio_usd'], '5.00')
        self.assertEqual(len(fila['penalidades_convenio']), 1)
        self.assertEqual(set(fila['ciclos']), {primero.pk, segundo.pk})
        self.assertEqual(fila['penalidades_convenio'][0]['convenio_id'], convenio.pk)

    def test_solo_penalidad_se_conserva_tras_pagar_principal_y_cerrar_ciclos(self):
        primero, segundo, _ = self.preparar()
        for ciclo in (primero, segundo):
            m = ciclo.mensualidad
            m.monto_pagado = m.monto_usd
            m.save()
            ciclo.estado = CicloCobranza.CERRADA
            ciclo.save(update_fields=['estado'])
        fila, = self.bandeja()
        self.assertEqual(fila['saldo_total_usd'], '5.00')
        self.assertEqual(fila['saldo_principal_usd'], '0.00')
        self.assertEqual(fila['ciclos'], [])
        self.assertEqual(fila['estados'], [])
        self.assertFalse(fila['gestion_humana'])
        self.assertEqual(fila['accion_sugerida'],
                         {'codigo': 'ver_convenios', 'texto': 'Revisar penalidades del convenio'})

    def test_scope_de_sede_no_duplica_penalidad_en_otro_hermano(self):
        primero, segundo, _ = self.preparar()
        otra = Sede.objects.create(nombre='Sede Sur')
        alumno = segundo.mensualidad.alumno
        alumno.sede = otra
        alumno.save(update_fields=['sede'])
        norte, = self.bandeja(CicloCobranza.objects.filter(mensualidad__alumno__sede=self.sede))
        sur, = self.bandeja(CicloCobranza.objects.filter(mensualidad__alumno__sede=otra))
        self.assertEqual(norte['total_penalidades_convenio_usd'], '5.00')
        self.assertEqual(sur['total_penalidades_convenio_usd'], '0.00')
        self.assertEqual(sur['penalidades_convenio'], [])
        self.assertEqual(norte['saldo_total_usd'], '55.00')
        self.assertEqual(sur['saldo_total_usd'], '50.00')

    def test_reclamo_excluye_principal_pero_no_penalidad(self):
        primero, segundo, _ = self.preparar()
        gestion.pausar_ciclo(primero, 'reclamo', self.admin)
        fila, = self.bandeja()
        self.assertEqual(fila['saldo_principal_usd'], '50.00')
        self.assertEqual(fila['saldo_total_usd'], '55.00')
        self.assertEqual(fila['ciclos'], [segundo.pk])

    def test_recargos_normales_se_suman_sin_alterar_principal(self):
        primero, segundo, _ = self.preparar()
        ReglaRecargoPago.objects.create(
            nombre='Normal', tipo='recargo', modo_calculo='monto_fijo_usd',
            valor=Decimal('3.00'), dia_aplicacion=5,
            vigente_desde=date(2026, 1, 1), activa=True)
        fila, = self.bandeja()
        self.assertEqual(fila['saldo_principal_usd'], '100.00')
        self.assertEqual(fila['total_recargos_normales_usd'], '6.00')
        self.assertEqual(fila['total_penalidades_convenio_usd'], '5.00')
        self.assertEqual(fila['saldo_total_usd'], '111.00')
