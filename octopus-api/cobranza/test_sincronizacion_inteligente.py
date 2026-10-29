"""
Causas raíz de "la deuda no se sincroniza / los mensajes no cuadran" en
Cobranza Inteligente:
  - Sin Celery Beat los ciclos no se creaban ni cambiaban de etapa.
  - El dashboard no avisaba que los recordatorios automáticos no salían.
  - El monto del mensaje incluía inscripción/recargo sin detallarlos.
  - Mora y ciclos usaban vencimientos distintos.
`hoy` se fija siempre.
"""
from datetime import date, timedelta
from decimal import Decimal

from django.core.cache import cache
from django.test import TestCase
from django.utils import timezone

from multisede.models import Sede
from notificaciones.cobro_whatsapp import agrupar_morosos_por_representante, renderizar_mensaje_cobro
from notificaciones.models import PlantillaWhatsApp
from secretaria.models import Alumno, Representante

from .ciclos import poner_al_dia_si_hace_falta
from .dashboard import estado_motor
from .models import CicloCobranza, ConfiguracionCobranzaInteligente, CuotaInscripcion, Mensualidad
from .mora import annotate_mora_detalle, q_mensualidad_vencida

HOY = date(2026, 10, 28)


class Base(TestCase):
    def setUp(self):
        cache.clear()
        self.sede = Sede.objects.create(nombre='Sede Norte')
        self.rep = Representante.objects.create(
            cedula='V1', nombre='Laura', apellido='Padilla', telefono='04121234567',
            correo='l@t.com', direccion='c')
        self.alumno = Alumno.objects.create(
            cedula_escolar='E1', nombre='Rodrigo', apellido='Arias',
            fecha_nacimiento=date(2015, 1, 1), dia_limite_pago=20,
            representante=self.rep, sede=self.sede)

    def mens(self, mes, anio=2026, monto=30, **kw):
        return Mensualidad.objects.create(alumno=self.alumno, mes=mes, anio=anio, monto_usd=monto, **kw)


class PuestaAlDiaSinBeatTest(Base):
    def test_crea_ciclos_y_calcula_etapa_aunque_beat_no_corra(self):
        m = self.mens(10)  # módulo apagado: la señal no crea ciclo
        ConfiguracionCobranzaInteligente.objects.update_or_create(sede=self.sede, defaults={'activo': True})
        self.assertFalse(CicloCobranza.objects.filter(mensualidad=m).exists())

        poner_al_dia_si_hace_falta({self.sede.id}, HOY)

        ciclo = CicloCobranza.objects.get(mensualidad=m)
        self.assertEqual(ciclo.estado, CicloCobranza.SEGUIMIENTO)  # venció el 20/oct, 8 días

    def test_solo_evalua_una_vez_por_dia(self):
        ConfiguracionCobranzaInteligente.objects.update_or_create(sede=self.sede, defaults={'activo': True})
        poner_al_dia_si_hace_falta({self.sede.id}, HOY)
        m = Mensualidad.objects.bulk_create([Mensualidad(alumno=self.alumno, mes=9, anio=2026, monto_usd=30)])[0]
        poner_al_dia_si_hace_falta({self.sede.id}, HOY)
        self.assertFalse(CicloCobranza.objects.filter(mensualidad=m).exists())
        poner_al_dia_si_hace_falta({self.sede.id}, HOY + timedelta(days=1))
        self.assertTrue(CicloCobranza.objects.filter(mensualidad=m).exists())


class EstadoMotorTest(TestCase):
    def test_sin_beat_registrado_el_motor_esta_detenido(self):
        self.assertEqual(estado_motor(), {'activo': False, 'ultima_ejecucion': None})

    def test_beat_reciente_activo_y_viejo_detenido(self):
        from django_celery_beat.models import CrontabSchedule, PeriodicTask
        crontab = CrontabSchedule.objects.create(minute='5', hour='8-18')
        tarea = PeriodicTask.objects.create(
            name='procesar-envios-cobranza-inteligente', crontab=crontab,
            task='cobranza.tasks.procesar_envios_cobranza_inteligente',
            last_run_at=timezone.now() - timedelta(hours=1))
        self.assertTrue(estado_motor()['activo'])
        tarea.last_run_at = timezone.now() - timedelta(days=3)
        tarea.save()
        self.assertFalse(estado_motor()['activo'])


class MensajeCuadraTest(Base):
    def setUp(self):
        super().setUp()
        self.plantilla = PlantillaWhatsApp.objects.create(
            nombre='Corta', tipo='recordatorio',
            cuerpo='Hola {{representante.nombre}}, debe {{monto}} por {{meses}} mes(es).')

    def grupo(self):
        qs = annotate_mora_detalle(Alumno.objects.filter(pk=self.alumno.pk), HOY).select_related('representante')
        return agrupar_morosos_por_representante(qs, HOY)[0]

    def test_total_es_la_suma_de_los_renglones_y_se_detalla(self):
        self.mens(9)
        self.mens(10)
        self.mens(11)  # aún no vence: no se cobra
        CuotaInscripcion.objects.create(alumno=self.alumno, periodo_escolar='2026-2027', monto_usd=20)

        g = self.grupo()
        self.assertEqual(g['meses_total'], 2)
        self.assertEqual(g['monto_total'], Decimal('80.00'))
        self.assertEqual(g['monto_total'], g['subtotal_principal'] + g['subtotal_recargos'] + g['subtotal_otros'])

        mensaje = renderizar_mensaje_cobro(g, self.plantilla)
        self.assertIn('*Detalle:*', mensaje)
        self.assertIn('Septiembre 2026', mensaje)
        self.assertIn('Octubre 2026', mensaje)
        self.assertNotIn('Noviembre 2026', mensaje)
        self.assertIn('Inscripción 2026-2027', mensaje)

    def test_plantilla_con_detalle_no_lo_duplica(self):
        self.mens(9)
        self.plantilla.cuerpo = 'Debe:\n{{mensualidades.detalle}}\nTotal {{total.final}}'
        mensaje = renderizar_mensaje_cobro(self.grupo(), self.plantilla)
        self.assertEqual(mensaje.count('Septiembre 2026'), 1)
        self.assertNotIn('*Detalle:*', mensaje)


class VencimientoUnicoTest(Base):
    def test_respeta_la_fecha_congelada_en_la_cuota(self):
        # El alumno cambió su día límite a 20, pero la cuota se generó con vencimiento el 30.
        m = self.mens(10, fecha_vencimiento=date(2026, 10, 30))
        self.assertFalse(Mensualidad.objects.filter(q_mensualidad_vencida(HOY), pk=m.pk).exists())
        self.assertTrue(Mensualidad.objects.filter(q_mensualidad_vencida(date(2026, 10, 30)), pk=m.pk).exists())

    def test_sin_fecha_usa_el_dia_limite_del_alumno(self):
        m = self.mens(10)
        self.assertFalse(Mensualidad.objects.filter(q_mensualidad_vencida(date(2026, 10, 19)), pk=m.pk).exists())
        self.assertTrue(Mensualidad.objects.filter(q_mensualidad_vencida(date(2026, 10, 20)), pk=m.pk).exists())
