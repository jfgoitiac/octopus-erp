from django.contrib.auth import get_user_model
from django.db import connection
from django.test import TestCase
from django.test.utils import CaptureQueriesContext
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from portal.models import RepresentanteUser
from .models import Representante

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
