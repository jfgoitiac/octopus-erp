"""Contrato del motor canónico de calificaciones (Fase 1).

Estas pruebas no ejercen superficies HTTP: fijan primero las reglas de dominio
que deben compartir panel, portal, boletín, rendimiento, alertas y PDF.
"""

from datetime import date
from decimal import Decimal

from django.db import IntegrityError, transaction
from django.core.management import call_command, CommandError
from django.test import TestCase

from common.periodo import periodo_escolar_activo
from secretaria.models import Alumno, Representante

from .calificaciones import (
    calcular_calificacion,
    calcular_calificaciones_seccion,
    resolver_fuente,
    validar_configuracion,
)
from .models import (
    BloqueEvaluacion,
    ConfiguracionCalificacion,
    ItemEvaluacion,
    Lapso,
    Materia,
    Nota,
    NotaItemEvaluacion,
    ObservacionCalificacion,
    PlanEvaluacion,
)


class CalificacionesBase(TestCase):
    def setUp(self):
        representante = Representante.objects.create(
            cedula='V-CANONICO-1', nombre='María', apellido='Pérez',
            telefono='04141234567', correo='canonico@example.com',
            direccion='Dirección de prueba',
        )
        self.alumno = Alumno.objects.create(
            representante=representante,
            cedula_escolar='CANONICO-1', nombre='Ana', apellido='Alumna',
            fecha_nacimiento=date(2015, 3, 10), grado_seccion='1er Grado A',
        )
        self.lapso = Lapso.objects.create(
            nombre='1er Lapso', periodo_escolar='2026-2027',
            fecha_inicio=date(2026, 9, 1), fecha_fin=date(2026, 12, 15),
            activo=True,
        )

    def materia(self, nombre='Matemática', tipo='numerica'):
        return Materia.objects.create(
            nombre=nombre, grado_seccion='1er Grado A', tipo_evaluacion=tipo,
        )

    def configurar(self, materia, motor, esperadas=4):
        return ConfiguracionCalificacion.objects.create(
            materia=materia, lapso=self.lapso, motor=motor,
            evaluaciones_esperadas=esperadas,
        )

    def plan_numerico(self, materia, modo='puntos', peso=Decimal('20')):
        plan = PlanEvaluacion.objects.create(materia=materia, lapso=self.lapso)
        bloque = BloqueEvaluacion.objects.create(
            plan=plan, nombre='Contenido', modo=modo, total_puntos=peso,
        )
        item_1 = ItemEvaluacion.objects.create(
            bloque=bloque, nombre='Evaluación 1', valor_maximo=Decimal('10'), orden=1,
        )
        item_2 = ItemEvaluacion.objects.create(
            bloque=bloque, nombre='Evaluación 2', valor_maximo=Decimal('10'), orden=2,
        )
        return plan, bloque, item_1, item_2


class CalificacionLegacyTests(CalificacionesBase):
    def test_legacy_parcial_es_provisional_no_definitiva(self):
        materia = self.materia()
        self.configurar(materia, 'legacy')
        Nota.objects.create(
            alumno=self.alumno, materia=materia, lapso=self.lapso,
            evaluacion_1=Decimal('12'), observaciones='Debe reforzar lectura.',
        )

        resultado = calcular_calificacion(self.alumno, materia, self.lapso)

        self.assertEqual(resultado['fuente'], 'legacy')
        self.assertEqual(resultado['estado'], 'en_progreso')
        self.assertEqual(resultado['progreso'], {
            'evaluados': 1, 'esperados': 4, 'porcentaje': 25.0,
        })
        self.assertEqual(resultado['valor_provisional'], Decimal('12.00'))
        self.assertIsNone(resultado['definitiva'])
        self.assertIsNone(resultado['aprobado'])

    def test_legacy_completo_solo_es_definitivo_con_lapso_cerrado(self):
        materia = self.materia()
        self.configurar(materia, 'legacy')
        Nota.objects.create(
            alumno=self.alumno, materia=materia, lapso=self.lapso,
            evaluacion_1=10, evaluacion_2=12, evaluacion_3=14, evaluacion_4=16,
        )

        abierto = calcular_calificacion(self.alumno, materia, self.lapso)
        self.assertEqual(abierto['estado'], 'completo')
        self.assertEqual(abierto['valor_provisional'], Decimal('13.00'))
        self.assertIsNone(abierto['definitiva'])

        self.lapso.activo = False
        self.lapso.save(update_fields=['activo'])
        cerrado = calcular_calificacion(self.alumno, materia, self.lapso)
        self.assertEqual(cerrado['estado'], 'cerrado')
        self.assertEqual(cerrado['definitiva'], Decimal('13.00'))
        self.assertTrue(cerrado['aprobado'])


class CalificacionPlanNumericoTests(CalificacionesBase):
    def test_periodo_activo_reconoce_instalacion_solo_plan(self):
        materia = self.materia()
        self.configurar(materia, 'plan')
        PlanEvaluacion.objects.create(materia=materia, lapso=self.lapso)

        self.assertEqual(periodo_escolar_activo(), '2026-2027')

    def test_plan_vacio_no_desplaza_legacy_sin_activacion_explicita(self):
        materia = self.materia()
        PlanEvaluacion.objects.create(materia=materia, lapso=self.lapso)
        Nota.objects.create(
            alumno=self.alumno, materia=materia, lapso=self.lapso, evaluacion_1=15,
        )

        resultado = calcular_calificacion(self.alumno, materia, self.lapso)

        self.assertIsNone(resolver_fuente(materia, self.lapso))
        self.assertIsNone(resultado['fuente'])
        self.assertEqual(resultado['estado'], 'sin_configuracion')
        self.assertIn('fuente_sin_resolver', resultado['inconsistencias'])

    def test_plan_parcial_no_publica_cero_ni_definitiva(self):
        materia = self.materia()
        self.configurar(materia, 'plan')
        _, _, item_1, _ = self.plan_numerico(materia)
        NotaItemEvaluacion.objects.create(
            item=item_1, alumno=self.alumno, valor_numerico=Decimal('8'),
        )

        resultado = calcular_calificacion(self.alumno, materia, self.lapso)

        self.assertEqual(resultado['estado'], 'en_progreso')
        self.assertEqual(resultado['progreso']['porcentaje'], 50.0)
        self.assertEqual(resultado['valor_provisional'], Decimal('8.00'))
        self.assertIsNone(resultado['definitiva'])
        self.assertIsNone(resultado['aprobado'])

    def test_bloque_promedio_normaliza_por_maximo_del_item(self):
        materia = self.materia()
        self.configurar(materia, 'plan')
        _, bloque, item_1, item_2 = self.plan_numerico(materia, modo='promedio')
        bloque.total_puntos = 20
        bloque.save(update_fields=['total_puntos'])
        NotaItemEvaluacion.objects.create(item=item_1, alumno=self.alumno, valor_numerico=8)
        NotaItemEvaluacion.objects.create(item=item_2, alumno=self.alumno, valor_numerico=10)

        resultado = calcular_calificacion(self.alumno, materia, self.lapso)

        self.assertEqual(resultado['valor_provisional'], Decimal('18.00'))

    def test_plan_completo_respeta_escala_20_y_cierre(self):
        materia = self.materia()
        self.configurar(materia, 'plan')
        _, _, item_1, item_2 = self.plan_numerico(materia)
        NotaItemEvaluacion.objects.create(item=item_1, alumno=self.alumno, valor_numerico=8)
        NotaItemEvaluacion.objects.create(item=item_2, alumno=self.alumno, valor_numerico=10)

        abierto = calcular_calificacion(self.alumno, materia, self.lapso)
        self.assertEqual(abierto['estado'], 'completo')
        self.assertEqual(abierto['valor_provisional'], Decimal('18.00'))
        self.assertIsNone(abierto['definitiva'])

        self.lapso.activo = False
        self.lapso.save(update_fields=['activo'])
        cerrado = calcular_calificacion(self.alumno, materia, self.lapso)
        self.assertEqual(cerrado['definitiva'], Decimal('18.00'))
        self.assertTrue(cerrado['aprobado'])

    def test_configuracion_detecta_presupuesto_superior_a_20(self):
        materia = self.materia()
        self.configurar(materia, 'plan')
        plan = PlanEvaluacion.objects.create(materia=materia, lapso=self.lapso)
        bloque = BloqueEvaluacion.objects.create(
            plan=plan, nombre='Exceso', modo='puntos', total_puntos=21,
        )
        ItemEvaluacion.objects.create(bloque=bloque, nombre='Exceso', valor_maximo=21)

        self.assertIn('presupuesto_supera_20', validar_configuracion(materia, self.lapso))


class CalificacionLiteralTests(CalificacionesBase):
    def test_empate_literal_elige_resultado_conservador_y_aprueba_a_b(self):
        materia = self.materia('Arte', 'literal')
        self.configurar(materia, 'plan')
        plan = PlanEvaluacion.objects.create(materia=materia, lapso=self.lapso)
        bloque = BloqueEvaluacion.objects.create(plan=plan, nombre='Rasgos', modo='promedio')
        item_a = ItemEvaluacion.objects.create(bloque=bloque, nombre='Creatividad', orden=1)
        item_b = ItemEvaluacion.objects.create(bloque=bloque, nombre='Técnica', orden=2)
        NotaItemEvaluacion.objects.create(item=item_a, alumno=self.alumno, valor_letra='A')
        NotaItemEvaluacion.objects.create(item=item_b, alumno=self.alumno, valor_letra='B')

        abierto = calcular_calificacion(self.alumno, materia, self.lapso)
        self.assertEqual(abierto['valor_literal_provisional'], 'B')
        self.assertIsNone(abierto['aprobado'])

        self.lapso.activo = False
        self.lapso.save(update_fields=['activo'])
        cerrado = calcular_calificacion(self.alumno, materia, self.lapso)
        self.assertEqual(cerrado['definitiva_literal'], 'B')
        self.assertTrue(cerrado['aprobado'])


class AutoridadYConsistenciaTests(CalificacionesBase):
    def test_coexistencia_respeta_fuente_explicita(self):
        materia = self.materia()
        self.configurar(materia, 'legacy')
        Nota.objects.create(
            alumno=self.alumno, materia=materia, lapso=self.lapso,
            evaluacion_1=11, evaluacion_2=11, evaluacion_3=11, evaluacion_4=11,
        )
        _, _, item_1, _ = self.plan_numerico(materia)
        NotaItemEvaluacion.objects.create(item=item_1, alumno=self.alumno, valor_numerico=19)

        resultado = calcular_calificacion(self.alumno, materia, self.lapso)

        self.assertEqual(resultado['fuente'], 'legacy')
        self.assertEqual(resultado['valor_provisional'], Decimal('11.00'))
        self.assertIn('coexistencia_legacy_plan', resultado['inconsistencias'])

    def test_observacion_canonica_preserva_texto_legacy(self):
        materia = self.materia()
        observacion = ObservacionCalificacion.objects.create(
            alumno=self.alumno, materia=materia, lapso=self.lapso,
            texto='Observación que no debe perderse.', origen='legacy',
        )
        self.assertEqual(
            ObservacionCalificacion.objects.get(pk=observacion.pk).texto,
            'Observación que no debe perderse.',
        )

    def test_plan_sombra_no_aporta_a_otra_materia(self):
        destino = self.materia('Matemática')
        aportante = self.materia('EREC')
        aportante.aporta_a_todas_las_materias = True
        aportante.save(update_fields=['aporta_a_todas_las_materias'])
        self.configurar(destino, 'plan')
        self.configurar(aportante, 'legacy')
        _, _, item_destino, _ = self.plan_numerico(destino)
        _, _, item_aporte, _ = self.plan_numerico(aportante)
        NotaItemEvaluacion.objects.create(item=item_destino, alumno=self.alumno, valor_numerico=8)
        NotaItemEvaluacion.objects.create(item=item_aporte, alumno=self.alumno, valor_numerico=10)

        resultado = calcular_calificacion(self.alumno, destino, self.lapso)

        self.assertEqual(resultado['valor_provisional'], Decimal('8.00'))
        self.assertEqual(resultado['aportes_externos'], [])

    def test_comando_reconcilia_coexistencia_de_forma_explicita(self):
        materia = self.materia()
        config = self.configurar(materia, None)
        Nota.objects.create(alumno=self.alumno, materia=materia, lapso=self.lapso, evaluacion_1=12)
        self.plan_numerico(materia)

        call_command(
            'reconciliar_calificaciones', materia=materia.id, lapso=self.lapso.id, motor='legacy',
        )

        config.refresh_from_db()
        self.assertEqual(config.motor, 'legacy')
        self.assertEqual(config.origen, 'reconciliacion_manual')

    def test_comando_no_activa_plan_invalido(self):
        materia = self.materia()
        config = self.configurar(materia, None)
        plan = PlanEvaluacion.objects.create(materia=materia, lapso=self.lapso)
        bloque = BloqueEvaluacion.objects.create(
            plan=plan, nombre='Promedio inválido', modo='promedio', total_puntos=20,
        )
        ItemEvaluacion.objects.create(bloque=bloque, nombre='Sin máximo')

        with self.assertRaises(CommandError):
            call_command(
                'reconciliar_calificaciones', materia=materia.id,
                lapso=self.lapso.id, motor='plan',
            )

        config.refresh_from_db()
        self.assertIsNone(config.motor)

    def test_seccion_y_resultado_individual_comparten_contrato(self):
        materia = self.materia()
        self.configurar(materia, 'legacy')
        Nota.objects.create(
            alumno=self.alumno, materia=materia, lapso=self.lapso,
            evaluacion_1=10, evaluacion_2=12, evaluacion_3=14, evaluacion_4=16,
        )
        individual = calcular_calificacion(self.alumno, materia, self.lapso)
        fila = calcular_calificaciones_seccion(materia, self.lapso)[0]

        for campo in (
            'fuente', 'tipo', 'estado', 'progreso', 'valor_provisional',
            'definitiva', 'aprobado', 'inconsistencias',
        ):
            self.assertEqual(fila[campo], individual[campo])

    def test_nota_item_rechaza_dos_fuentes_simultaneas(self):
        materia = self.materia()
        self.configurar(materia, 'plan')
        _, _, item_1, _ = self.plan_numerico(materia)
        with self.assertRaises(IntegrityError), transaction.atomic():
            NotaItemEvaluacion.objects.create(
                item=item_1, alumno=self.alumno,
                valor_numerico=10, valor_letra='A',
            )

