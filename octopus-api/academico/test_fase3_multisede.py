from datetime import date

from django.core.exceptions import ValidationError
from django.contrib.auth import get_user_model
from django.db import IntegrityError, transaction
from django.test import TestCase
from rest_framework.test import APIClient

from multisede.models import PermisoSede, Sede
from .models import GradoSeccion, Lapso, Materia, PeriodoEscolar


User = get_user_model()


class ContextoAcademicoMultisedeTest(TestCase):
    def setUp(self):
        self.sede_a = Sede.objects.create(nombre='Norte')
        self.sede_b = Sede.objects.create(nombre='Sur')
        self.periodo_a = PeriodoEscolar.objects.create(
            sede=self.sede_a, nombre='2026-2027',
            fecha_inicio=date(2026, 9, 1), fecha_fin=date(2027, 7, 31),
        )
        self.periodo_b = PeriodoEscolar.objects.create(
            sede=self.sede_b, nombre='2026-2027',
            fecha_inicio=date(2026, 9, 1), fecha_fin=date(2027, 7, 31),
        )
        self.grado_a = GradoSeccion.objects.create(
            periodo=self.periodo_a, nombre='1A', codigo='1A',
        )
        self.grado_b = GradoSeccion.objects.create(
            periodo=self.periodo_b, nombre='1A', codigo='1A',
        )

    def test_mismo_periodo_grado_y_materia_en_dos_sedes(self):
        Materia.objects.create(nombre='Matemática', codigo='MAT', grado_seccion='1A', sede=self.sede_a, periodo=self.periodo_a, grado=self.grado_a)
        Materia.objects.create(nombre='Matemática', codigo='MAT', grado_seccion='1A', sede=self.sede_b, periodo=self.periodo_b, grado=self.grado_b)
        self.assertEqual(Materia.objects.filter(nombre='Matemática').count(), 2)

    def test_periodos_de_una_sede_no_se_solapan(self):
        periodo = PeriodoEscolar(
            sede=self.sede_a, nombre='solapado',
            fecha_inicio=date(2027, 1, 1), fecha_fin=date(2027, 12, 1),
        )
        with self.assertRaises(ValidationError):
            periodo.full_clean()

    def test_dual_write_de_materia_deriva_contexto_desde_seccion(self):
        materia = Materia.objects.create(
            nombre='Ciencias', codigo='CIE', grado_seccion='incorrecto',
            grado=self.grado_a,
        )
        self.assertEqual(materia.periodo_id, self.periodo_a.id)
        self.assertEqual(materia.sede_id, self.sede_a.id)
        self.assertEqual(materia.grado_seccion, self.grado_a.nombre)

    def test_lapso_legacy_conserva_unicidad(self):
        datos = dict(
            nombre='1er Lapso', periodo_escolar='2025-2026',
            fecha_inicio=date(2025, 9, 1), fecha_fin=date(2025, 12, 15),
        )
        Lapso.objects.create(**datos)
        with self.assertRaises(IntegrityError), transaction.atomic():
            Lapso.objects.create(**datos)


class AislamientoContextoAcademicoApiTest(ContextoAcademicoMultisedeTest):
    def setUp(self):
        super().setUp()
        self.user = User.objects.create_user(username='director-norte', password='segura')
        self.user.perfil.rol = 'director'
        self.user.perfil.save(update_fields=['rol'])
        PermisoSede.objects.create(
            user=self.user, sede=self.sede_a, rol='director', activo=True,
        )
        self.client = APIClient()
        self.client.force_authenticate(self.user)

    def test_no_crea_materia_con_seccion_de_otra_sede(self):
        response = self.client.post('/api/academico/materias/', {
            'nombre': 'Biología', 'codigo': 'BIO',
            'seccion_id': self.grado_b.id,
        }, format='json')
        self.assertEqual(response.status_code, 404)
        self.assertFalse(Materia.objects.filter(nombre='Biología').exists())

    def test_no_crea_lapso_con_periodo_de_otra_sede(self):
        response = self.client.post('/api/academico/lapsos/', {
            'nombre': '1er Lapso', 'periodo_id': self.periodo_b.id,
            'fecha_inicio': '2026-09-01', 'fecha_fin': '2026-12-15',
        }, format='json')
        self.assertEqual(response.status_code, 404)
        self.assertFalse(Lapso.objects.filter(periodo=self.periodo_b).exists())

    def test_listado_de_secciones_no_expone_otra_sede(self):
        response = self.client.get('/api/academico/secciones/')
        self.assertEqual(response.status_code, 200)
        ids = {item['id'] for item in response.json()}
        self.assertIn(self.grado_a.id, ids)
        self.assertNotIn(self.grado_b.id, ids)
