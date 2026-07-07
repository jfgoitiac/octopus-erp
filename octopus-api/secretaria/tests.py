from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.db import connection
from django.db.models.query import QuerySet
from django.test import TestCase
from django.test.utils import CaptureQueriesContext
from rest_framework import serializers as drf_serializers
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from portal.models import RepresentanteUser
from .models import ConfiguracionGrado, Representante
from .serializers import InscripcionSerializer

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
