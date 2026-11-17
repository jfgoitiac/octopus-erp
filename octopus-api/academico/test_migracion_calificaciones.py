"""Idempotencia y rollback del backfill no destructivo de Fase 1."""

from datetime import date
from importlib import import_module

from django.apps import apps
from django.test import TestCase

from secretaria.models import Alumno, Representante

from .models import (
    ConfiguracionCalificacion,
    Lapso,
    Materia,
    Nota,
    ObservacionCalificacion,
    PlanEvaluacion,
)


class MigracionMotorCanonicoTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        representante = Representante.objects.create(
            cedula='V-MIG-CANON', nombre='Representante', apellido='Migración',
            telefono='04141234567', correo='migracion@example.com', direccion='Prueba',
        )
        cls.alumno = Alumno.objects.create(
            representante=representante, cedula_escolar='MIG-CANON',
            nombre='Alumno', apellido='Migración', fecha_nacimiento=date(2015, 1, 1),
            grado_seccion='2do Grado A',
        )
        cls.lapso = Lapso.objects.create(
            nombre='1er Lapso', periodo_escolar='2027-2028',
            fecha_inicio=date(2027, 9, 1), fecha_fin=date(2027, 12, 15),
        )

    def setUp(self):
        self.migracion = import_module(
            'academico.migrations.0019_reconciliar_fuentes_calificacion'
        )

    def materia(self, nombre):
        return Materia.objects.create(nombre=nombre, grado_seccion='2do Grado A')

    def test_backfill_es_idempotente_preserva_datos_y_rollback_es_selectivo(self):
        legacy = self.materia('Legacy Migración')
        solo_plan = self.materia('Plan Migración')
        coexistente = self.materia('Coexistente Migración')
        manual = self.materia('Manual Migración')

        nota_legacy = Nota.objects.create(
            alumno=self.alumno, materia=legacy, lapso=self.lapso,
            evaluacion_1=15, observaciones='Texto legacy preservado',
        )
        PlanEvaluacion.objects.create(materia=solo_plan, lapso=self.lapso)
        nota_coexistente = Nota.objects.create(
            alumno=self.alumno, materia=coexistente, lapso=self.lapso, evaluacion_1=12,
        )
        plan_coexistente = PlanEvaluacion.objects.create(
            materia=coexistente, lapso=self.lapso,
        )
        config_manual = ConfiguracionCalificacion.objects.create(
            materia=manual, lapso=self.lapso, motor='legacy', origen='manual',
        )

        self.migracion.preparar_motor_canonico(apps, None)
        self.migracion.preparar_motor_canonico(apps, None)

        configuraciones = ConfiguracionCalificacion.objects.exclude(pk=config_manual.pk)
        self.assertEqual(configuraciones.count(), 3)
        self.assertEqual(
            ConfiguracionCalificacion.objects.get(materia=legacy, lapso=self.lapso).motor,
            'legacy',
        )
        self.assertEqual(
            ConfiguracionCalificacion.objects.get(materia=solo_plan, lapso=self.lapso).motor,
            'plan',
        )
        self.assertIsNone(
            ConfiguracionCalificacion.objects.get(
                materia=coexistente, lapso=self.lapso,
            ).motor
        )
        observacion = ObservacionCalificacion.objects.get(
            alumno=self.alumno, materia=legacy, lapso=self.lapso,
        )
        self.assertEqual(observacion.texto, 'Texto legacy preservado')

        self.migracion.revertir_datos_generados(apps, None)

        self.assertFalse(
            ConfiguracionCalificacion.objects.filter(origen='migracion_fase1').exists()
        )
        self.assertFalse(
            ObservacionCalificacion.objects.filter(origen='migracion_fase1').exists()
        )
        self.assertTrue(ConfiguracionCalificacion.objects.filter(pk=config_manual.pk).exists())
        self.assertTrue(Nota.objects.filter(pk=nota_legacy.pk).exists())
        self.assertTrue(Nota.objects.filter(pk=nota_coexistente.pk).exists())
        self.assertTrue(PlanEvaluacion.objects.filter(pk=plan_coexistente.pk).exists())

