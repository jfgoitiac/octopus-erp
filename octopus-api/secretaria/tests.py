from decimal import Decimal
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.db import connection
from django.db.models.query import QuerySet
from django.test import TestCase
from django.test.utils import CaptureQueriesContext
from rest_framework import serializers as drf_serializers
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from portal.models import RepresentanteUser
from .models import Alumno, ConfiguracionGrado, ConfiguracionSistema, Representante
from .serializers import AlumnoUpdateSerializer, ConfiguracionSistemaSerializer, InscripcionSerializer

User = get_user_model()


class RepresentanteViewSetNPlusOneTest(TestCase):
    """
    RepresentanteCRUDSerializer.get_portal_creado/get_portal_activo acceden a
    obj.portal_user (OneToOne reverso) sin select_related, disparando una
    query extra por representante en el listado.
    """

    def setUp(self):
        self.client = APIClient()
        user = User.objects.create_user(username='sistemas1', password='clave123456')
        token = str(RefreshToken.for_user(user).access_token)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')

        self.representantes = []
        for i in range(5):
            rep = Representante.objects.create(
                cedula=f'V1000000{i}', nombre=f'Rep{i}', apellido='Test',
                correo=f'rep{i}@example.com',
            )
            self.representantes.append(rep)

        # Solo 2 de los 5 tienen portal activado (para variar el resultado)
        for rep in self.representantes[:2]:
            portal_user = User.objects.create_user(username=f'portal_{rep.cedula}', password='x')
            RepresentanteUser.objects.create(representante=rep, user=portal_user, esta_activo=True)

    def test_portal_creado_y_activo_correctos(self):
        resp = self.client.get('/api/secretaria/representantes/')
        self.assertEqual(resp.status_code, 200)
        rows = resp.data['results'] if isinstance(resp.data, dict) and 'results' in resp.data else resp.data
        por_cedula = {r['cedula']: r for r in rows}
        for rep in self.representantes[:2]:
            self.assertTrue(por_cedula[rep.cedula]['portal_creado'])
            self.assertTrue(por_cedula[rep.cedula]['portal_activo'])
        for rep in self.representantes[2:]:
            self.assertFalse(por_cedula[rep.cedula]['portal_creado'])
            self.assertFalse(por_cedula[rep.cedula]['portal_activo'])

    def test_query_count_no_escala_con_cantidad_de_representantes(self):
        with CaptureQueriesContext(connection) as ctx_cinco:
            resp = self.client.get('/api/secretaria/representantes/')
        self.assertEqual(resp.status_code, 200)

        Representante.objects.exclude(pk=self.representantes[0].pk).delete()
        with CaptureQueriesContext(connection) as ctx_uno:
            resp = self.client.get('/api/secretaria/representantes/')
        self.assertEqual(resp.status_code, 200)

        self.assertEqual(len(ctx_cinco.captured_queries), len(ctx_uno.captured_queries))


class _FakeRequest:
    """Suficiente para InscripcionSerializer.create(), que solo lee `.user`."""
    def __init__(self, user):
        self.user = user


def _payload_inscripcion(cedula_rep, cedula_escolar, grado_seccion):
    return {
        'periodo_escolar': '2025-2026',
        'grado_seccion':   grado_seccion,
        'tipo_ingreso':    'nuevo',
        'documentos_completos': True,
        'alumno': {
            'nombre':           'Alumno',
            'apellido':         cedula_escolar,
            'cedula_escolar':   cedula_escolar,
            'fecha_nacimiento': '2015-01-01',
            'genero':           'masculino',
            'representante': {
                'cedula':    cedula_rep,
                'nombre':    'Rep',
                'apellido':  cedula_rep,
                'telefono':  '04120000000',
                'correo':    f'{cedula_rep}@example.com',
                'direccion': 'Calle 1',
            },
        },
    }


class InscripcionLockingCuposTest(TestCase):
    """
    Auditoría 2026-07-07, hallazgo Alto: la validación de cupos disponibles
    se leía sin select_for_update(), a diferencia de Alumno.reactivar(). Dos
    inscripciones concurrentes al último cupo podían pasar ambas.
    """

    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(username='sistemas1', password='clave123456')
        token = str(RefreshToken.for_user(self.user).access_token)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')

        self.config_grado, _ = ConfiguracionGrado.objects.update_or_create(
            grado_seccion='Grado Test Locking', defaults={'cupos_maximos': 1, 'cupos_utilizados': 0}
        )

    def test_create_lockea_configuraciongrado_con_select_for_update(self):
        """El create() del serializer debe bloquear la fila de ConfiguracionGrado
        (mismo patrón que Alumno.reactivar()) antes de validar/crear."""
        payload = _payload_inscripcion('V10000001', 'E10000001', 'Grado Test Locking')
        serializer = InscripcionSerializer(data=payload, context={'request': _FakeRequest(self.user)})
        self.assertTrue(serializer.is_valid(), serializer.errors)

        locked_on = []
        original = QuerySet.select_for_update

        def spy(qs_self, *args, **kwargs):
            locked_on.append(qs_self.model)
            return original(qs_self, *args, **kwargs)

        with patch.object(QuerySet, 'select_for_update', spy):
            serializer.save()

        self.assertIn(ConfiguracionGrado, locked_on)

    def test_segunda_inscripcion_al_ultimo_cupo_no_pasa_aunque_la_validacion_previa_haya_dado_ok(self):
        """
        Simula la condición de carrera de la auditoría: dos requests validan
        el cupo disponible casi al mismo tiempo (ambas ven cupos_disponibles=1
        en su validate() temprano), pero solo la primera en llegar al create()
        bajo lock debe poder consumir el cupo; la segunda debe fallar ahí,
        no antes.
        """
        payload_1 = _payload_inscripcion('V10000001', 'E10000001', 'Grado Test Locking')
        payload_2 = _payload_inscripcion('V10000002', 'E10000002', 'Grado Test Locking')

        serializer_1 = InscripcionSerializer(data=payload_1, context={'request': _FakeRequest(self.user)})
        serializer_2 = InscripcionSerializer(data=payload_2, context={'request': _FakeRequest(self.user)})
        # Ambas pasan la validación temprana: en ese instante el cupo sigue libre.
        self.assertTrue(serializer_1.is_valid(), serializer_1.errors)
        self.assertTrue(serializer_2.is_valid(), serializer_2.errors)

        # La primera en llegar al create() bajo lock consume el único cupo.
        serializer_1.save()
        self.config_grado.refresh_from_db()
        self.assertEqual(self.config_grado.cupos_utilizados, 1)

        # La segunda, aunque su validate() temprano dio OK, debe ser rechazada
        # por la relectura bajo select_for_update() dentro de create().
        with self.assertRaises(drf_serializers.ValidationError):
            serializer_2.save()

        self.config_grado.refresh_from_db()
        self.assertEqual(self.config_grado.cupos_utilizados, 1)
        self.assertEqual(self.config_grado.cupos_disponibles, 0)


class InscripcionPeriodoCerradoTest(TestCase):
    """
    El sistema permitía crear inscripciones aunque el período configurado
    (ConfiguracionSistema.fecha_inicio/fin_inscripciones) ya estuviera
    cerrado: `inscripciones_abiertas` solo se usaba como badge visual en
    Configuracion.jsx, sin ningún chequeo real en el serializer.
    """

    def setUp(self):
        from datetime import date, timedelta

        self.client = APIClient()
        self.user = User.objects.create_user(username='sistemas1', password='clave123456')
        ConfiguracionGrado.objects.update_or_create(
            grado_seccion='Grado Test Periodo', defaults={'cupos_maximos': 10, 'cupos_utilizados': 0}
        )
        self.hoy = date.today()
        self.timedelta = timedelta

    def test_no_permite_inscribir_con_periodo_cerrado(self):
        ConfiguracionSistema.objects.create(
            fecha_inicio_inscripciones=self.hoy - self.timedelta(days=60),
            fecha_fin_inscripciones=self.hoy - self.timedelta(days=30),
            fecha_inicio_ano_escolar=self.hoy - self.timedelta(days=300),
            fecha_fin_ano_escolar=self.hoy + self.timedelta(days=60),
        )
        payload = _payload_inscripcion('V20000001', 'E20000001', 'Grado Test Periodo')
        serializer = InscripcionSerializer(data=payload, context={'request': _FakeRequest(self.user)})
        self.assertFalse(serializer.is_valid())
        self.assertIn('non_field_errors', serializer.errors)
        self.assertIn('cerrado', str(serializer.errors['non_field_errors']))

    def test_permite_inscribir_con_periodo_abierto(self):
        ConfiguracionSistema.objects.create(
            fecha_inicio_inscripciones=self.hoy - self.timedelta(days=10),
            fecha_fin_inscripciones=self.hoy + self.timedelta(days=10),
            fecha_inicio_ano_escolar=self.hoy - self.timedelta(days=300),
            fecha_fin_ano_escolar=self.hoy + self.timedelta(days=60),
        )
        payload = _payload_inscripcion('V20000002', 'E20000002', 'Grado Test Periodo')
        serializer = InscripcionSerializer(data=payload, context={'request': _FakeRequest(self.user)})
        self.assertTrue(serializer.is_valid(), serializer.errors)


class CargoEspecialBloqueoInscripcionTest(TestCase):
    """
    PASO 2 de la generalización de CuotaProyectoInversion (ver
    cobranza/mora.py, cobranza/models.py::TipoCargoEspecial): el bloqueo de
    inscripción ahora depende de tipo_concepto.bloquea_inscripcion, no de
    "cualquier CuotaProyectoInversion impaga".
    """

    def setUp(self):
        from cobranza.models import CuotaProyectoInversion, TipoCargoEspecial

        self.client = APIClient()
        self.user = User.objects.create_user(username='sistemas_cargo', password='clave123456')
        ConfiguracionGrado.objects.update_or_create(
            grado_seccion='Grado Test Cargo Especial', defaults={'cupos_maximos': 10, 'cupos_utilizados': 0}
        )
        self.representante = Representante.objects.create(
            cedula='V30000001', nombre='Rep', apellido='Bloqueo', correo='v30000001@example.com',
        )
        self.TipoCargoEspecial = TipoCargoEspecial
        self.CuotaProyectoInversion = CuotaProyectoInversion

    def test_cargo_bloqueante_impago_bloquea_inscripcion(self):
        tipo = self.TipoCargoEspecial.objects.create(
            nombre='Cargo Bloqueante Test', monto_defecto_usd=Decimal('30.00'),
            bloquea_inscripcion=True,
        )
        self.CuotaProyectoInversion.objects.create(
            representante=self.representante, periodo_escolar='2025-2026',
            tipo_concepto=tipo, monto_usd=Decimal('30.00'),
        )

        payload = _payload_inscripcion('V30000001', 'E30000001', 'Grado Test Cargo Especial')
        serializer = InscripcionSerializer(data=payload, context={'request': _FakeRequest(self.user)})
        self.assertTrue(serializer.is_valid(), serializer.errors)
        with self.assertRaises(drf_serializers.ValidationError) as ctx:
            serializer.save()
        self.assertIn('Cargo Bloqueante Test', str(ctx.exception))

    def test_cargo_no_bloqueante_impago_no_bloquea_inscripcion(self):
        tipo = self.TipoCargoEspecial.objects.create(
            nombre='Cargo No Bloqueante Test', monto_defecto_usd=Decimal('15.00'),
            bloquea_inscripcion=False,
        )
        self.CuotaProyectoInversion.objects.create(
            representante=self.representante, periodo_escolar='2025-2026',
            tipo_concepto=tipo, monto_usd=Decimal('15.00'),
        )

        payload = _payload_inscripcion('V30000001', 'E30000002', 'Grado Test Cargo Especial')
        serializer = InscripcionSerializer(data=payload, context={'request': _FakeRequest(self.user)})
        self.assertTrue(serializer.is_valid(), serializer.errors)
        serializer.save()  # no debe lanzar ValidationError


class AlumnoUpdateSerializerReasignarRepresentanteTest(TestCase):
    """
    Caso real reportado: un alumno quedó vinculado al representante equivocado
    (cédula mal tipeada). Al corregir la cédula en la edición del alumno, el
    alumno debe reasignarse al representante correcto (existente) en vez de
    sobrescribir los datos del representante actualmente vinculado.
    """

    def setUp(self):
        self.rep_incorrecto = Representante.objects.create(
            cedula='V11111111', nombre='Luis', apellido='Perez',
            telefono='0414-0000001', correo='luis@example.com', direccion='Dir 1',
        )
        self.rep_correcto = Representante.objects.create(
            cedula='V22222222', nombre='Jose', apellido='Gomez',
            telefono='0414-0000002', correo='jose@example.com', direccion='Dir 2',
        )
        self.alumno = Alumno.objects.create(
            nombre='Pedro', apellido='Ramirez', representante=self.rep_incorrecto,
        )

    def test_cambiar_cedula_a_representante_existente_reasigna_y_actualiza_sus_datos(self):
        payload = {
            'nombre': 'Pedro', 'apellido': 'Ramirez',
            'representante': {
                'cedula': self.rep_correcto.cedula,
                # El usuario corrige a la vez el correo y la dirección del representante
                # correcto (caso reportado: no lo dejaba editar esos datos al reasignar).
                'nombre': 'Jose', 'apellido': 'Gomez',
                'telefono': '0414-0000002', 'correo': 'jose.nuevo@example.com',
                'direccion': 'Dir Nueva 456', 'nacionalidad': '', 'nivel_estudio': '',
            },
        }
        serializer = AlumnoUpdateSerializer(instance=self.alumno, data=payload, partial=True)
        self.assertTrue(serializer.is_valid(), serializer.errors)
        alumno_actualizado = serializer.save()

        self.assertEqual(alumno_actualizado.representante_id, self.rep_correcto.id)

        self.rep_correcto.refresh_from_db()
        self.assertEqual(self.rep_correcto.correo, 'jose.nuevo@example.com')
        self.assertEqual(self.rep_correcto.direccion, 'Dir Nueva 456')

        self.rep_incorrecto.refresh_from_db()
        self.assertEqual(self.rep_incorrecto.nombre, 'Luis')
        self.assertEqual(self.rep_incorrecto.correo, 'luis@example.com')
        self.assertFalse(Alumno.objects.filter(representante=self.rep_incorrecto).exists())

    def test_cambiar_cedula_a_una_no_registrada_crea_representante_nuevo(self):
        payload = {
            'nombre': 'Pedro', 'apellido': 'Ramirez',
            'representante': {
                'cedula': 'V33333333',
                'nombre': 'Maria', 'apellido': 'Torres',
                'telefono': '0414-0000003', 'correo': 'maria@example.com',
                'direccion': 'Dir 3', 'nacionalidad': '', 'nivel_estudio': '',
            },
        }
        serializer = AlumnoUpdateSerializer(instance=self.alumno, data=payload, partial=True)
        self.assertTrue(serializer.is_valid(), serializer.errors)
        alumno_actualizado = serializer.save()

        self.assertNotEqual(alumno_actualizado.representante_id, self.rep_incorrecto.id)
        self.assertEqual(alumno_actualizado.representante.cedula, 'V33333333')
        self.assertEqual(alumno_actualizado.representante.nombre, 'Maria')

        self.rep_incorrecto.refresh_from_db()
        self.assertEqual(self.rep_incorrecto.nombre, 'Luis')

    def test_editar_sin_cambiar_cedula_actualiza_representante_actual_in_place(self):
        payload = {
            'nombre': 'Pedro', 'apellido': 'Ramirez',
            'representante': {
                'cedula': self.rep_incorrecto.cedula,
                'nombre': 'Luis Editado', 'apellido': 'Perez',
                'telefono': '0414-9999999', 'correo': 'luis@example.com',
                'direccion': 'Dir 1', 'nacionalidad': '', 'nivel_estudio': '',
            },
        }
        serializer = AlumnoUpdateSerializer(instance=self.alumno, data=payload, partial=True)
        self.assertTrue(serializer.is_valid(), serializer.errors)
        alumno_actualizado = serializer.save()

        self.assertEqual(alumno_actualizado.representante_id, self.rep_incorrecto.id)
        self.rep_incorrecto.refresh_from_db()
        self.assertEqual(self.rep_incorrecto.nombre, 'Luis Editado')
        self.assertEqual(self.rep_incorrecto.telefono, '0414-9999999')


class AlumnoUpdateInfoEndpointReasignarRepresentanteTest(TestCase):
    """
    Mismo caso que AlumnoUpdateSerializerReasignarRepresentanteTest pero disparado
    a través del endpoint HTTP real (PATCH /secretaria/alumnos/<id>/update_info/)
    que usa el frontend, y del endpoint de autocompletado por cédula
    (GET /secretaria/representante/<cedula>/) que usa el modal de edición.
    """

    def setUp(self):
        self.client = APIClient()
        user = User.objects.create_superuser(username='secretaria1', password='clave123456', email='s1@example.com')
        token = str(RefreshToken.for_user(user).access_token)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')

        self.rep_incorrecto = Representante.objects.create(
            cedula='V11111111', nombre='Luis', apellido='Perez',
            telefono='0414-0000001', correo='luis@example.com', direccion='Dir 1',
        )
        self.rep_correcto = Representante.objects.create(
            cedula='V22222222', nombre='Jose', apellido='Gomez',
            telefono='0414-0000002', correo='jose@example.com', direccion='Dir 2',
        )
        self.alumno = Alumno.objects.create(
            nombre='Pedro', apellido='Ramirez', representante=self.rep_incorrecto,
        )

    def test_autocompletado_encuentra_al_representante_correcto_por_cedula(self):
        resp = self.client.get(f'/api/secretaria/representante/{self.rep_correcto.cedula}/')
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp.data['existe'])
        self.assertEqual(resp.data['nombre'], 'Jose')

    def test_patch_update_info_con_cedula_de_otro_representante_reasigna_via_http(self):
        payload = {
            'nombre': 'Pedro', 'apellido': 'Ramirez',
            'representante': {
                'id': self.rep_correcto.id,
                'cedula': self.rep_correcto.cedula,
                'nombre': 'Jose', 'apellido': 'Gomez',
                # Corrige también el correo y la dirección del representante correcto
                # en el mismo guardado.
                'telefono': '0414-0000002', 'correo': 'jose.corregido@example.com',
                'direccion': 'Dir Corregida 789', 'nacionalidad': '', 'nivel_estudio': '',
            },
        }
        resp = self.client.patch(
            f'/api/secretaria/alumnos/{self.alumno.id}/update_info/', payload, format='json'
        )
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data['representante']['cedula'], self.rep_correcto.cedula)
        self.assertEqual(resp.data['representante']['correo'], 'jose.corregido@example.com')
        self.assertEqual(resp.data['representante']['direccion'], 'Dir Corregida 789')

        self.alumno.refresh_from_db()
        self.assertEqual(self.alumno.representante_id, self.rep_correcto.id)
        self.assertFalse(Alumno.objects.filter(representante=self.rep_incorrecto).exists())

        self.rep_correcto.refresh_from_db()
        self.assertEqual(self.rep_correcto.correo, 'jose.corregido@example.com')


class ConfiguracionSistemaSerializerFaviconTest(TestCase):
    """Validación del campo favicon (peso y formato), sibling de _validar_logo."""

    def _config_data(self, **overrides):
        data = {
            'fecha_inicio_inscripciones': '2025-01-01',
            'fecha_fin_inscripciones': '2025-02-01',
            'fecha_inicio_ano_escolar': '2025-09-01',
            'fecha_fin_ano_escolar': '2026-07-31',
        }
        data.update(overrides)
        return data

    def test_favicon_valido_pasa_validacion(self):
        # PNG real — ImageField valida el contenido con PIL, no solo la extensión.
        import io
        from PIL import Image
        buffer = io.BytesIO()
        Image.new('RGB', (16, 16)).save(buffer, format='PNG')
        favicon = SimpleUploadedFile('favicon.png', buffer.getvalue(), content_type='image/png')
        serializer = ConfiguracionSistemaSerializer(data=self._config_data(favicon=favicon))
        self.assertTrue(serializer.is_valid(), serializer.errors)

    def test_favicon_muy_pesado_falla(self):
        # Imagen real (no solo bytes) con ruido para que no comprima por debajo
        # del límite — así se ejercita el chequeo de tamaño de _validar_favicon,
        # no la validación de formato de ImageField.
        import io
        import random
        from PIL import Image
        buffer = io.BytesIO()
        pixeles = bytes(random.getrandbits(8) for _ in range(600 * 600 * 3))
        Image.frombytes('RGB', (600, 600), pixeles).save(buffer, format='PNG')
        favicon = SimpleUploadedFile('favicon.png', buffer.getvalue(), content_type='image/png')
        self.assertGreater(favicon.size, 512 * 1024)
        serializer = ConfiguracionSistemaSerializer(data=self._config_data(favicon=favicon))
        self.assertFalse(serializer.is_valid())
        self.assertIn('favicon', serializer.errors)

    def test_favicon_formato_no_soportado_falla(self):
        import io
        from PIL import Image
        buffer = io.BytesIO()
        Image.new('RGB', (1, 1)).save(buffer, format='GIF')
        favicon = SimpleUploadedFile('favicon.gif', buffer.getvalue(), content_type='image/gif')
        serializer = ConfiguracionSistemaSerializer(data=self._config_data(favicon=favicon))
        self.assertFalse(serializer.is_valid())
        self.assertIn('favicon', serializer.errors)
