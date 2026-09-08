"""
Tests del CRUD de membresía del grupo de firma delegada
(`GET/POST/DELETE /api/constancias/firma-delegada/...`).

Cubre:
- Permiso denegado (403) a roles no autorizados (secretaria).
- Agregar/quitar funciona y ambas operaciones son idempotentes.
- 404 si el user_id no existe.

Mismo patrón de `ROOT_URLCONF` mínimo que test_permissions.py / test_views.py,
porque `constancias/urls.py` todavía no está enganchado en `config/urls.py`.
"""
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.test import TestCase, override_settings
from django.urls import include, path
from rest_framework.test import APIClient

from constancias.permissions import NOMBRE_GRUPO_FIRMA_DELEGADA
from constancias.urls import urlpatterns as constancias_urlpatterns

urlpatterns = [
    path('api/constancias/', include((constancias_urlpatterns, 'constancias'))),
]

User = get_user_model()


def _crear_usuario(username, rol, esta_activo=True):
    user = User.objects.create_user(username=username, password='password123')
    # La señal authentication.signals crea el PerfilUsuario con rol='cajero'
    # por defecto al crear el User — se actualiza al rol pedido por el test.
    perfil = user.perfil
    perfil.rol = rol
    perfil.esta_activo = esta_activo
    perfil.save()
    return user


@override_settings(ROOT_URLCONF=__name__)
class PermisoFirmaDelegadaTests(TestCase):
    """Solo director/administrador/sistemas/superuser puede gestionar el
    grupo de firma delegada — secretaria no, aunque sí pueda emitir."""

    def setUp(self):
        self.client = APIClient()
        self.secretaria = _crear_usuario('secretaria_fd', 'secretaria')
        self.director = _crear_usuario('director_fd', 'director')
        self.objetivo = _crear_usuario('objetivo_fd', 'secretaria')

    def test_secretaria_no_puede_listar(self):
        self.client.force_authenticate(user=self.secretaria)
        resp = self.client.get('/api/constancias/firma-delegada/')
        self.assertEqual(resp.status_code, 403, resp.content)

    def test_secretaria_no_puede_agregar(self):
        self.client.force_authenticate(user=self.secretaria)
        resp = self.client.post(f'/api/constancias/firma-delegada/{self.objetivo.id}/')
        self.assertEqual(resp.status_code, 403, resp.content)

    def test_secretaria_no_puede_quitar(self):
        self.client.force_authenticate(user=self.secretaria)
        resp = self.client.delete(f'/api/constancias/firma-delegada/{self.objetivo.id}/')
        self.assertEqual(resp.status_code, 403, resp.content)

    def test_director_puede_listar(self):
        self.client.force_authenticate(user=self.director)
        resp = self.client.get('/api/constancias/firma-delegada/')
        self.assertEqual(resp.status_code, 200, resp.content)
        self.assertEqual(resp.data, {'usuarios': []})


@override_settings(ROOT_URLCONF=__name__)
class CrudFirmaDelegadaTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.director = _crear_usuario('director_fd_crud', 'director')
        self.objetivo = _crear_usuario('objetivo_fd_crud', 'secretaria')
        self.client.force_authenticate(user=self.director)

    def test_agregar_usuario_lo_incluye_en_listado(self):
        resp = self.client.post(f'/api/constancias/firma-delegada/{self.objetivo.id}/')
        self.assertEqual(resp.status_code, 200, resp.content)

        listado = self.client.get('/api/constancias/firma-delegada/')
        ids = [u['id'] for u in listado.data['usuarios']]
        self.assertIn(self.objetivo.id, ids)
        fila = next(u for u in listado.data['usuarios'] if u['id'] == self.objetivo.id)
        self.assertEqual(fila['username'], self.objetivo.username)
        self.assertEqual(fila['rol'], 'secretaria')

    def test_agregar_es_idempotente(self):
        r1 = self.client.post(f'/api/constancias/firma-delegada/{self.objetivo.id}/')
        r2 = self.client.post(f'/api/constancias/firma-delegada/{self.objetivo.id}/')
        self.assertEqual(r1.status_code, 200, r1.content)
        self.assertEqual(r2.status_code, 200, r2.content)

        grupo = Group.objects.get(name=NOMBRE_GRUPO_FIRMA_DELEGADA)
        self.assertEqual(grupo.user_set.filter(pk=self.objetivo.id).count(), 1)

    def test_quitar_usuario_lo_excluye_del_listado(self):
        self.client.post(f'/api/constancias/firma-delegada/{self.objetivo.id}/')
        resp = self.client.delete(f'/api/constancias/firma-delegada/{self.objetivo.id}/')
        self.assertEqual(resp.status_code, 204, resp.content)

        listado = self.client.get('/api/constancias/firma-delegada/')
        ids = [u['id'] for u in listado.data['usuarios']]
        self.assertNotIn(self.objetivo.id, ids)

    def test_quitar_es_idempotente_incluso_sin_grupo_previo(self):
        # No se creó el grupo aún (nadie lo agregó antes) — no debe fallar.
        resp = self.client.delete(f'/api/constancias/firma-delegada/{self.objetivo.id}/')
        self.assertEqual(resp.status_code, 204, resp.content)

    def test_quitar_dos_veces_es_idempotente(self):
        self.client.post(f'/api/constancias/firma-delegada/{self.objetivo.id}/')
        r1 = self.client.delete(f'/api/constancias/firma-delegada/{self.objetivo.id}/')
        r2 = self.client.delete(f'/api/constancias/firma-delegada/{self.objetivo.id}/')
        self.assertEqual(r1.status_code, 204, r1.content)
        self.assertEqual(r2.status_code, 204, r2.content)

    def test_agregar_usuario_inexistente_404(self):
        resp = self.client.post('/api/constancias/firma-delegada/999999/')
        self.assertEqual(resp.status_code, 404, resp.content)

    def test_quitar_usuario_inexistente_404(self):
        resp = self.client.delete('/api/constancias/firma-delegada/999999/')
        self.assertEqual(resp.status_code, 404, resp.content)

    def test_no_incluye_usuario_de_portal_de_representantes(self):
        from portal.models import RepresentanteUser
        from secretaria.models import Representante

        rep_user = User.objects.create_user(username='rep_fd', password='password123')
        representante = Representante.objects.create(
            cedula='V99999999', nombre='Rep', apellido='Portal',
            correo='rep_fd@example.com', telefono='0000000000',
            direccion='Calle Falsa 123',
        )
        RepresentanteUser.objects.create(representante=representante, user=rep_user)

        resp = self.client.post(f'/api/constancias/firma-delegada/{rep_user.id}/')
        self.assertEqual(resp.status_code, 404, resp.content)
