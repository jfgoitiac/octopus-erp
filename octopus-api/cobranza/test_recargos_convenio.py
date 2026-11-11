from datetime import date, datetime, timedelta
from decimal import Decimal
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from unittest import skipIf

from django.contrib.auth import get_user_model
from django.db import IntegrityError, connection, close_old_connections, transaction
from django.test import TransactionTestCase
from django.utils import timezone

from multisede.models import Sede
from secretaria.models import Alumno, Representante

from . import gestion
from .ciclos import evaluar_ciclos_sede
from .models import (
    CicloCobranza, ConfiguracionCobranzaInteligente, RecargoConvenio,
    ReglaRecargoPago,
)
from .recargos import resolver_recargo
from .recargos_convenio import fecha_programada, generar_recargos_convenio
from .test_gestion_cobranza import GestionBase
from .test_motor_cobranza import AHORA, HOY, TODAS, crear_reglas_por_defecto


def consciente(anio, mes, dia, hora=10):
    return timezone.make_aware(datetime(anio, mes, dia, hora, 0))


class RecargoConvenioBase(GestionBase):
    def crear(self, *, monto='50.00', configuracion=None, momento=AHORA):
        ciclo = self.ciclo(monto=Decimal(monto))
        convenio = gestion.crear_convenio(
            self.rep, [ciclo], [(HOY + timedelta(days=7), Decimal(monto))],
            self.admin, hoy=HOY, momento=momento,
            configuracion=configuracion or {},
        )
        return ciclo, convenio

    def configuracion(self, **cambios):
        datos = {
            'aplicar_recargo_incumplimiento': True,
            'modo_recargo': 'monto_fijo_usd',
            'valor_recargo': '5.00',
            'frecuencia_recargo': 'unico',
            'intervalo_cantidad': 1,
            'intervalo_unidad': 'dia',
        }
        datos.update(cambios)
        return datos


class DevengoRecargoConvenioTest(RecargoConvenioBase):
    def test_unico_fijo_nace_al_incumplir(self):
        _, convenio = self.crear(configuracion=self.configuracion())
        self.assertTrue(gestion.incumplir_convenio(convenio, momento=AHORA))
        recargo = RecargoConvenio.objects.get(convenio=convenio)
        self.assertEqual(recargo.numero_periodo, 1)
        self.assertEqual(recargo.fecha_programada, HOY)
        self.assertEqual(recargo.saldo_base_usd, Decimal('50.00'))
        self.assertEqual(recargo.monto_recargo_usd, Decimal('5.00'))

    def test_porcentaje_usa_solo_saldo_principal(self):
        _, convenio = self.crear(configuracion=self.configuracion(
            modo_recargo='porcentaje', valor_recargo='10.00'))
        gestion.incumplir_convenio(convenio, momento=AHORA)
        recargo = RecargoConvenio.objects.get(convenio=convenio)
        self.assertEqual(recargo.saldo_base_usd, Decimal('50.00'))
        self.assertEqual(recargo.monto_recargo_usd, Decimal('5.00'))

    def test_recurrente_diario_es_idempotente(self):
        _, convenio = self.crear(configuracion=self.configuracion(frecuencia_recargo='recurrente'))
        gestion.incumplir_convenio(convenio, momento=AHORA)
        fecha = HOY + timedelta(days=2)
        generar_recargos_convenio(convenio.id, fecha_referencia=fecha, momento=AHORA + timedelta(days=2))
        generar_recargos_convenio(convenio.id, fecha_referencia=fecha, momento=AHORA + timedelta(days=2))
        self.assertEqual(RecargoConvenio.objects.filter(convenio=convenio).count(), 3)

    def test_recurrente_cada_tres_dias(self):
        _, convenio = self.crear(configuracion=self.configuracion(
            frecuencia_recargo='recurrente', intervalo_cantidad=3))
        gestion.incumplir_convenio(convenio, momento=AHORA)
        generar_recargos_convenio(
            convenio.id, fecha_referencia=HOY + timedelta(days=6),
            momento=AHORA + timedelta(days=6))
        self.assertEqual(
            list(convenio.recargos_incumplimiento.values_list('fecha_programada', flat=True)),
            [HOY, HOY + timedelta(days=3), HOY + timedelta(days=6)],
        )

    def test_porcentaje_refleja_reduccion_del_saldo_sin_interes_compuesto(self):
        ciclo = self.ciclo(monto=Decimal('100.00'))
        convenio = gestion.crear_convenio(
            self.rep, [ciclo], [
                (HOY + timedelta(days=7), Decimal('50.00')),
                (HOY + timedelta(days=14), Decimal('50.00')),
            ], self.admin, hoy=HOY, momento=AHORA,
            configuracion=self.configuracion(
                modo_recargo='porcentaje', valor_recargo='10.00',
                frecuencia_recargo='recurrente', intervalo_cantidad=2),
        )
        gestion.incumplir_convenio(convenio, momento=AHORA)
        primera_cuota = convenio.cuotas.get(numero=1)
        primera_cuota.pagada = True
        primera_cuota.pagada_en = AHORA + timedelta(days=1)
        primera_cuota.save(update_fields=['pagada', 'pagada_en'])

        generar_recargos_convenio(
            convenio.id, fecha_referencia=HOY + timedelta(days=2),
            momento=AHORA + timedelta(days=2))

        recargos = list(convenio.recargos_incumplimiento.order_by('numero_periodo'))
        self.assertEqual([r.saldo_base_usd for r in recargos], [Decimal('100.00'), Decimal('50.00')])
        self.assertEqual([r.monto_recargo_usd for r in recargos], [Decimal('10.00'), Decimal('5.00')])

    def test_sin_saldo_principal_detiene_recurrencia(self):
        _, convenio = self.crear(configuracion=self.configuracion(frecuencia_recargo='recurrente'))
        gestion.incumplir_convenio(convenio, momento=AHORA)
        convenio.cuotas.update(pagada=True, pagada_en=AHORA + timedelta(hours=1))
        generar_recargos_convenio(
            convenio.id, fecha_referencia=HOY + timedelta(days=1),
            momento=AHORA + timedelta(days=1))
        convenio.refresh_from_db()
        self.assertEqual(convenio.motivo_detencion_recargos, 'sin_saldo_principal')
        self.assertEqual(convenio.recargos_incumplimiento.count(), 1)

    def test_maximo_de_aplicaciones_detiene_recurrencia(self):
        _, convenio = self.crear(configuracion=self.configuracion(
            frecuencia_recargo='recurrente', maximo_aplicaciones=2))
        gestion.incumplir_convenio(convenio, momento=AHORA)
        generar_recargos_convenio(
            convenio.id, fecha_referencia=HOY + timedelta(days=5),
            momento=AHORA + timedelta(days=5))
        convenio.refresh_from_db()
        self.assertEqual(convenio.recargos_incumplimiento.count(), 2)
        self.assertEqual(convenio.motivo_detencion_recargos, 'maximo_aplicaciones')

    def test_maximo_y_tope_detienen_recurrencia(self):
        _, convenio = self.crear(configuracion=self.configuracion(
            frecuencia_recargo='recurrente', maximo_aplicaciones=5,
            tope_recargo_usd='12.00'))
        gestion.incumplir_convenio(convenio, momento=AHORA)
        generar_recargos_convenio(
            convenio.id, fecha_referencia=HOY + timedelta(days=10),
            momento=AHORA + timedelta(days=10))
        montos = list(RecargoConvenio.objects.filter(convenio=convenio)
                      .values_list('monto_recargo_usd', flat=True))
        self.assertEqual(montos, [Decimal('5.00'), Decimal('5.00'), Decimal('2.00')])
        convenio.refresh_from_db()
        self.assertEqual(convenio.motivo_detencion_recargos, 'tope_recargo')

    def test_restriccion_impide_periodo_duplicado(self):
        _, convenio = self.crear(configuracion=self.configuracion())
        gestion.incumplir_convenio(convenio, momento=AHORA)
        original = RecargoConvenio.objects.get(convenio=convenio)
        with self.assertRaises(IntegrityError), transaction.atomic():
            RecargoConvenio.objects.create(
                convenio=convenio, numero_periodo=1,
                fecha_programada=HOY, modo_calculo='monto_fijo_usd',
                valor_configurado='5.00', saldo_base_usd='50.00',
                monto_recargo_usd='5.00',
            )
        self.assertEqual(original.numero_periodo, 1)

    def test_cancelacion_manual_no_genera_recargo(self):
        _, convenio = self.crear(configuracion=self.configuracion())
        gestion.cancelar_convenio(convenio, self.admin, momento=AHORA)
        self.assertFalse(RecargoConvenio.objects.filter(convenio=convenio).exists())


class CalendarioRecargoConvenioTest(RecargoConvenioBase):
    def test_semanal_son_siete_dias(self):
        _, convenio = self.crear(configuracion=self.configuracion(
            frecuencia_recargo='recurrente', intervalo_cantidad=2,
            intervalo_unidad='semana'))
        convenio.incumplido_en = AHORA
        self.assertEqual(fecha_programada(convenio, 2), HOY + timedelta(days=14))

    def test_mensual_31_no_desplaza_el_ancla(self):
        _, convenio = self.crear(configuracion=self.configuracion(
            frecuencia_recargo='recurrente', intervalo_unidad='mes'))
        convenio.incumplido_en = consciente(2026, 1, 31)
        self.assertEqual(fecha_programada(convenio, 2), date(2026, 2, 28))
        self.assertEqual(fecha_programada(convenio, 3), date(2026, 3, 31))

    def test_mensual_29_en_bisiesto(self):
        _, convenio = self.crear(configuracion=self.configuracion(
            frecuencia_recargo='recurrente', intervalo_unidad='mes'))
        convenio.incumplido_en = consciente(2024, 1, 29)
        self.assertEqual(fecha_programada(convenio, 2), date(2024, 2, 29))
        self.assertEqual(fecha_programada(convenio, 3), date(2024, 3, 29))

    def test_mensual_30_restaura_el_ancla(self):
        _, convenio = self.crear(configuracion=self.configuracion(
            frecuencia_recargo='recurrente', intervalo_unidad='mes'))
        convenio.incumplido_en = consciente(2026, 1, 30)
        self.assertEqual(fecha_programada(convenio, 2), date(2026, 2, 28))
        self.assertEqual(fecha_programada(convenio, 3), date(2026, 3, 30))


class ExoneracionConvenioTest(RecargoConvenioBase):
    def _regla_normal(self):
        return ReglaRecargoPago.objects.create(
            nombre='Semanal', tipo='recargo', modo_calculo='monto_fijo_usd',
            valor='5.00', ancla_recargo='vencimiento', dias_desde_vencimiento=0,
            frecuencia_recargo='recurrente', cada_dias=7,
            vigente_desde=date(2026, 1, 1), activa=True,
        )

    def test_convenio_sin_exoneracion_conserva_recargo_normal(self):
        self._regla_normal()
        ciclo, _ = self.crear(configuracion={'exonera_recargos_durante_vigencia': False})
        ciclo.mensualidad.fecha_vencimiento = date(2026, 7, 1)
        ciclo.mensualidad.save(update_fields=['fecha_vencimiento'])
        self.assertIsNotNone(resolver_recargo(ciclo.mensualidad, date(2026, 7, 15)))

    def test_solo_mensualidad_vinculada_queda_exonerada(self):
        self._regla_normal()
        ciclo, convenio = self.crear(
            configuracion={'exonera_recargos_durante_vigencia': True},
            momento=consciente(2026, 7, 10))
        mensualidad = ciclo.mensualidad
        mensualidad.fecha_vencimiento = date(2026, 7, 1)
        mensualidad.save(update_fields=['fecha_vencimiento'])
        otra = self.mens(self.alumno('E2', 1), monto=50)
        otra.fecha_vencimiento = date(2026, 7, 1)
        otra.save(update_fields=['fecha_vencimiento'])

        self.assertIsNone(resolver_recargo(mensualidad, date(2026, 7, 15)))
        self.assertIsNotNone(resolver_recargo(otra, date(2026, 7, 15)))

        gestion.cancelar_convenio(convenio, self.admin, momento=consciente(2026, 7, 20))
        resultado = resolver_recargo(mensualidad, date(2026, 7, 22))
        # 1, 8 y 22 son cobrables; el período del 15 quedó suspendido.
        self.assertEqual(resultado['monto_usd'], Decimal('15.00'))
        self.assertEqual(resultado['periodos_exonerados'], 1)

    def test_finalizado_en_se_fija_al_incumplir(self):
        _, convenio = self.crear(configuracion={'exonera_recargos_durante_vigencia': True})
        gestion.incumplir_convenio(convenio, momento=AHORA)
        convenio.refresh_from_db()
        self.assertEqual(convenio.finalizado_en, AHORA)
        self.assertFalse(convenio.intervalos_exoneracion_recargos.filter(finalizado_en__isnull=True).exists())

    def test_incumplimiento_automatico_genera_primer_recargo(self):
        _, convenio = self.crear(configuracion=self.configuracion())
        convenio.cuotas.update(fecha=HOY - timedelta(days=1))
        self.assertEqual(gestion.revisar_convenios(hoy=HOY, momento=AHORA), 1)
        convenio.refresh_from_db()
        self.assertEqual(convenio.estado, convenio.INCUMPLIDO)
        self.assertEqual(convenio.recargos_incumplimiento.count(), 1)

    def test_renegociacion_detiene_recargos_del_convenio_anterior(self):
        ciclo, anterior = self.crear(configuracion=self.configuracion(
            frecuencia_recargo='recurrente'))
        gestion.incumplir_convenio(anterior, momento=AHORA)
        nuevo = gestion.crear_convenio(
            self.rep, [ciclo], [(HOY + timedelta(days=10), Decimal('50.00'))],
            self.admin, hoy=HOY, momento=AHORA + timedelta(days=1),
        )
        anterior.refresh_from_db()
        self.assertEqual(anterior.reemplazado_por, nuevo)
        self.assertEqual(anterior.motivo_detencion_recargos, 'renegociado')


@skipIf(connection.vendor == 'sqlite', 'SQLite no ofrece bloqueo de fila para probar concurrencia real.')
class ConcurrenciaRecargoConvenioTest(TransactionTestCase):
    reset_sequences = True

    def setUp(self):
        self.sede = Sede.objects.create(nombre='Sede concurrencia')
        self.rep = Representante.objects.create(
            cedula='VC1', nombre='Maria', apellido='Perez', telefono='04121234567',
            correo='concurrencia@t.com', direccion='c')
        self.admin = get_user_model().objects.create_superuser('admin-concurrente', 'ac@t.com', 'x')
        crear_reglas_por_defecto(self.sede.id)
        alumno = Alumno.objects.create(
            cedula_escolar='EC1', nombre='Ana', apellido='Concurrente',
            fecha_nacimiento=date(2015, 1, 1), dia_limite_pago=17,
            representante=self.rep, sede=self.sede)
        from .models import Mensualidad
        Mensualidad.objects.create(
            alumno=alumno, mes=7, anio=2026, monto_usd='50.00', monto_pagado='0.00')
        ConfiguracionCobranzaInteligente.objects.create(
            sede=self.sede, activo=True, modo_sombra=False, etapas_envio_activas=TODAS)
        evaluar_ciclos_sede(self.sede.id, HOY)
        ciclo = CicloCobranza.objects.get()
        self.convenio = gestion.crear_convenio(
            self.rep, [ciclo], [(HOY + timedelta(days=7), Decimal('50.00'))],
            self.admin, hoy=HOY, momento=AHORA,
            configuracion={
                'aplicar_recargo_incumplimiento': True,
                'modo_recargo': 'monto_fijo_usd', 'valor_recargo': '5.00',
                'frecuencia_recargo': 'recurrente', 'intervalo_cantidad': 1,
                'intervalo_unidad': 'dia',
            },
        )
        self.convenio.estado = self.convenio.INCUMPLIDO
        self.convenio.incumplido_en = AHORA
        self.convenio.finalizado_en = AHORA
        self.convenio.save(update_fields=['estado', 'incumplido_en', 'finalizado_en'])

    def test_dos_jobs_concurrentes_no_duplican_periodos(self):
        barrera = Barrier(2)

        def ejecutar():
            close_old_connections()
            barrera.wait()
            try:
                return len(generar_recargos_convenio(
                    self.convenio.id, fecha_referencia=HOY + timedelta(days=2),
                    momento=AHORA + timedelta(days=2)))
            finally:
                close_old_connections()

        with ThreadPoolExecutor(max_workers=2) as pool:
            resultados = list(pool.map(lambda _: ejecutar(), range(2)))

        self.assertEqual(sum(resultados), 3)
        self.assertEqual(
            list(RecargoConvenio.objects.filter(convenio=self.convenio)
                 .values_list('numero_periodo', flat=True)),
            [1, 2, 3],
        )
