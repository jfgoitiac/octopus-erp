"""
Tests del módulo Diario de Clases (Fase 1 — Asistencia extendida + Incidentes).

Cubren:
  - Campo `estado` (P/A/J/R) y su sincronización retro-compatible con
    los booleanos presente/justificada.
  - Backfill de datos de la migración 0007.
  - Scoping de docente por sección (permitido en la suya, 403 en otra).
  - Validación de adjunto de incidentes (tamaño y tipo de archivo).
"""
from datetime import date
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from rest_framework.test import APIClient

from authentication.models import PerfilUsuario
from secretaria.models import Alumno, Representante

from .models import (
    AlertaRendimiento, Asistencia, BloqueEvaluacion, IncidenteDisciplinario, ItemEvaluacion,
    Lapso, Materia, MaterialEstudio, Nota, NotaItemEvaluacion, PlanEvaluacion,
)
from .serializers import estado_a_booleanos
from .services import (
    calcular_plan_notas, calcular_rendimiento_alumno, calcular_rendimiento_seccion,
    generar_alertas_rendimiento,
)

User = get_user_model()

# PNG válido de 1x1 px (magic bytes reales) — necesario porque ImageField
# valida el contenido, no solo la extensión.
PNG_BYTES = (
    b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01'
    b'\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\nIDATx\x9cc\x00\x01'
    b'\x00\x00\x05\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82'
)


def crear_usuario(username, rol, password='clave-segura-123'):
    user = User.objects.create_user(username=username, password=password)
    user.perfil.rol = rol
    user.perfil.save(update_fields=['rol'])
    return user


def crear_alumno(cedula_escolar, grado_seccion='1er Grado A'):
    rep = Representante.objects.create(
        cedula=f"V{cedula_escolar}",
        nombre='Maria', apellido='Gonzalez',
        telefono='04141234567', correo=f"{cedula_escolar}@example.com",
        direccion='Av. Principal',
    )
    return Alumno.objects.create(
        representante=rep,
        cedula_escolar=cedula_escolar,
        nombre='Pedro', apellido='Gonzalez',
        fecha_nacimiento=date(2015, 3, 10),
        grado_seccion=grado_seccion,
    )


class EstadoABooleanosTests(TestCase):
    """La lógica de mapeo estado -> (presente, justificada) es el contrato
    que mantiene retrocompatibilidad con reportes que leen los booleanos."""

    def test_presente(self):
        self.assertEqual(estado_a_booleanos('P'), (True, False))

    def test_retardado_cuenta_como_presente(self):
        self.assertEqual(estado_a_booleanos('R'), (True, False))

    def test_justificado(self):
        self.assertEqual(estado_a_booleanos('J'), (False, True))

    def test_ausente(self):
        self.assertEqual(estado_a_booleanos('A'), (False, False))


class AsistenciaBulkEstadoTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.secretaria = crear_usuario('secre1', 'secretaria')
        self.alumno = crear_alumno('E84000001')
        self.client.force_authenticate(user=self.secretaria)

    def test_guardar_asistencia_con_estado_retardado(self):
        resp = self.client.post('/api/academico/asistencia/', {
            'fecha': '2026-07-27',
            'grado_seccion': '1er Grado A',
            'registros': [
                {'alumno_id': self.alumno.id, 'estado': 'R', 'observacion': 'Llegó 10 min tarde'},
            ],
        }, format='json')
        self.assertEqual(resp.status_code, 200, resp.content)
        asistencia = Asistencia.objects.get(alumno=self.alumno)
        self.assertEqual(asistencia.estado, 'R')
        # Retardado debe seguir contando como presente para reportes existentes
        self.assertTrue(asistencia.presente)
        self.assertFalse(asistencia.justificada)

    def test_requiere_estado_o_presente(self):
        resp = self.client.post('/api/academico/asistencia/', {
            'fecha': '2026-07-27',
            'grado_seccion': '1er Grado A',
            'registros': [{'alumno_id': self.alumno.id, 'observacion': 'sin estado'}],
        }, format='json')
        self.assertEqual(resp.status_code, 400)


class AsistenciaDocenteScopingTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.docente = crear_usuario('docente1', 'docente')
        self.alumno_propio = crear_alumno('E84000002', grado_seccion='2do Grado B')
        self.alumno_ajeno  = crear_alumno('E84000003', grado_seccion='3er Grado C')
        Materia.objects.create(
            nombre='Matemáticas', grado_seccion='2do Grado B',
            docente=self.docente, activa=True,
        )
        self.client.force_authenticate(user=self.docente)

    def test_docente_puede_marcar_asistencia_de_su_seccion(self):
        resp = self.client.post('/api/academico/asistencia/', {
            'fecha': '2026-07-27',
            'grado_seccion': '2do Grado B',
            'registros': [{'alumno_id': self.alumno_propio.id, 'estado': 'P'}],
        }, format='json')
        self.assertEqual(resp.status_code, 200, resp.content)

    def test_docente_no_puede_marcar_asistencia_de_otra_seccion(self):
        resp = self.client.post('/api/academico/asistencia/', {
            'fecha': '2026-07-27',
            'grado_seccion': '3er Grado C',
            'registros': [{'alumno_id': self.alumno_ajeno.id, 'estado': 'P'}],
        }, format='json')
        self.assertEqual(resp.status_code, 403)
        self.assertFalse(Asistencia.objects.filter(alumno=self.alumno_ajeno).exists())


class IncidenteDisciplinarioTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.docente = crear_usuario('docente2', 'docente')
        self.secretaria = crear_usuario('secre2', 'secretaria')
        self.alumno_propio = crear_alumno('E84000004', grado_seccion='4to Grado A')
        self.alumno_ajeno  = crear_alumno('E84000005', grado_seccion='5to Grado A')
        Materia.objects.create(
            nombre='Lengua', grado_seccion='4to Grado A',
            docente=self.docente, activa=True,
        )

    def test_docente_crea_incidente_de_su_seccion(self):
        self.client.force_authenticate(user=self.docente)
        resp = self.client.post('/api/academico/incidentes/', {
            'alumno_id': self.alumno_propio.id,
            'descripcion': 'Interrumpió la clase reiteradamente.',
            'severidad': 'L',
        }, format='multipart')
        self.assertEqual(resp.status_code, 201, resp.content)
        self.assertEqual(IncidenteDisciplinario.objects.count(), 1)
        incidente = IncidenteDisciplinario.objects.get()
        self.assertEqual(incidente.registrado_por, self.docente)

    def test_docente_no_puede_crear_incidente_de_otra_seccion(self):
        self.client.force_authenticate(user=self.docente)
        resp = self.client.post('/api/academico/incidentes/', {
            'alumno_id': self.alumno_ajeno.id,
            'descripcion': 'No debería poder registrar esto.',
            'severidad': 'G',
        }, format='multipart')
        self.assertEqual(resp.status_code, 403)
        self.assertEqual(IncidenteDisciplinario.objects.count(), 0)

    def test_secretaria_ve_incidentes_de_todas_las_secciones(self):
        IncidenteDisciplinario.objects.create(
            alumno=self.alumno_propio, descripcion='x', severidad='M', registrado_por=self.docente,
        )
        IncidenteDisciplinario.objects.create(
            alumno=self.alumno_ajeno, descripcion='y', severidad='G', registrado_por=self.docente,
        )
        self.client.force_authenticate(user=self.secretaria)
        resp = self.client.get('/api/academico/incidentes/')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.data), 2)

    def test_docente_solo_ve_incidentes_de_su_seccion(self):
        IncidenteDisciplinario.objects.create(
            alumno=self.alumno_propio, descripcion='x', severidad='M', registrado_por=self.docente,
        )
        IncidenteDisciplinario.objects.create(
            alumno=self.alumno_ajeno, descripcion='y', severidad='G', registrado_por=self.docente,
        )
        self.client.force_authenticate(user=self.docente)
        resp = self.client.get('/api/academico/incidentes/')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.data), 1)
        self.assertEqual(resp.data[0]['alumno_id'], self.alumno_propio.id)

    def test_adjunto_supera_5mb_es_rechazado(self):
        self.client.force_authenticate(user=self.secretaria)
        archivo_grande = SimpleUploadedFile(
            'foto.png', PNG_BYTES + b'\x00' * (5 * 1024 * 1024 + 1), content_type='image/png'
        )
        resp = self.client.post('/api/academico/incidentes/', {
            'alumno_id': self.alumno_propio.id,
            'descripcion': 'Adjunto demasiado grande.',
            'severidad': 'L',
            'adjunto': archivo_grande,
        }, format='multipart')
        self.assertEqual(resp.status_code, 400, resp.content)

    def test_adjunto_tipo_invalido_es_rechazado(self):
        self.client.force_authenticate(user=self.secretaria)
        archivo_invalido = SimpleUploadedFile(
            'documento.pdf', b'%PDF-1.4 no es una imagen', content_type='application/pdf'
        )
        resp = self.client.post('/api/academico/incidentes/', {
            'alumno_id': self.alumno_propio.id,
            'descripcion': 'Adjunto de tipo no permitido.',
            'severidad': 'L',
            'adjunto': archivo_invalido,
        }, format='multipart')
        self.assertEqual(resp.status_code, 400, resp.content)

    def test_adjunto_valido_se_guarda(self):
        self.client.force_authenticate(user=self.secretaria)
        archivo = SimpleUploadedFile('foto.png', PNG_BYTES, content_type='image/png')
        resp = self.client.post('/api/academico/incidentes/', {
            'alumno_id': self.alumno_propio.id,
            'descripcion': 'Con foto adjunta.',
            'severidad': 'M',
            'adjunto': archivo,
        }, format='multipart')
        self.assertEqual(resp.status_code, 201, resp.content)
        self.assertTrue(IncidenteDisciplinario.objects.get().adjunto.name)


class NotasDocenteScopingTests(TestCase):
    """Fase 3 -- el docente puede cargar notas solo de su propia materia
    (Materia.docente = request.user), a diferencia de Asistencia/Incidentes
    que se acotan por sección completa."""

    def setUp(self):
        self.client = APIClient()
        self.docente = crear_usuario('docente3', 'docente')
        self.alumno = crear_alumno('E84000006', grado_seccion='6to Grado A')
        self.materia_propia = Materia.objects.create(
            nombre='Ciencias', grado_seccion='6to Grado A', docente=self.docente, activa=True,
        )
        self.materia_ajena = Materia.objects.create(
            nombre='Arte', grado_seccion='6to Grado A', docente=None, activa=True,
        )
        self.lapso = Lapso.objects.create(
            nombre='1er Lapso', periodo_escolar='2025-2026',
            fecha_inicio=date(2025, 9, 1), fecha_fin=date(2025, 12, 15), activo=True,
        )
        self.client.force_authenticate(user=self.docente)

    def test_docente_guarda_notas_de_su_materia(self):
        resp = self.client.post('/api/academico/notas/', {
            'materia_id': self.materia_propia.id,
            'lapso_id': self.lapso.id,
            'notas': [{'alumno_id': self.alumno.id, 'evaluacion_1': '18.00'}],
        }, format='json')
        self.assertEqual(resp.status_code, 200, resp.content)
        self.assertEqual(Nota.objects.count(), 1)

    def test_docente_no_puede_guardar_notas_de_materia_ajena(self):
        resp = self.client.post('/api/academico/notas/', {
            'materia_id': self.materia_ajena.id,
            'lapso_id': self.lapso.id,
            'notas': [{'alumno_id': self.alumno.id, 'evaluacion_1': '18.00'}],
        }, format='json')
        self.assertEqual(resp.status_code, 403)
        self.assertEqual(Nota.objects.count(), 0)


class DocenteMisMateriasTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.docente = crear_usuario('docente4', 'docente')
        self.otro_docente = crear_usuario('docente5', 'docente')
        Materia.objects.create(nombre='Física', grado_seccion='6to Grado A', docente=self.docente, activa=True)
        Materia.objects.create(nombre='Química', grado_seccion='6to Grado B', docente=self.docente, activa=False)
        Materia.objects.create(nombre='Historia', grado_seccion='6to Grado A', docente=self.otro_docente, activa=True)

    def test_docente_ve_solo_sus_materias_activas(self):
        self.client.force_authenticate(user=self.docente)
        resp = self.client.get('/api/academico/docente/mis-materias/')
        self.assertEqual(resp.status_code, 200, resp.content)
        self.assertEqual(len(resp.data), 1)
        self.assertEqual(resp.data[0]['nombre'], 'Física')


class MaterialEstudioTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.docente = crear_usuario('docente6', 'docente')
        self.materia_propia = Materia.objects.create(
            nombre='Biología', grado_seccion='6to Grado A', docente=self.docente, activa=True,
        )
        self.materia_ajena = Materia.objects.create(
            nombre='Inglés', grado_seccion='6to Grado A', docente=None, activa=True,
        )
        self.client.force_authenticate(user=self.docente)

    def test_docente_publica_material_de_su_materia(self):
        resp = self.client.post('/api/academico/materiales/', {
            'materia_id': self.materia_propia.id,
            'titulo': 'Guía de laboratorio',
            'enlace': 'https://example.com/guia.pdf',
        }, format='multipart')
        self.assertEqual(resp.status_code, 201, resp.content)
        self.assertEqual(MaterialEstudio.objects.get().publicado_por, self.docente)

    def test_docente_no_puede_publicar_material_de_materia_ajena(self):
        resp = self.client.post('/api/academico/materiales/', {
            'materia_id': self.materia_ajena.id,
            'titulo': 'No debería poder',
        }, format='multipart')
        self.assertEqual(resp.status_code, 403)
        self.assertEqual(MaterialEstudio.objects.count(), 0)


# ─────────────────────────────────────────────
# FASE 4 — SEGUIMIENTO GRÁFICO
# ─────────────────────────────────────────────
def crear_representante_user_portal(representante, password='clave-portal-123'):
    """Helper local (mismo patrón que portal/tests.py::crear_representante_con_portal,
    pero partiendo de un Representante ya creado por crear_alumno())."""
    from portal.models import RepresentanteUser, asignar_rol_portal

    user = User.objects.create_user(
        username=representante.cedula, password=password, email=representante.correo
    )
    rep_user = RepresentanteUser.objects.create(representante=representante, user=user)
    asignar_rol_portal(user)
    return user, rep_user


class RendimientoAlumnoCalculoTests(TestCase):
    """Lógica pura de agregación (services.calcular_rendimiento_alumno),
    sin pasar por la vista/permiso."""

    def setUp(self):
        self.alumno = crear_alumno('E84000010', grado_seccion='1er Grado A')
        self.materia = Materia.objects.create(
            nombre='Matemáticas', grado_seccion='1er Grado A', activa=True,
        )
        self.lapso = Lapso.objects.create(
            nombre='1er Lapso', periodo_escolar='2025-2026',
            fecha_inicio=date(2025, 9, 1), fecha_fin=date(2025, 12, 15), activo=True,
        )

    def test_alumno_sin_notas_devuelve_estructura_completa_sin_error(self):
        resultado = calcular_rendimiento_alumno(self.alumno)
        self.assertEqual(resultado['alumno']['id'], self.alumno.id)
        # El lapso existe en el período aunque no tenga notas cargadas todavía
        self.assertEqual(len(resultado['por_lapso']), 1)
        self.assertEqual(resultado['por_lapso'][0]['por_materia'], [])
        self.assertIsNone(resultado['por_lapso'][0]['promedio_general'])
        self.assertFalse(resultado['en_riesgo'])

    def test_promedio_general_y_bandera_en_riesgo(self):
        Nota.objects.create(
            alumno=self.alumno, materia=self.materia, lapso=self.lapso,
            evaluacion_1=Decimal('8.00'),
        )
        resultado = calcular_rendimiento_alumno(self.alumno)
        self.assertEqual(resultado['por_lapso'][0]['promedio_general'], 8.0)
        self.assertTrue(resultado['en_riesgo'])

    def test_asistencia_se_agrega_correctamente(self):
        Asistencia.objects.create(alumno=self.alumno, fecha=date(2025, 9, 2), presente=True)
        Asistencia.objects.create(alumno=self.alumno, fecha=date(2025, 9, 3), presente=False)
        resultado = calcular_rendimiento_alumno(self.alumno)
        self.assertEqual(resultado['asistencia']['total_clases'], 2)
        self.assertEqual(resultado['asistencia']['presentes'], 1)
        self.assertEqual(resultado['asistencia']['porcentaje'], 50.0)


class RendimientoSeccionCalculoTests(TestCase):
    def test_porcentaje_aprobados_por_materia(self):
        materia = Materia.objects.create(
            nombre='Lengua', grado_seccion='2do Grado A', activa=True,
        )
        lapso = Lapso.objects.create(
            nombre='1er Lapso', periodo_escolar='2025-2026',
            fecha_inicio=date(2025, 9, 1), fecha_fin=date(2025, 12, 15), activo=True,
        )
        alumno1 = crear_alumno('E84000011', grado_seccion='2do Grado A')
        alumno2 = crear_alumno('E84000012', grado_seccion='2do Grado A')
        Nota.objects.create(alumno=alumno1, materia=materia, lapso=lapso, evaluacion_1=Decimal('15.00'))
        Nota.objects.create(alumno=alumno2, materia=materia, lapso=lapso, evaluacion_1=Decimal('5.00'))

        resultado = calcular_rendimiento_seccion('2do Grado A', lapso=lapso)
        fila = resultado['por_materia'][0]
        self.assertEqual(fila['total_evaluados'], 2)
        self.assertEqual(fila['porcentaje_aprobados'], 50.0)


class RendimientoAlumnoViewPermisosTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.alumno = crear_alumno('E84000013', grado_seccion='3er Grado A')
        self.director = crear_usuario('director1', 'director')
        self.docente = crear_usuario('docente7', 'docente')

    def test_director_puede_ver_rendimiento(self):
        self.client.force_authenticate(user=self.director)
        resp = self.client.get(f'/api/academico/rendimiento/alumno/{self.alumno.id}/')
        self.assertEqual(resp.status_code, 200, resp.content)

    def test_docente_no_tiene_acceso_a_rendimiento_admin(self):
        self.client.force_authenticate(user=self.docente)
        resp = self.client.get(f'/api/academico/rendimiento/alumno/{self.alumno.id}/')
        self.assertEqual(resp.status_code, 403)

    def test_alumno_inexistente_devuelve_404(self):
        self.client.force_authenticate(user=self.director)
        resp = self.client.get('/api/academico/rendimiento/alumno/999999/')
        self.assertEqual(resp.status_code, 404)


class RendimientoPortalAislamientoTests(TestCase):
    """El representante del portal solo puede ver el rendimiento de sus
    propios hijos -- mismo criterio IDOR que el resto del portal."""

    def setUp(self):
        self.client = APIClient()
        self.alumno_propio = crear_alumno('E84000014', grado_seccion='4to Grado A')
        self.alumno_ajeno = crear_alumno('E84000015', grado_seccion='4to Grado B')
        self.rep_user, _ = crear_representante_user_portal(self.alumno_propio.representante)

    def test_representante_ve_rendimiento_de_su_hijo(self):
        self.client.force_authenticate(user=self.rep_user)
        resp = self.client.get(f'/api/portal/academico/rendimiento/alumno/{self.alumno_propio.id}/')
        self.assertEqual(resp.status_code, 200, resp.content)

    def test_representante_no_ve_rendimiento_de_hijo_ajeno(self):
        self.client.force_authenticate(user=self.rep_user)
        resp = self.client.get(f'/api/portal/academico/rendimiento/alumno/{self.alumno_ajeno.id}/')
        self.assertEqual(resp.status_code, 404)


class GenerarAlertasRendimientoTests(TestCase):
    def setUp(self):
        self.alumno = crear_alumno('E84000016', grado_seccion='5to Grado B')
        self.materia = Materia.objects.create(
            nombre='Física', grado_seccion='5to Grado B', activa=True,
        )
        self.lapso = Lapso.objects.create(
            nombre='1er Lapso', periodo_escolar='2025-2026',
            fecha_inicio=date(2025, 9, 1), fecha_fin=date(2025, 12, 15), activo=True,
        )

    def test_crea_alerta_si_promedio_bajo_umbral(self):
        Nota.objects.create(
            alumno=self.alumno, materia=self.materia, lapso=self.lapso,
            evaluacion_1=Decimal('7.00'),
        )
        generar_alertas_rendimiento()
        self.assertEqual(AlertaRendimiento.objects.filter(activa=True).count(), 1)

    def test_resuelve_alerta_si_promedio_sube_por_encima_del_umbral(self):
        nota = Nota.objects.create(
            alumno=self.alumno, materia=self.materia, lapso=self.lapso,
            evaluacion_1=Decimal('7.00'),
        )
        generar_alertas_rendimiento()
        alerta = AlertaRendimiento.objects.get()
        self.assertTrue(alerta.activa)

        nota.evaluacion_1 = Decimal('18.00')
        nota.save()
        generar_alertas_rendimiento()
        alerta.refresh_from_db()
        self.assertFalse(alerta.activa)
        self.assertIsNotNone(alerta.resuelta_at)

    def test_endpoint_alertas_solo_lista_activas(self):
        client = APIClient()
        director = crear_usuario('director2', 'director')
        Nota.objects.create(
            alumno=self.alumno, materia=self.materia, lapso=self.lapso,
            evaluacion_1=Decimal('7.00'),
        )
        generar_alertas_rendimiento()

        client.force_authenticate(user=director)
        resp = client.get('/api/academico/rendimiento/alertas/')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.data), 1)
        self.assertEqual(resp.data[0]['alumno_id'], self.alumno.id)


# ─────────────────────────────────────────────
# LOGIN DEL PORTAL DOCENTE
# ─────────────────────────────────────────────
class DocenteLoginTests(TestCase):
    """
    Cubre POST /api/portal-docente/login/:
      - login exitoso con rol 'docente'
      - rechazo (403) con rol distinto de 'docente'
      - rechazo (401) con credenciales inválidas
    """

    def setUp(self):
        from django.core.cache import cache
        cache.clear()  # evita que el throttle de login acumule entre tests
        self.client = APIClient()

    def test_login_docente_exitoso(self):
        crear_usuario('docente1', 'docente', 'clave-docente-123')

        resp = self.client.post('/api/portal-docente/login/', {
            'username': 'docente1',
            'password': 'clave-docente-123',
        })

        self.assertEqual(resp.status_code, 200, resp.content)
        self.assertIn('access', resp.data)
        self.assertIn('refresh', resp.data)
        self.assertEqual(resp.data['rol'], 'docente')
        self.assertEqual(resp.data['username'], 'docente1')
        self.assertIn('nombre', resp.data)

    def test_login_rechaza_rol_no_docente(self):
        crear_usuario('cajero1', 'cajero', 'clave-cajero-123')

        resp = self.client.post('/api/portal-docente/login/', {
            'username': 'cajero1',
            'password': 'clave-cajero-123',
        })

        self.assertEqual(resp.status_code, 403, resp.content)

    def test_login_rechaza_credenciales_invalidas(self):
        crear_usuario('docente2', 'docente', 'clave-docente-456')

        resp = self.client.post('/api/portal-docente/login/', {
            'username': 'docente2',
            'password': 'clave-incorrecta',
        })

        self.assertEqual(resp.status_code, 401, resp.content)


class DocenteCambiarContrasenaTests(TestCase):
    """Cubre POST /api/portal-docente/cambiar-contrasena/."""

    def setUp(self):
        self.client = APIClient()
        self.user = crear_usuario('docente3', 'docente', 'clave-vieja-123')
        self.client.force_authenticate(user=self.user)

    def test_cambia_contrasena_exitosamente(self):
        resp = self.client.post('/api/portal-docente/cambiar-contrasena/', {
            'contrasena_actual': 'clave-vieja-123',
            'contrasena_nueva': 'clave-nueva-456',
            'confirmar': 'clave-nueva-456',
        })
        self.assertEqual(resp.status_code, 200, resp.content)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password('clave-nueva-456'))

    def test_rechaza_contrasena_actual_incorrecta(self):
        resp = self.client.post('/api/portal-docente/cambiar-contrasena/', {
            'contrasena_actual': 'clave-incorrecta',
            'contrasena_nueva': 'clave-nueva-456',
            'confirmar': 'clave-nueva-456',
        })
        self.assertEqual(resp.status_code, 400, resp.content)

    def test_rechaza_usuario_no_docente(self):
        cajero = crear_usuario('cajero2', 'cajero', 'clave-cajero-123')
        self.client.force_authenticate(user=cajero)
        resp = self.client.post('/api/portal-docente/cambiar-contrasena/', {
            'contrasena_actual': 'clave-cajero-123',
            'contrasena_nueva': 'clave-nueva-456',
            'confirmar': 'clave-nueva-456',
        })
        self.assertEqual(resp.status_code, 403, resp.content)


class DocenteRegistroYAccesoPortalTests(TestCase):
    """
    Un usuario creado con rol 'docente' vía el endpoint de gestión de
    usuarios (UserManagementViewSet, usado por Sistemas.jsx) debe poder
    entrar de inmediato al portal docente con las mismas credenciales —
    sin ningún paso de activación adicional (a diferencia del representante,
    que requiere un RepresentanteUser vinculado explícitamente).
    """

    def setUp(self):
        from django.core.cache import cache
        cache.clear()
        self.client = APIClient()
        director = crear_usuario('director_sis', 'director', 'clave-director-123')
        self.client.force_authenticate(user=director)

    def test_docente_recien_creado_puede_entrar_al_portal(self):
        resp_crear = self.client.post('/api/authentication/users/', {
            'username': 'docente_nuevo',
            'email': 'docente_nuevo@example.com',
            'password': 'ClaveSegura!2026',
            'rol': 'docente',
        })
        self.assertEqual(resp_crear.status_code, 201, resp_crear.content)

        resp_login = APIClient().post('/api/portal-docente/login/', {
            'username': 'docente_nuevo',
            'password': 'ClaveSegura!2026',
        })
        self.assertEqual(resp_login.status_code, 200, resp_login.content)
        self.assertEqual(resp_login.data['rol'], 'docente')


class DocenteBloqueadoEnLoginAdminTests(TestCase):
    """
    El docente debe entrar solo por /api/portal-docente/login/, no por el
    login del panel admin (/api/authentication/login/) — cierra el hueco de
    que la separación de portales fuera solo cosmética en el frontend.
    """

    def setUp(self):
        from django.core.cache import cache
        cache.clear()
        self.client = APIClient()

    def test_docente_no_puede_usar_login_admin(self):
        crear_usuario('docente_bloqueado', 'docente', 'clave-docente-789')

        resp = self.client.post('/api/authentication/login/', {
            'username': 'docente_bloqueado',
            'password': 'clave-docente-789',
        })

        self.assertEqual(resp.status_code, 403, resp.content)

    def test_no_docente_si_puede_usar_login_admin(self):
        crear_usuario('secretaria1', 'secretaria', 'clave-secretaria-123')

        resp = self.client.post('/api/authentication/login/', {
            'username': 'secretaria1',
            'password': 'clave-secretaria-123',
        })

        self.assertEqual(resp.status_code, 200, resp.content)


# ─────────────────────────────────────────────
# PLAN DE EVALUACIÓN (sistema nuevo, opcional por materia+lapso)
# ─────────────────────────────────────────────
class PlanEvaluacionCalculoTests(TestCase):
    """Cubre las reglas de cálculo de services.calcular_plan_notas:
    bloque modo puntos, modo promedio, aporte EREC y moda de letras."""

    def setUp(self):
        self.lapso = Lapso.objects.create(
            nombre='1er Lapso', periodo_escolar='2025-2026',
            fecha_inicio=date(2025, 9, 1), fecha_fin=date(2025, 12, 15), activo=True,
        )
        self.alumno = crear_alumno('E84000020', grado_seccion='7mo Grado A')

    def test_bloque_modo_puntos_suma_valores(self):
        materia = Materia.objects.create(
            nombre='Matemáticas', grado_seccion='7mo Grado A',
            tipo_evaluacion='numerica', activa=True,
        )
        plan = PlanEvaluacion.objects.create(materia=materia, lapso=self.lapso)
        bloque = BloqueEvaluacion.objects.create(plan=plan, nombre='Contenido', modo='puntos')
        item1 = ItemEvaluacion.objects.create(bloque=bloque, nombre='Quiz 1', valor_maximo=5)
        item2 = ItemEvaluacion.objects.create(bloque=bloque, nombre='Quiz 2', valor_maximo=5)
        NotaItemEvaluacion.objects.create(item=item1, alumno=self.alumno, valor_numerico=Decimal('4.00'))
        NotaItemEvaluacion.objects.create(item=item2, alumno=self.alumno, valor_numerico=Decimal('3.00'))

        _, alumnos_data = calcular_plan_notas(materia, self.lapso)
        fila = alumnos_data[0]
        self.assertEqual(fila['bloques'][0]['valor'], 7.0)
        self.assertEqual(fila['total'], 7.0)

    def test_bloque_modo_promedio_ignora_items_sin_nota(self):
        materia = Materia.objects.create(
            nombre='Física', grado_seccion='7mo Grado A',
            tipo_evaluacion='numerica', activa=True,
        )
        plan = PlanEvaluacion.objects.create(materia=materia, lapso=self.lapso)
        bloque = BloqueEvaluacion.objects.create(plan=plan, nombre='Rasgos', modo='promedio')
        item1 = ItemEvaluacion.objects.create(bloque=bloque, nombre='Rasgo 1')
        item2 = ItemEvaluacion.objects.create(bloque=bloque, nombre='Rasgo 2')
        # item2 se deja sin nota a propósito -- no debe contar como 0
        NotaItemEvaluacion.objects.create(item=item1, alumno=self.alumno, valor_numerico=Decimal('16.00'))

        _, alumnos_data = calcular_plan_notas(materia, self.lapso)
        fila = alumnos_data[0]
        self.assertEqual(fila['bloques'][0]['valor'], 16.0)
        self.assertEqual(fila['total'], 16.0)

    def test_materia_erec_aporta_a_otra_materia_del_mismo_grado(self):
        materia_erec = Materia.objects.create(
            nombre='EREC', grado_seccion='7mo Grado A',
            tipo_evaluacion='numerica', aporta_a_todas_las_materias=True, activa=True,
        )
        plan_erec = PlanEvaluacion.objects.create(materia=materia_erec, lapso=self.lapso)
        bloque_erec = BloqueEvaluacion.objects.create(plan=plan_erec, nombre='EREC', modo='puntos')
        item_erec = ItemEvaluacion.objects.create(bloque=bloque_erec, nombre='Participación', valor_maximo=2)
        NotaItemEvaluacion.objects.create(item=item_erec, alumno=self.alumno, valor_numerico=Decimal('2.00'))

        materia_destino = Materia.objects.create(
            nombre='Lengua', grado_seccion='7mo Grado A',
            tipo_evaluacion='numerica', activa=True,
        )
        plan_destino = PlanEvaluacion.objects.create(materia=materia_destino, lapso=self.lapso)
        bloque_destino = BloqueEvaluacion.objects.create(plan=plan_destino, nombre='Contenido', modo='puntos')
        item_destino = ItemEvaluacion.objects.create(bloque=bloque_destino, nombre='Examen', valor_maximo=15)
        NotaItemEvaluacion.objects.create(item=item_destino, alumno=self.alumno, valor_numerico=Decimal('12.00'))

        _, alumnos_data = calcular_plan_notas(materia_destino, self.lapso)
        fila = alumnos_data[0]
        # 12 (propio) + 2 (aporte EREC) = 14
        self.assertEqual(fila['total'], 14.0)
        self.assertEqual(len(fila['aporte_otras_materias']), 1)
        self.assertEqual(fila['aporte_otras_materias'][0]['materia_id'], materia_erec.id)
        self.assertEqual(fila['aporte_otras_materias'][0]['valor'], 2.0)

    def test_moda_de_letras_en_materia_literal(self):
        materia = Materia.objects.create(
            nombre='Formación Ciudadana', grado_seccion='7mo Grado A',
            tipo_evaluacion='literal', activa=True,
        )
        plan = PlanEvaluacion.objects.create(materia=materia, lapso=self.lapso)
        bloque = BloqueEvaluacion.objects.create(plan=plan, nombre='Actitud', modo='puntos')
        item1 = ItemEvaluacion.objects.create(bloque=bloque, nombre='Corte 1', orden=1)
        item2 = ItemEvaluacion.objects.create(bloque=bloque, nombre='Corte 2', orden=2)
        item3 = ItemEvaluacion.objects.create(bloque=bloque, nombre='Corte 3', orden=3)
        NotaItemEvaluacion.objects.create(item=item1, alumno=self.alumno, valor_letra='B')
        NotaItemEvaluacion.objects.create(item=item2, alumno=self.alumno, valor_letra='A')
        NotaItemEvaluacion.objects.create(item=item3, alumno=self.alumno, valor_letra='A')

        _, alumnos_data = calcular_plan_notas(materia, self.lapso)
        fila = alumnos_data[0]
        self.assertEqual(fila['bloques'][0]['valor_letra'], 'A')
        self.assertEqual(fila['total_letra'], 'A')
        self.assertIsNone(fila['total'])

    def test_moda_con_empate_devuelve_primera_en_orden_de_aparicion(self):
        materia = Materia.objects.create(
            nombre='Educación Física', grado_seccion='7mo Grado A',
            tipo_evaluacion='literal', activa=True,
        )
        plan = PlanEvaluacion.objects.create(materia=materia, lapso=self.lapso)
        bloque = BloqueEvaluacion.objects.create(plan=plan, nombre='Desempeño', modo='puntos')
        item1 = ItemEvaluacion.objects.create(bloque=bloque, nombre='Corte 1', orden=1)
        item2 = ItemEvaluacion.objects.create(bloque=bloque, nombre='Corte 2', orden=2)
        NotaItemEvaluacion.objects.create(item=item1, alumno=self.alumno, valor_letra='B')
        NotaItemEvaluacion.objects.create(item=item2, alumno=self.alumno, valor_letra='A')

        _, alumnos_data = calcular_plan_notas(materia, self.lapso)
        # Empate 1-1: gana 'B' por aparecer primero (orden de los items)
        self.assertEqual(alumnos_data[0]['bloques'][0]['valor_letra'], 'B')

    def test_sin_plan_configurado_devuelve_none(self):
        materia = Materia.objects.create(
            nombre='Sin Plan', grado_seccion='7mo Grado A',
            tipo_evaluacion='numerica', activa=True,
        )
        plan, alumnos_data = calcular_plan_notas(materia, self.lapso)
        self.assertIsNone(plan)
        self.assertEqual(alumnos_data, [])


class PlanEvaluacionEndpointTests(TestCase):
    """Cubre el contrato HTTP de PlanEvaluacionView y PlanEvaluacionNotasView."""

    def setUp(self):
        self.client = APIClient()
        self.docente = crear_usuario('docente_plan', 'docente')
        self.otro_docente = crear_usuario('docente_plan_otro', 'docente')
        self.materia = Materia.objects.create(
            nombre='Química', grado_seccion='8vo Grado A',
            tipo_evaluacion='numerica', docente=self.docente, activa=True,
        )
        self.lapso = Lapso.objects.create(
            nombre='1er Lapso', periodo_escolar='2025-2026',
            fecha_inicio=date(2025, 9, 1), fecha_fin=date(2025, 12, 15), activo=True,
        )
        self.alumno = crear_alumno('E84000021', grado_seccion='8vo Grado A')

    def test_get_sin_plan_devuelve_null(self):
        self.client.force_authenticate(user=self.docente)
        resp = self.client.get(
            f'/api/academico/docente/plan-evaluacion/?materia_id={self.materia.id}&lapso_id={self.lapso.id}'
        )
        self.assertEqual(resp.status_code, 200)
        self.assertIsNone(resp.data)

    def test_docente_crea_plan_con_bloques_anidados(self):
        self.client.force_authenticate(user=self.docente)
        resp = self.client.post(
            f'/api/academico/docente/plan-evaluacion/?materia_id={self.materia.id}&lapso_id={self.lapso.id}',
            {
                'bloques': [
                    {
                        'nombre': 'Contenido', 'modo': 'puntos', 'total_puntos': '15.00', 'orden': 1,
                        'items': [
                            {'nombre': 'Examen', 'valor_maximo': '15.00', 'orden': 1},
                        ],
                    },
                ],
            },
            format='json',
        )
        self.assertEqual(resp.status_code, 201, resp.content)
        self.assertEqual(PlanEvaluacion.objects.count(), 1)
        self.assertEqual(BloqueEvaluacion.objects.count(), 1)
        self.assertEqual(ItemEvaluacion.objects.count(), 1)
        self.assertEqual(resp.data['bloques'][0]['nombre'], 'Contenido')
        self.assertEqual(resp.data['bloques'][0]['items'][0]['nombre'], 'Examen')

    def test_docente_no_puede_crear_plan_de_materia_ajena(self):
        self.client.force_authenticate(user=self.otro_docente)
        resp = self.client.post(
            f'/api/academico/docente/plan-evaluacion/?materia_id={self.materia.id}&lapso_id={self.lapso.id}',
            {'bloques': [{'nombre': 'Contenido', 'items': []}]},
            format='json',
        )
        self.assertEqual(resp.status_code, 403)
        self.assertEqual(PlanEvaluacion.objects.count(), 0)

    def test_post_duplicado_devuelve_409(self):
        PlanEvaluacion.objects.create(materia=self.materia, lapso=self.lapso)
        self.client.force_authenticate(user=self.docente)
        resp = self.client.post(
            f'/api/academico/docente/plan-evaluacion/?materia_id={self.materia.id}&lapso_id={self.lapso.id}',
            {'bloques': []},
            format='json',
        )
        self.assertEqual(resp.status_code, 409)

    def test_patch_conserva_notas_de_items_que_mantienen_su_id(self):
        plan = PlanEvaluacion.objects.create(materia=self.materia, lapso=self.lapso)
        bloque = BloqueEvaluacion.objects.create(plan=plan, nombre='Contenido', modo='puntos')
        item = ItemEvaluacion.objects.create(bloque=bloque, nombre='Examen', valor_maximo=15)
        NotaItemEvaluacion.objects.create(item=item, alumno=self.alumno, valor_numerico=Decimal('10.00'))

        self.client.force_authenticate(user=self.docente)
        resp = self.client.patch(
            f'/api/academico/docente/plan-evaluacion/?materia_id={self.materia.id}&lapso_id={self.lapso.id}',
            {
                'bloques': [
                    {
                        'id': bloque.id, 'nombre': 'Contenido', 'modo': 'puntos', 'orden': 1,
                        'items': [
                            {'id': item.id, 'nombre': 'Examen (editado)', 'valor_maximo': '15.00', 'orden': 1},
                            {'nombre': 'Nuevo item', 'valor_maximo': '5.00', 'orden': 2},
                        ],
                    },
                ],
            },
            format='json',
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        self.assertEqual(ItemEvaluacion.objects.count(), 2)
        item.refresh_from_db()
        self.assertEqual(item.nombre, 'Examen (editado)')
        # La nota ligada al item original sigue existiendo (mismo PK conservado)
        self.assertTrue(NotaItemEvaluacion.objects.filter(item=item, alumno=self.alumno).exists())

    def test_patch_sin_plan_previo_devuelve_404(self):
        self.client.force_authenticate(user=self.docente)
        resp = self.client.patch(
            f'/api/academico/docente/plan-evaluacion/?materia_id={self.materia.id}&lapso_id={self.lapso.id}',
            {'bloques': []},
            format='json',
        )
        self.assertEqual(resp.status_code, 404)

    def test_notas_get_sin_plan_devuelve_404(self):
        self.client.force_authenticate(user=self.docente)
        resp = self.client.get(
            f'/api/academico/docente/plan-evaluacion/notas/?materia_id={self.materia.id}&lapso_id={self.lapso.id}'
        )
        self.assertEqual(resp.status_code, 404)

    def test_notas_post_guarda_y_get_refleja_total(self):
        plan = PlanEvaluacion.objects.create(materia=self.materia, lapso=self.lapso)
        bloque = BloqueEvaluacion.objects.create(plan=plan, nombre='Contenido', modo='puntos')
        item = ItemEvaluacion.objects.create(bloque=bloque, nombre='Examen', valor_maximo=15)

        self.client.force_authenticate(user=self.docente)
        resp_post = self.client.post('/api/academico/docente/plan-evaluacion/notas/', {
            'materia_id': self.materia.id,
            'lapso_id': self.lapso.id,
            'notas': [{'item_id': item.id, 'alumno_id': self.alumno.id, 'valor_numerico': '13.00'}],
        }, format='json')
        self.assertEqual(resp_post.status_code, 200, resp_post.content)
        self.assertEqual(len(resp_post.data['guardadas']), 1)
        self.assertEqual(len(resp_post.data['errores']), 0)

        resp_get = self.client.get(
            f'/api/academico/docente/plan-evaluacion/notas/?materia_id={self.materia.id}&lapso_id={self.lapso.id}'
        )
        self.assertEqual(resp_get.status_code, 200)
        self.assertEqual(resp_get.data['alumnos'][0]['total'], 13.0)

    def test_notas_post_item_de_otra_materia_reporta_error(self):
        plan = PlanEvaluacion.objects.create(materia=self.materia, lapso=self.lapso)
        bloque = BloqueEvaluacion.objects.create(plan=plan, nombre='Contenido', modo='puntos')
        item = ItemEvaluacion.objects.create(bloque=bloque, nombre='Examen', valor_maximo=15)

        otra_materia = Materia.objects.create(
            nombre='Biología II', grado_seccion='8vo Grado A',
            tipo_evaluacion='numerica', docente=self.docente, activa=True,
        )

        self.client.force_authenticate(user=self.docente)
        resp = self.client.post('/api/academico/docente/plan-evaluacion/notas/', {
            'materia_id': otra_materia.id,
            'lapso_id': self.lapso.id,
            'notas': [{'item_id': item.id, 'alumno_id': self.alumno.id, 'valor_numerico': '13.00'}],
        }, format='json')
        self.assertEqual(resp.status_code, 200, resp.content)
        self.assertEqual(len(resp.data['guardadas']), 0)
        self.assertEqual(len(resp.data['errores']), 1)
