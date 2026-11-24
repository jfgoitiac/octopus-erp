"""Contratos de autorización e aislamiento por sede del módulo académico.

Estas pruebas son deliberadamente negativas: un identificador válido no debe
convertirse en acceso válido cuando el rol, la sede o la asignación académica
no corresponden al usuario autenticado.
"""
from datetime import date

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from multisede.models import PermisoSede, Sede
from secretaria.models import Alumno, Representante

from .models import Asistencia, Docente, Lapso, Materia, PeriodoEscolar, PlanEvaluacion


User = get_user_model()


def crear_usuario(username, rol):
    user = User.objects.create_user(username=username, password='clave-segura-123')
    user.perfil.rol = rol
    user.perfil.save(update_fields=['rol'])
    return user


def crear_alumno(cedula, sede, grado='1er Grado A'):
    representante = Representante.objects.create(
        cedula=f'V{cedula}',
        nombre='Representante',
        apellido=cedula,
        telefono='04141234567',
        correo=f'{cedula}@example.com',
        direccion='Dirección de prueba',
    )
    return Alumno.objects.create(
        representante=representante,
        cedula_escolar=cedula,
        nombre='Alumno',
        apellido=cedula,
        fecha_nacimiento=date(2015, 3, 10),
        grado_seccion=grado,
        sede=sede,
    )


class SeguridadAcademicaBase(TestCase):
    GRADO = '1er Grado A'

    def setUp(self):
        self.sede_a = Sede.objects.create(nombre='Sede Académica A')
        self.sede_b = Sede.objects.create(nombre='Sede Académica B')
        self.lapso = Lapso.objects.create(
            nombre='1er Lapso',
            periodo_escolar='2026-2027',
            fecha_inicio=date(2026, 9, 1),
            fecha_fin=date(2026, 12, 15),
        )
        self.alumno_a = crear_alumno('EA000001', self.sede_a, self.GRADO)
        self.alumno_b = crear_alumno('EB000001', self.sede_b, self.GRADO)
        self.materia_a = Materia.objects.create(
            nombre='Matemática A', grado_seccion=self.GRADO, sede=self.sede_a,
        )
        self.materia_b = Materia.objects.create(
            nombre='Matemática B', grado_seccion=self.GRADO, sede=self.sede_b,
        )
        self.client = APIClient()

    def autenticar(self, user):
        self.client.force_authenticate(user=user)

    def conceder(self, user, sede, rol=None):
        return PermisoSede.objects.create(
            user=user,
            sede=sede,
            rol=rol or user.perfil.rol,
            activo=True,
        )


class RolesNoAcademicosTests(SeguridadAcademicaBase):
    """Cajero y cobranza no adquieren datos académicos por estar autenticados."""

    def test_cajero_y_cobranza_reciben_403_en_superficies_academicas(self):
        casos = (
            ('/api/academico/materias/', {}),
            ('/api/academico/docentes/', {}),
            ('/api/academico/lapsos/', {}),
            ('/api/academico/notas/', {
                'materia_id': self.materia_a.id, 'lapso_id': self.lapso.id,
            }),
            ('/api/academico/asistencia/', {
                'grado_seccion': self.GRADO, 'fecha': '2026-10-01',
            }),
            ('/api/academico/asistencia/resumen/', {
                'alumno_id': self.alumno_a.id, 'mes': 10, 'anio': 2026,
            }),
            ('/api/academico/boletin/', {
                'alumno_id': self.alumno_a.id, 'lapso_id': self.lapso.id,
            }),
            ('/api/academico/horarios/', {'grado_seccion': self.GRADO}),
            ('/api/academico/paquetes-horario/', {}),
        )
        for rol in ('cajero', 'cobranza'):
            user = crear_usuario(f'{rol}_academico', rol)
            self.conceder(user, self.sede_a, rol)
            self.autenticar(user)
            for url, params in casos:
                with self.subTest(rol=rol, url=url):
                    response = self.client.get(url, params)
                    self.assertEqual(response.status_code, 403, response.content)


class AislamientoStaffPorSedeTests(SeguridadAcademicaBase):
    def setUp(self):
        super().setUp()
        self.director = crear_usuario('director_sede_a', 'director')
        self.conceder(self.director, self.sede_a, 'director')
        self.autenticar(self.director)

    def test_listados_solo_exponen_la_sede_autorizada(self):
        response = self.client.get('/api/academico/materias/')
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual({item['id'] for item in response.json()}, {self.materia_a.id})

    def test_filtro_de_sede_del_cliente_no_amplia_el_scope(self):
        response = self.client.get('/api/academico/materias/', {'sede': self.sede_b.id})
        self.assertEqual(response.status_code, 200, response.content)
        self.assertNotIn(self.materia_b.id, {item['id'] for item in response.json()})

    def test_id_de_materia_ajena_es_invisible_para_lectura_y_escritura(self):
        url = f'/api/academico/materias/{self.materia_b.id}/'
        self.assertEqual(self.client.get(url).status_code, 404)
        response = self.client.put(url, {'nombre': 'No debe cambiar'}, format='json')
        self.assertEqual(response.status_code, 404, response.content)
        self.materia_b.refresh_from_db()
        self.assertEqual(self.materia_b.nombre, 'Matemática B')

    def test_idor_de_resumen_y_boletin_no_cruza_sedes(self):
        resumen = self.client.get('/api/academico/asistencia/resumen/', {
            'alumno_id': self.alumno_b.id, 'mes': 10, 'anio': 2026,
        })
        boletin = self.client.get('/api/academico/boletin/', {
            'alumno_id': self.alumno_b.id, 'lapso_id': self.lapso.id,
        })
        self.assertEqual(resumen.status_code, 404, resumen.content)
        self.assertEqual(boletin.status_code, 404, boletin.content)

    def test_acceso_legitimo_de_director_a_su_sede(self):
        resumen = self.client.get('/api/academico/asistencia/resumen/', {
            'alumno_id': self.alumno_a.id, 'mes': 10, 'anio': 2026,
        })
        boletin = self.client.get('/api/academico/boletin/', {
            'alumno_id': self.alumno_a.id, 'lapso_id': self.lapso.id,
        })
        self.assertEqual(resumen.status_code, 200, resumen.content)
        self.assertEqual(boletin.status_code, 200, boletin.content)

    def test_secretaria_y_coordinador_conservan_acceso_legitimo(self):
        for rol in ('secretaria', 'coordinador'):
            user = crear_usuario(f'{rol}_sede_a', rol)
            self.conceder(user, self.sede_a, rol)
            self.autenticar(user)
            with self.subTest(rol=rol):
                response = self.client.get('/api/academico/asistencia/', {
                    'grado_seccion': self.GRADO,
                    'fecha': '2026-10-01',
                })
                self.assertEqual(response.status_code, 200, response.content)
                self.assertEqual(
                    {fila['alumno_id'] for fila in response.json()},
                    {self.alumno_a.id},
                )

    def test_lapso_de_otra_sede_no_se_puede_combinar_con_materia_o_alumno(self):
        periodo_a = PeriodoEscolar.objects.create(
            nombre='2026-2027 A', sede=self.sede_a,
            fecha_inicio=date(2026, 9, 1), fecha_fin=date(2027, 7, 31),
        )
        periodo_b = PeriodoEscolar.objects.create(
            nombre='2026-2027 B', sede=self.sede_b,
            fecha_inicio=date(2026, 9, 1), fecha_fin=date(2027, 7, 31),
        )
        self.materia_a.periodo = periodo_a
        self.materia_a.save(update_fields=['periodo'])
        lapso_b = Lapso.objects.create(
            nombre='Lapso B', periodo_escolar='2026-2027', periodo=periodo_b,
            fecha_inicio=date(2026, 9, 1), fecha_fin=date(2026, 12, 15),
        )

        casos = (
            ('/api/academico/notas/', {
                'materia_id': self.materia_a.id, 'lapso_id': lapso_b.id,
            }),
            ('/api/academico/boletin/', {
                'alumno_id': self.alumno_a.id, 'lapso_id': lapso_b.id,
            }),
            ('/api/academico/docente/plan-evaluacion/', {
                'materia_id': self.materia_a.id, 'lapso_id': lapso_b.id,
            }),
            ('/api/academico/docente/plan-evaluacion/notas/', {
                'materia_id': self.materia_a.id, 'lapso_id': lapso_b.id,
            }),
        )
        for url, params in casos:
            with self.subTest(url=url):
                response = self.client.get(url, params)
                self.assertEqual(response.status_code, 404, response.content)

        crear = self.client.post(
            f'/api/academico/docente/plan-evaluacion/?materia_id={self.materia_a.id}&lapso_id={lapso_b.id}',
            {},
            format='json',
        )
        self.assertEqual(crear.status_code, 404, crear.content)
        self.assertFalse(PlanEvaluacion.objects.exists())


class DocenteOwnershipYSedeTests(SeguridadAcademicaBase):
    def setUp(self):
        super().setUp()
        self.docente = crear_usuario('docente_sede_a', 'docente')
        self.conceder(self.docente, self.sede_a, 'docente')
        Docente.objects.create(user=self.docente, sede=self.sede_a)
        self.materia_a.docente = self.docente
        self.materia_a.save(update_fields=['docente'])
        self.autenticar(self.docente)

    def test_seccion_homonima_de_otra_sede_no_aparece_en_asistencia(self):
        response = self.client.get('/api/academico/asistencia/', {
            'grado_seccion': self.GRADO,
            'fecha': '2026-10-01',
        })
        self.assertEqual(response.status_code, 200, response.content)
        ids = {fila['alumno_id'] for fila in response.json()}
        self.assertEqual(ids, {self.alumno_a.id})

    def test_docente_no_puede_guardar_alumno_homonimo_de_otra_sede(self):
        response = self.client.post('/api/academico/asistencia/', {
            'fecha': '2026-10-01',
            'grado_seccion': self.GRADO,
            'registros': [{'alumno_id': self.alumno_b.id, 'estado': 'P'}],
        }, format='json')
        # El bulk conserva por compatibilidad su contrato HTTP 200 con errores
        # por fila; lo importante es que el ID ajeno nunca se materialice.
        self.assertIn(response.status_code, (200, 400, 403, 404), response.content)
        if response.status_code == 200:
            self.assertEqual(response.json()['guardadas'], [])
            self.assertEqual(response.json()['errores'][0]['alumno_id'], self.alumno_b.id)
        self.assertFalse(Asistencia.objects.filter(alumno=self.alumno_b).exists())

    def test_docente_solo_consulta_resumen_de_alumno_asignado(self):
        propio = self.client.get('/api/academico/asistencia/resumen/', {
            'alumno_id': self.alumno_a.id, 'mes': 10, 'anio': 2026,
        })
        ajeno = self.client.get('/api/academico/asistencia/resumen/', {
            'alumno_id': self.alumno_b.id, 'mes': 10, 'anio': 2026,
        })
        self.assertEqual(propio.status_code, 200, propio.content)
        self.assertEqual(ajeno.status_code, 404, ajeno.content)

    def test_docente_no_consulta_notas_de_materia_ajena(self):
        response = self.client.get('/api/academico/notas/', {
            'materia_id': self.materia_b.id,
            'lapso_id': self.lapso.id,
        })
        self.assertIn(response.status_code, (403, 404), response.content)

