"""
Tests de permisos del módulo `constancias` (Fase 4 — agente 4A).

Cubre:
- Separación "editar plantillas" (director/administrador) vs
  "solo listar/ver y emitir" (incluye secretaria).
- `puede_firmar_como_director` (permiso independiente del rol, basado en
  `django.contrib.auth.models.Group`, sin migraciones nuevas).
- Que el control existente de datos sensibles (sueldo/bono) en
  previsualizar/emitir no se haya roto con estos cambios (ya cubierto en
  test_views.py::PermisoSensibleNominaTests; aquí solo se re-confirma).

Mismo patrón de `ROOT_URLCONF` mínimo que `test_views.py`, porque
`constancias/urls.py` todavía no está enganchado en `config/urls.py`.
"""
from datetime import date

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.test import TestCase, override_settings
from django.urls import include, path
from rest_framework.test import APIClient

from constancias.models import PlantillaConstancia
from constancias.permissions import NOMBRE_GRUPO_FIRMA_DELEGADA, puede_firmar_como_director
from constancias.urls import urlpatterns as constancias_urlpatterns
from nomina.models import Empleado

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
class PlantillaPermisosTests(TestCase):
    """secretaria puede listar/ver plantillas y emitir/previsualizar, pero
    no crear/editar/borrar plantillas. director/administrador sí pueden."""

    def setUp(self):
        self.client = APIClient()
        self.secretaria = _crear_usuario('secretaria_perm', 'secretaria')
        self.director = _crear_usuario('director_perm', 'director')
        self.administrador = _crear_usuario('admin_perm', 'administrador')
        self.plantilla = PlantillaConstancia.objects.create(
            tipo='estudio', nombre='Constancia de Estudio', destinatario='alumno',
            cuerpo_html='<p>{{alumno.nombres}}</p>',
        )

    def test_secretaria_puede_listar_plantillas(self):
        self.client.force_authenticate(user=self.secretaria)
        resp = self.client.get('/api/constancias/plantillas/')
        self.assertEqual(resp.status_code, 200, resp.content)

    def test_secretaria_puede_ver_plantilla(self):
        self.client.force_authenticate(user=self.secretaria)
        resp = self.client.get(f'/api/constancias/plantillas/{self.plantilla.id}/')
        self.assertEqual(resp.status_code, 200, resp.content)

    def test_secretaria_no_puede_crear_plantilla(self):
        self.client.force_authenticate(user=self.secretaria)
        resp = self.client.post('/api/constancias/plantillas/', {
            'tipo': 'trabajo', 'nombre': 'Nueva', 'destinatario': 'alumno',
            'cuerpo_html': '<p>{{alumno.nombres}}</p>',
        }, format='json')
        self.assertEqual(resp.status_code, 403, resp.content)

    def test_secretaria_no_puede_editar_plantilla(self):
        self.client.force_authenticate(user=self.secretaria)
        resp = self.client.patch(f'/api/constancias/plantillas/{self.plantilla.id}/', {
            'nombre': 'Editada por secretaria',
        }, format='json')
        self.assertEqual(resp.status_code, 403, resp.content)

    def test_secretaria_no_puede_borrar_plantilla(self):
        self.client.force_authenticate(user=self.secretaria)
        resp = self.client.delete(f'/api/constancias/plantillas/{self.plantilla.id}/')
        self.assertEqual(resp.status_code, 403, resp.content)
        self.assertTrue(PlantillaConstancia.objects.filter(pk=self.plantilla.id).exists())

    def test_director_puede_crear_plantilla(self):
        self.client.force_authenticate(user=self.director)
        resp = self.client.post('/api/constancias/plantillas/', {
            'tipo': 'trabajo', 'nombre': 'Nueva del director', 'destinatario': 'alumno',
            'cuerpo_html': '<p>{{alumno.nombres}}</p>',
        }, format='json')
        self.assertEqual(resp.status_code, 201, resp.content)

    def test_director_puede_editar_plantilla(self):
        self.client.force_authenticate(user=self.director)
        resp = self.client.patch(f'/api/constancias/plantillas/{self.plantilla.id}/', {
            'nombre': 'Editada por director',
        }, format='json')
        self.assertEqual(resp.status_code, 200, resp.content)

    def test_administrador_puede_borrar_plantilla(self):
        self.client.force_authenticate(user=self.administrador)
        resp = self.client.delete(f'/api/constancias/plantillas/{self.plantilla.id}/')
        self.assertEqual(resp.status_code, 204, resp.content)


@override_settings(ROOT_URLCONF=__name__)
class SecretariaSiguePudiendoEmitirTests(TestCase):
    """El contrato exige que separar la edición de plantillas NO le quite a
    secretaria la capacidad de emitir/previsualizar constancias."""

    def setUp(self):
        self.client = APIClient()
        self.secretaria = _crear_usuario('secretaria_emite', 'secretaria')
        self.plantilla = PlantillaConstancia.objects.create(
            tipo='estudio', nombre='Constancia de Estudio', destinatario='alumno',
            cuerpo_html='<p>{{alumno.nombres}}</p>',
        )

    def test_secretaria_puede_previsualizar(self):
        self.client.force_authenticate(user=self.secretaria)
        resp = self.client.post('/api/constancias/previsualizar/', {
            'plantilla_id': self.plantilla.id, 'alumno_id': 999999,
        }, format='json')
        # 400 porque el alumno no existe, pero NO 403: el permiso de rol pasó.
        self.assertEqual(resp.status_code, 400, resp.content)


class PuedeFirmarComoDirectorTests(TestCase):
    """Permiso independiente del rol, basado en Group (sin migración nueva)."""

    def test_director_activo_puede_firmar(self):
        director = _crear_usuario('director_firma', 'director')
        self.assertTrue(puede_firmar_como_director(director))

    def test_director_inactivo_no_puede_firmar(self):
        director_inactivo = _crear_usuario('director_inactivo_firma', 'director', esta_activo=False)
        self.assertFalse(puede_firmar_como_director(director_inactivo))

    def test_superuser_puede_firmar(self):
        superuser = User.objects.create_superuser(username='superuser_firma', password='password123')
        self.assertTrue(puede_firmar_como_director(superuser))

    def test_secretaria_sin_grupo_no_puede_firmar(self):
        secretaria = _crear_usuario('secretaria_sin_grupo', 'secretaria')
        self.assertFalse(puede_firmar_como_director(secretaria))

    def test_secretaria_con_grupo_delegado_puede_firmar(self):
        secretaria = _crear_usuario('secretaria_con_grupo', 'secretaria')
        grupo, _ = Group.objects.get_or_create(name=NOMBRE_GRUPO_FIRMA_DELEGADA)
        secretaria.groups.add(grupo)
        self.assertTrue(puede_firmar_como_director(secretaria))

    def test_usuario_no_autenticado_no_puede_firmar(self):
        from django.contrib.auth.models import AnonymousUser
        self.assertFalse(puede_firmar_como_director(AnonymousUser()))


@override_settings(ROOT_URLCONF=__name__)
class PermisoSensibleSigueFuncionandoTests(TestCase):
    """Re-confirma que el control de datos sensibles (sueldo/bono) en
    previsualizar/emitir (IsSystemAdminOrDirector) sigue vigente tras mover
    EsRolConstancias a constancias/permissions.py — ya cubierto en detalle
    por test_views.py::PermisoSensibleNominaTests, este es un smoke test."""

    def setUp(self):
        self.client = APIClient()
        self.secretaria = _crear_usuario('secretaria_sensible', 'secretaria')
        self.trabajador = Empleado.objects.create(
            cedula='V55566677', nombre='Laura', apellido='Torres',
            tipo_personal='docente', fecha_ingreso=date(2018, 1, 1),
            sueldo_base_ves='2000.00',
        )
        self.plantilla = PlantillaConstancia.objects.create(
            tipo='trabajo', nombre='Constancia con Sueldo', destinatario='trabajador',
            cuerpo_html='<p>{{trabajador.nombres}} devenga {{trabajador.sueldo}}.</p>',
        )

    def test_secretaria_sin_rol_nomina_no_puede_previsualizar_datos_sensibles(self):
        self.client.force_authenticate(user=self.secretaria)
        resp = self.client.post('/api/constancias/previsualizar/', {
            'plantilla_id': self.plantilla.id, 'trabajador_id': self.trabajador.id,
        }, format='json')
        self.assertEqual(resp.status_code, 403, resp.content)
