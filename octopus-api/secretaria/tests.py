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
from usuarios.models import LogAuditoria
from .models import Alumno, ConfiguracionGrado, ConfiguracionSistema, Inscripcion, Representante
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


class EliminacionRepresentanteTest(TestCase):
    """
    Alineación de permisos backend/frontend para eliminar representantes:
    - destroy (soft-delete) y eliminar_definitivo_manual (borrado físico
      manual desde el módulo Representantes) exigen IsFinanzasOrAbove
      (director, administrador, cobranza) — no IsSystemAdminOrDirector
      (que incluía 'sistemas' y excluía 'cobranza').
    - eliminar_definitivo_manual solo procede con 0 alumnos (ni activos ni
      retirados); si tiene alguno, 400 y no borra nada.
    - eliminar_definitivo (histórico, usado por Limpieza de Datos) sigue sin
      esa restricción.
    """
    _contador_cedula = 0

    def setUp(self):
        self.client = APIClient()

    def _crear_usuario(self, rol):
        EliminacionRepresentanteTest._contador_cedula += 1
        user = User.objects.create_user(
            username=f'user_{rol}_{EliminacionRepresentanteTest._contador_cedula}',
            password='clave123456',
        )
        user.perfil.rol = rol
        user.perfil.esta_activo = True
        user.perfil.save()
        return user

    def _client_como(self, rol):
        user = self._crear_usuario(rol)
        client = APIClient()
        token = str(RefreshToken.for_user(user).access_token)
        client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')
        return client

    def _crear_representante(self):
        EliminacionRepresentanteTest._contador_cedula += 1
        n = EliminacionRepresentanteTest._contador_cedula
        return Representante.objects.create(
            cedula=f'V30{n:06d}', nombre='Rep', apellido=f'Test{n}',
            correo=f'rep{n}@example.com',
        )

    # ── destroy (soft-delete) ────────────────────────────────────────────

    def test_soft_delete_permitido_director_administrador_cobranza(self):
        for rol in ['director', 'administrador', 'cobranza']:
            rep = self._crear_representante()
            client = self._client_como(rol)
            resp = client.delete(f'/api/secretaria/representantes/{rep.id}/')
            self.assertEqual(resp.status_code, 204, (rol, resp.data))
            rep.refresh_from_db()
            self.assertFalse(rep.activo)

    def test_soft_delete_denegado_cajero_docente(self):
        for rol in ['cajero', 'docente']:
            rep = self._crear_representante()
            client = self._client_como(rol)
            resp = client.delete(f'/api/secretaria/representantes/{rep.id}/')
            self.assertEqual(resp.status_code, 403, (rol, resp.data))
            rep.refresh_from_db()
            self.assertTrue(rep.activo)

    def test_soft_delete_denegado_secretaria(self):
        # Explícitamente definido: secretaria puede ver/atender representantes
        # (ROLE_GROUPS.ATENCION_FAMILIAS en el frontend) pero NO eliminar
        # (IsFinanzasOrAbove no la incluye) — no debe ver el botón, y si de
        # todas formas llega la petición, el backend la rechaza.
        rep = self._crear_representante()
        client = self._client_como('secretaria')
        resp = client.delete(f'/api/secretaria/representantes/{rep.id}/')
        self.assertEqual(resp.status_code, 403, resp.data)
        rep.refresh_from_db()
        self.assertTrue(rep.activo)

    def test_soft_delete_retira_alumnos_y_preserva_historial_financiero(self):
        from cobranza.models import CuotaInscripcion

        rep = self._crear_representante()
        alumno = Alumno.objects.create(nombre='Hijo', apellido='Uno', representante=rep)
        cuota = CuotaInscripcion.objects.create(
            alumno=alumno, periodo_escolar='2025-2026', monto_usd=Decimal('50.00'), pagado=True,
        )

        client = self._client_como('director')
        resp = client.delete(f'/api/secretaria/representantes/{rep.id}/')
        self.assertEqual(resp.status_code, 204, resp.data)

        rep.refresh_from_db()
        alumno.refresh_from_db()
        self.assertFalse(rep.activo)
        self.assertFalse(alumno.activo)
        self.assertTrue(CuotaInscripcion.objects.filter(pk=cuota.pk).exists())

    def test_soft_delete_queda_auditado(self):
        rep = self._crear_representante()
        client = self._client_como('director')
        resp = client.delete(f'/api/secretaria/representantes/{rep.id}/')
        self.assertEqual(resp.status_code, 204, resp.data)
        self.assertTrue(
            LogAuditoria.objects.filter(accion="ELIMINACION_REPRESENTANTE", detalles__representante_id=rep.id).exists()
        )

    # ── eliminar_definitivo_manual ───────────────────────────────────────

    def test_eliminacion_definitiva_0_alumnos_borra_y_libera_cedula(self):
        rep = self._crear_representante()
        cedula = rep.cedula
        client = self._client_como('director')

        resp = client.delete(f'/api/secretaria/representantes/{rep.id}/eliminar_definitivo_manual/')
        self.assertEqual(resp.status_code, 204, resp.data)
        self.assertFalse(Representante.objects.filter(pk=rep.pk).exists())

        nuevo = Representante.objects.create(cedula=cedula, nombre='Reusa', apellido='Cedula')
        self.assertTrue(Representante.objects.filter(pk=nuevo.pk).exists())

    def test_eliminacion_definitiva_roles_permitidos_y_denegados(self):
        for rol in ['director', 'administrador', 'cobranza']:
            rep = self._crear_representante()
            client = self._client_como(rol)
            resp = client.delete(f'/api/secretaria/representantes/{rep.id}/eliminar_definitivo_manual/')
            self.assertEqual(resp.status_code, 204, (rol, resp.data))

        for rol in ['cajero', 'docente']:
            rep = self._crear_representante()
            client = self._client_como(rol)
            resp = client.delete(f'/api/secretaria/representantes/{rep.id}/eliminar_definitivo_manual/')
            self.assertEqual(resp.status_code, 403, (rol, resp.data))
            self.assertTrue(Representante.objects.filter(pk=rep.pk).exists())

    def test_eliminacion_definitiva_con_alumnos_retirados_rechaza_y_preserva(self):
        rep = self._crear_representante()
        alumno = Alumno.objects.create(nombre='Retirado', apellido='Uno', representante=rep, activo=False)
        client = self._client_como('director')

        resp = client.delete(f'/api/secretaria/representantes/{rep.id}/eliminar_definitivo_manual/')
        self.assertEqual(resp.status_code, 400, resp.data)
        self.assertTrue(Representante.objects.filter(pk=rep.pk).exists())
        self.assertTrue(Alumno.todos.filter(pk=alumno.pk).exists())

    def test_eliminacion_definitiva_borra_fks_protegidas_y_cuenta_de_portal(self):
        from cobranza.models import CuotaProyectoInversion, SolvenciaRepresentante, TipoCargoEspecial

        rep = self._crear_representante()
        tipo = TipoCargoEspecial.objects.create(nombre='Proyecto Test', monto_defecto_usd=Decimal('100.00'))
        CuotaProyectoInversion.objects.create(
            representante=rep, periodo_escolar='2025-2026', tipo_concepto=tipo,
            numero_cuota=1, monto_usd=Decimal('100.00'),
        )
        SolvenciaRepresentante.objects.create(
            representante=rep, numero='SOLV-TEST-0001', periodo_escolar='2025-2026',
        )
        portal_django_user = User.objects.create_user(username=f'portal_{rep.cedula}', password='x')
        RepresentanteUser.objects.create(representante=rep, user=portal_django_user, esta_activo=True)

        client = self._client_como('administrador')
        resp = client.delete(f'/api/secretaria/representantes/{rep.id}/eliminar_definitivo_manual/')
        self.assertEqual(resp.status_code, 204, resp.data)

        self.assertFalse(Representante.objects.filter(pk=rep.pk).exists())
        self.assertFalse(CuotaProyectoInversion.objects.filter(representante_id=rep.pk).exists())
        self.assertFalse(SolvenciaRepresentante.objects.filter(representante_id=rep.pk).exists())
        self.assertFalse(User.objects.filter(pk=portal_django_user.pk).exists())

    def test_eliminacion_definitiva_manual_queda_auditada(self):
        rep = self._crear_representante()
        client = self._client_como('cobranza')
        resp = client.delete(f'/api/secretaria/representantes/{rep.id}/eliminar_definitivo_manual/')
        self.assertEqual(resp.status_code, 204, resp.data)
        self.assertTrue(
            LogAuditoria.objects.filter(
                accion="ELIMINACION_DEFINITIVA_REPRESENTANTE", detalles__representante_id=rep.id,
            ).exists()
        )

    # ── eliminar_definitivo (histórico, Limpieza de Datos) sigue igual ──

    def test_eliminar_definitivo_historico_sigue_sin_restriccion_de_alumnos(self):
        rep = self._crear_representante()
        Alumno.objects.create(nombre='Activo', apellido='Uno', representante=rep)
        client = self._client_como('director')

        resp = client.delete(f'/api/secretaria/representantes/{rep.id}/eliminar_definitivo/')
        self.assertEqual(resp.status_code, 204, resp.data)
        self.assertFalse(Representante.objects.filter(pk=rep.pk).exists())

    def test_eliminar_definitivo_historico_denegado_a_cobranza(self):
        # eliminar_definitivo (Limpieza de Datos) sigue exigiendo
        # IsSystemAdminOrDirector — cobranza NO debe poder invocarlo, a
        # diferencia de eliminar_definitivo_manual.
        rep = self._crear_representante()
        client = self._client_como('cobranza')
        resp = client.delete(f'/api/secretaria/representantes/{rep.id}/eliminar_definitivo/')
        self.assertEqual(resp.status_code, 403, resp.data)
        self.assertTrue(Representante.objects.filter(pk=rep.pk).exists())


class InscripcionStatsViewTest(TestCase):
    """
    Indicador de inscripciones para el Dashboard administrativo
    (InscripcionStatsView, GET /api/secretaria/inscripciones/stats/).

    Se usa un período arbitrario ("2030-2031") distinto del default de campo
    de Inscripcion/ConfiguracionSistema ("2025-2026") a propósito: si alguien
    reintroduce un literal de período en el endpoint, estos tests deben
    fallar en vez de pasar "por casualidad" con el mismo valor que el default.
    """

    PERIODO = '2030-2031'

    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(username='sistemas_stats', password='clave123456')
        token = str(RefreshToken.for_user(self.user).access_token)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')
        self.url = '/api/secretaria/inscripciones/stats/'

    def _crear_config(self, **overrides):
        from datetime import date
        defaults = dict(
            fecha_inicio_inscripciones=date(2030, 6, 1),
            fecha_fin_inscripciones=date(2030, 8, 31),
            fecha_inicio_ano_escolar=date(2030, 9, 1),
            fecha_fin_ano_escolar=date(2031, 7, 31),
            periodo_escolar_activo=self.PERIODO,
        )
        defaults.update(overrides)
        return ConfiguracionSistema.objects.create(**defaults)

    def _crear_inscripcion(self, cedula_alumno, grado_seccion, tipo_ingreso='nuevo',
                            documentos_completos=True, periodo=None, fecha_inscripcion=None):
        # Inscripcion.clean() exige que el grado ya esté configurado
        # (ConfiguracionGrado) y con cupos disponibles. Se crea con capacidad
        # amplia por defecto si el test no lo configuró explícitamente antes
        # (ej. para probar "sin_cupos" con una capacidad reducida a propósito).
        ConfiguracionGrado.objects.get_or_create(
            grado_seccion=grado_seccion, defaults={'cupos_maximos': 1000}
        )
        rep = Representante.objects.create(
            cedula=f'V{cedula_alumno}', nombre='Rep', apellido=cedula_alumno,
            correo=f'{cedula_alumno}@example.com',
        )
        alumno = Alumno.objects.create(
            cedula_escolar=cedula_alumno, nombre='Alumno', apellido=cedula_alumno,
            representante=rep,
        )
        insc = Inscripcion.objects.create(
            alumno=alumno,
            periodo_escolar=periodo or self.PERIODO,
            grado_seccion=grado_seccion,
            tipo_ingreso=tipo_ingreso,
            documentos_completos=documentos_completos,
            usuario_registro=self.user,
        )
        if fecha_inscripcion is not None:
            # fecha_inscripcion es auto_now_add: no se puede fijar en el
            # create(), se sobrescribe después con un update() directo.
            Inscripcion.objects.filter(pk=insc.pk).update(fecha_inscripcion=fecha_inscripcion)
            insc.refresh_from_db()
        return insc

    # ── 400 sin configuración ────────────────────────────────────────────

    def test_400_sin_configuracionsistema_y_sin_periodo_override(self):
        resp = self.client.get(self.url)
        self.assertEqual(resp.status_code, 400, resp.data)
        self.assertIn('error', resp.data)

    # ── período ───────────────────────────────────────────────────────────

    def test_usa_periodo_de_configuracionsistema_no_hardcodeado(self):
        self._crear_config()
        self._crear_inscripcion('E1000001', 'Grado A')

        resp = self.client.get(self.url)
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data['periodo_escolar'], self.PERIODO)
        self.assertNotEqual(resp.data['periodo_escolar'], '2025-2026')

    def test_periodo_override_por_query_param(self):
        self._crear_config()  # periodo_escolar_activo = self.PERIODO
        self._crear_inscripcion('E1000002', 'Grado A', periodo='2099-2100')

        resp = self.client.get(self.url, {'periodo': '2099-2100'})
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data['periodo_escolar'], '2099-2100')
        self.assertEqual(resp.data['total_inscritos'], 1)

    # ── por_tipo_ingreso / documentos_pendientes ────────────────────────

    def test_por_tipo_ingreso_y_documentos_pendientes(self):
        self._crear_config()
        self._crear_inscripcion('E1000003', 'Grado A', tipo_ingreso='nuevo', documentos_completos=False)
        self._crear_inscripcion('E1000004', 'Grado A', tipo_ingreso='nuevo', documentos_completos=True)
        self._crear_inscripcion('E1000005', 'Grado B', tipo_ingreso='regular', documentos_completos=True)

        resp = self.client.get(self.url)
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data['total_inscritos'], 3)
        self.assertEqual(resp.data['por_tipo_ingreso'], {'nuevo_ingreso': 2, 'regular': 1})
        self.assertEqual(resp.data['documentos_pendientes'], 1)

    # ── ocupacion.por_grado (incluyendo sin_cupos) ──────────────────────

    def test_ocupacion_por_grado_incluye_sin_cupos(self):
        # cupos_utilizados arranca en 0: Inscripcion.save() lo incrementa
        # atómicamente en cada creación (ver secretaria/models.py), así que
        # "Grado Lleno" llega a cupos_disponibles=0 tras las 2 inscripciones
        # de más abajo, sin necesidad (ni permiso, por clean()) de precargarlo.
        ConfiguracionGrado.objects.update_or_create(
            grado_seccion='Grado Lleno', defaults={'cupos_maximos': 2, 'cupos_utilizados': 0}
        )
        ConfiguracionGrado.objects.update_or_create(
            grado_seccion='Grado Libre', defaults={'cupos_maximos': 10, 'cupos_utilizados': 0}
        )
        self._crear_config()
        self._crear_inscripcion('E1000006', 'Grado Lleno')
        self._crear_inscripcion('E1000007', 'Grado Lleno')
        self._crear_inscripcion('E1000008', 'Grado Libre')

        resp = self.client.get(self.url)
        self.assertEqual(resp.status_code, 200, resp.data)
        por_grado = {row['grado_seccion']: row for row in resp.data['ocupacion']['por_grado']}

        self.assertEqual(por_grado['Grado Lleno']['inscritos'], 2)
        self.assertEqual(por_grado['Grado Lleno']['cupos_disponibles'], 0)
        self.assertTrue(por_grado['Grado Lleno']['sin_cupos'])
        self.assertEqual(por_grado['Grado Lleno']['pct'], 100.0)

        self.assertEqual(por_grado['Grado Libre']['inscritos'], 1)
        self.assertFalse(por_grado['Grado Libre']['sin_cupos'])
        self.assertEqual(por_grado['Grado Libre']['cupos_disponibles'], 9)
        self.assertEqual(por_grado['Grado Libre']['pct'], 10.0)

        # global_pct = total_inscritos (3) / suma de cupos_maximos de TODOS
        # los grados existentes (decisión documentada en la vista).
        total_cupos = sum(cfg.cupos_maximos for cfg in ConfiguracionGrado.objects.all())
        esperado = round(3 / total_cupos * 100, 2)
        self.assertEqual(resp.data['ocupacion']['global_pct'], esperado)

    # ── serie_mensual (incluyendo mes sin inscripciones) ────────────────

    def test_serie_mensual_incluye_meses_sin_inscripciones(self):
        from datetime import datetime, timezone as dt_timezone

        self._crear_config()  # año escolar 2030-09-01..2031-07-31 (11 meses)
        self._crear_inscripcion(
            'E1000009', 'Grado A',
            fecha_inscripcion=datetime(2030, 9, 15, tzinfo=dt_timezone.utc),
        )
        self._crear_inscripcion(
            'E1000010', 'Grado A',
            fecha_inscripcion=datetime(2030, 9, 20, tzinfo=dt_timezone.utc),
        )
        self._crear_inscripcion(
            'E1000011', 'Grado A',
            fecha_inscripcion=datetime(2031, 1, 5, tzinfo=dt_timezone.utc),
        )
        # Octubre 2030 no tiene ninguna inscripción — debe aparecer con cantidad 0.

        resp = self.client.get(self.url)
        self.assertEqual(resp.status_code, 200, resp.data)
        serie = {row['mes']: row['cantidad'] for row in resp.data['serie_mensual']}

        self.assertEqual(serie.get('2030-09'), 2)
        self.assertEqual(serie.get('2030-10'), 0)
        self.assertEqual(serie.get('2031-01'), 1)
        # Rango completo 2030-09..2031-07 = 11 meses.
        self.assertEqual(len(serie), 11)

    # Nota: no se encontró un patrón de test reutilizable para
    # filtrado por sede/PermisoSede en secretaria/tests.py ni en
    # cobranza/tests.py (ningún test existente crea Sede/PermisoSede), así
    # que se omitió el caso "usuario con acceso a una sola sede no debe ver
    # inscripciones de otra sede" en vez de inventar un fixture nuevo sin
    # precedente en el proyecto — queda pendiente si se define ese patrón.

    # ── visible: ventana ampliada (-5 días antes / +15 días después) ───

    def test_visible_true_dentro_de_ventana_antes_de_apertura(self):
        # fecha_inicio_inscripciones = hoy + 3 días: todavía no abrió, pero
        # cae dentro de la ventana de -5 días antes de la apertura.
        from datetime import timedelta
        from django.utils import timezone
        hoy = timezone.now().date()
        self._crear_config(
            fecha_inicio_inscripciones=hoy + timedelta(days=3),
            fecha_fin_inscripciones=hoy + timedelta(days=60),
        )

        resp = self.client.get(self.url)
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertTrue(resp.data['visible'])

    def test_visible_false_fuera_de_ventana_antes_de_apertura(self):
        # fecha_inicio_inscripciones = hoy + 10 días: fuera de la ventana de
        # -5 días antes de la apertura, todavía no debe mostrarse.
        from datetime import timedelta
        from django.utils import timezone
        hoy = timezone.now().date()
        self._crear_config(
            fecha_inicio_inscripciones=hoy + timedelta(days=10),
            fecha_fin_inscripciones=hoy + timedelta(days=60),
        )

        resp = self.client.get(self.url)
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertFalse(resp.data['visible'])

    def test_visible_true_dentro_de_ventana_despues_de_cierre(self):
        # fecha_fin_inscripciones = hoy - 10 días: ya cerró, pero cae dentro
        # de la ventana de +15 días después del cierre.
        from datetime import timedelta
        from django.utils import timezone
        hoy = timezone.now().date()
        self._crear_config(
            fecha_inicio_inscripciones=hoy - timedelta(days=90),
            fecha_fin_inscripciones=hoy - timedelta(days=10),
        )

        resp = self.client.get(self.url)
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertTrue(resp.data['visible'])

    def test_visible_false_fuera_de_ventana_despues_de_cierre(self):
        # fecha_fin_inscripciones = hoy - 20 días: ya pasaron los 15 días de
        # margen tras el cierre, no debe mostrarse.
        from datetime import timedelta
        from django.utils import timezone
        hoy = timezone.now().date()
        self._crear_config(
            fecha_inicio_inscripciones=hoy - timedelta(days=90),
            fecha_fin_inscripciones=hoy - timedelta(days=20),
        )

        resp = self.client.get(self.url)
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertFalse(resp.data['visible'])

    def test_visible_true_con_periodo_override_ignora_ventana_de_fechas(self):
        # ?periodo= explícito apuntando a un período distinto al activo: el
        # bypass debe forzar visible=True aunque las fechas de
        # ConfiguracionSistema estén muy fuera de cualquier ventana razonable.
        from datetime import timedelta
        from django.utils import timezone
        hoy = timezone.now().date()
        self._crear_config(
            fecha_inicio_inscripciones=hoy - timedelta(days=1000),
            fecha_fin_inscripciones=hoy - timedelta(days=900),
        )
        self._crear_inscripcion('E1000012', 'Grado A', periodo='2099-2100')

        resp = self.client.get(self.url, {'periodo': '2099-2100'})
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertTrue(resp.data['visible'])
