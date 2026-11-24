from datetime import date
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from multisede.models import PermisoSede, Sede

from .models import ConfiguracionCalificacion, Lapso, Materia, PeriodoEscolar
from .services import construir_checklist_cierre, construir_snapshot_cierre


class CierreNormalizadoPorPeriodoTests(TestCase):
    def setUp(self):
        sede_a = Sede.objects.create(nombre='Sede cierre período A')
        sede_b = Sede.objects.create(nombre='Sede cierre período B')
        self.periodo_a = PeriodoEscolar.objects.create(
            sede=sede_a,
            nombre='2031-2032',
            fecha_inicio=date(2031, 9, 1),
            fecha_fin=date(2032, 7, 31),
        )
        self.periodo_b = PeriodoEscolar.objects.create(
            sede=sede_b,
            nombre='2031-2032',
            fecha_inicio=date(2031, 9, 1),
            fecha_fin=date(2032, 7, 31),
        )
        self.lapso_a = Lapso.objects.create(
            nombre='1er Lapso',
            periodo_escolar='2031-2032',
            periodo=self.periodo_a,
            fecha_inicio=date(2031, 9, 1),
            fecha_fin=date(2031, 12, 15),
        )
        self.materia_a = Materia.objects.create(
            nombre='Historia A',
            grado_seccion='7mo A',
            sede=sede_a,
            periodo=self.periodo_a,
        )
        self.materia_b = Materia.objects.create(
            nombre='Historia B',
            grado_seccion='7mo B',
            sede=sede_b,
            periodo=self.periodo_b,
        )
        ConfiguracionCalificacion.objects.create(
            materia=self.materia_a,
            lapso=self.lapso_a,
            motor='legacy',
        )

    @patch('academico.services.calcular_calificaciones_seccion', return_value=[])
    def test_checklist_solo_evalua_materias_del_periodo_del_lapso(self, calcular):
        checklist = construir_checklist_cierre(self.lapso_a)

        self.assertEqual(checklist['resumen']['materias_total'], 1)
        self.assertEqual([llamada.args[0].id for llamada in calcular.call_args_list], [self.materia_a.id])
        self.assertNotIn(self.materia_b.id, {
            fila['materia_id'] for fila in checklist['materias_sin_plan']
        })

    @patch('academico.services.calcular_calificaciones_seccion', return_value=[])
    def test_snapshot_excluye_materias_y_sedes_de_otro_periodo(self, calcular):
        snapshot = construir_snapshot_cierre(self.lapso_a)

        self.assertEqual([fila['materia_id'] for fila in snapshot['materias']], [self.materia_a.id])
        self.assertEqual(snapshot['sedes_derivadas'], [self.periodo_a.sede_id])
        self.assertEqual([llamada.args[0].id for llamada in calcular.call_args_list], [self.materia_a.id])

    @patch('academico.services.calcular_calificaciones_seccion', return_value=[])
    def test_director_solo_necesita_permiso_de_la_sede_del_periodo(self, _calcular):
        user = get_user_model().objects.create_user(
            username='director_cierre_periodo', password='clave-segura-123',
        )
        user.perfil.rol = 'director'
        user.perfil.save(update_fields=['rol'])
        PermisoSede.objects.create(
            user=user, sede=self.periodo_a.sede, rol='director', activo=True,
        )
        client = APIClient()
        client.force_authenticate(user=user)

        response = client.get(f'/api/academico/lapsos/{self.lapso_a.id}/checklist-cierre/')

        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.json()['resumen']['materias_total'], 1)
