"""
Tests de integración de los endpoints de `constancias` (Fase 3 — agente 3A).

`constancias/urls.py` todavía no está enganchado en `config/urls.py` (lo
hace el orquestador al final de la Fase 3), así que estos tests apuntan su
propio ROOT_URLCONF a un urlconf mínimo definido en este mismo módulo que
incluye `constancias.urls` bajo el prefijo real `/api/constancias/` — no se
toca `config/urls.py` para lograrlo.
"""
from datetime import date

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from django.urls import include, path
from rest_framework.test import APIClient

from constancias.models import ConfiguracionFirmante, ConstanciaEmitida, PlantillaConstancia
from constancias.urls import urlpatterns as constancias_urlpatterns
from nomina.models import Empleado
from secretaria.models import Alumno, ConfiguracionSistema, Representante

urlpatterns = [
    path('api/constancias/', include((constancias_urlpatterns, 'constancias'))),
]

User = get_user_model()


def _crear_usuario(username, rol):
    user = User.objects.create_user(username=username, password='password123')
    # La señal authentication.signals crea el PerfilUsuario con rol='cajero'
    # por defecto al crear el User — se actualiza al rol pedido por el test.
    perfil = user.perfil
    perfil.rol = rol
    perfil.esta_activo = True
    perfil.save()
    return user


def _crear_configuracion_sistema():
    return ConfiguracionSistema.objects.create(
        nombre_colegio='Colegio Ejemplo',
        rif='J-12345678-9',
        municipio='Barquisimeto',
        estado_colegio='Lara',
        fecha_inicio_inscripciones=date(2025, 1, 1),
        fecha_fin_inscripciones=date(2025, 3, 1),
        fecha_inicio_ano_escolar=date(2025, 9, 1),
        fecha_fin_ano_escolar=date(2026, 7, 15),
        periodo_escolar_activo='2025-2026',
    )


@override_settings(ROOT_URLCONF=__name__)
class PrevisualizarConstanciaTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.director = _crear_usuario('director1', 'director')
        _crear_configuracion_sistema()

        self.representante = Representante.objects.create(
            cedula='V11122233', nombre='Ana', apellido='García',
            telefono='0414-1234567', correo='ana@example.com', direccion='Calle 1',
        )
        self.plantilla = PlantillaConstancia.objects.create(
            tipo='estudio', nombre='Constancia de Estudio', destinatario='alumno',
            cuerpo_html=(
                '<p>{{sexo:El|La}} alumno(a) {{alumno.nombres}} {{alumno.apellidos}}, '
                'cédula {{alumno.cedula}}, cursa {{alumno.grado}}.</p>'
            ),
        )

    def test_previsualizar_con_datos_completos(self):
        alumno = Alumno.objects.create(
            nombre='María José', apellido='Rodríguez', cedula_escolar='E84000001',
            cedula='30123456', cedula_nacionalidad='V', genero='femenino',
            grado_seccion='3er Grado A', representante=self.representante,
        )
        self.client.force_authenticate(user=self.director)
        resp = self.client.post('/api/constancias/previsualizar/', {
            'plantilla_id': self.plantilla.id,
            'alumno_id': alumno.id,
            'datos_capturados': {},
        }, format='json')

        self.assertEqual(resp.status_code, 200, resp.content)
        data = resp.json()
        self.assertIn('María José', data['html_renderizado'])
        self.assertIn('V-30123456', data['html_renderizado'])
        self.assertIn('La alumno(a)', data['html_renderizado'])
        self.assertEqual(data['advertencias'], [])

    def test_previsualizar_alumno_sin_cedula_reporta_advertencia(self):
        alumno = Alumno.objects.create(
            nombre='Pedro', apellido='Pérez', cedula_escolar='E84000002',
            # sin cedula (queda '' por defecto del modelo)
            genero='masculino',
            grado_seccion='1er Grado B', representante=self.representante,
        )
        self.client.force_authenticate(user=self.director)
        resp = self.client.post('/api/constancias/previsualizar/', {
            'plantilla_id': self.plantilla.id,
            'alumno_id': alumno.id,
        }, format='json')

        self.assertEqual(resp.status_code, 200, resp.content)
        data = resp.json()
        self.assertIn('Pedro', data['html_renderizado'])
        self.assertTrue(any('cedula' in advertencia for advertencia in data['advertencias']))
        self.assertIn('El alumno(a)', data['html_renderizado'])


@override_settings(ROOT_URLCONF=__name__)
class EmitirConstanciaCorrelativoTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.director = _crear_usuario('director2', 'director')
        _crear_configuracion_sistema()
        self.representante = Representante.objects.create(
            cedula='V22233344', nombre='Luis', apellido='Fernández',
            telefono='0414-7654321', correo='luis@example.com', direccion='Calle 2',
        )
        self.plantilla = PlantillaConstancia.objects.create(
            tipo='estudio', nombre='Constancia de Estudio', destinatario='alumno',
            cuerpo_html='<p>{{alumno.nombres}} {{alumno.apellidos}} — {{documento.numero}}</p>',
        )
        self.client.force_authenticate(user=self.director)

    def test_emitir_genera_numero_unico_y_correlativo(self):
        alumno1 = Alumno.objects.create(
            nombre='Carla', apellido='Soto', cedula_escolar='E84000003',
            genero='femenino', representante=self.representante,
        )
        alumno2 = Alumno.objects.create(
            nombre='Diego', apellido='Soto', cedula_escolar='E84000004',
            genero='masculino', representante=self.representante,
        )

        resp1 = self.client.post('/api/constancias/emitir/', {
            'plantilla_id': self.plantilla.id, 'alumno_id': alumno1.id,
        }, format='json')
        resp2 = self.client.post('/api/constancias/emitir/', {
            'plantilla_id': self.plantilla.id, 'alumno_id': alumno2.id,
        }, format='json')

        self.assertEqual(resp1.status_code, 201, resp1.content)
        self.assertEqual(resp2.status_code, 201, resp2.content)
        numero1 = resp1.json()['numero']
        numero2 = resp2.json()['numero']

        self.assertNotEqual(numero1, numero2)
        self.assertTrue(numero1.startswith('EST-2025-2026-'))
        self.assertTrue(numero2.startswith('EST-2025-2026-'))
        self.assertEqual(ConstanciaEmitida.objects.count(), 2)

        # El HTML final ya trae el número real, no el placeholder de previsualización.
        constancia1 = ConstanciaEmitida.objects.get(numero=numero1)
        self.assertIn(numero1, constancia1.html_renderizado)
        self.assertNotIn('(se asigna al emitir)', constancia1.html_renderizado)


@override_settings(ROOT_URLCONF=__name__)
class DeletePlantillaConHistoricoTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.director = _crear_usuario('director3', 'director')
        _crear_configuracion_sistema()
        self.representante = Representante.objects.create(
            cedula='V33344455', nombre='Rosa', apellido='Marín',
            telefono='0414-1112223', correo='rosa@example.com', direccion='Calle 3',
        )
        self.alumno = Alumno.objects.create(
            nombre='Iván', apellido='Marín', cedula_escolar='E84000005',
            genero='masculino', representante=self.representante,
        )
        self.plantilla = PlantillaConstancia.objects.create(
            tipo='estudio', nombre='Constancia con histórico', destinatario='alumno',
            cuerpo_html='<p>{{alumno.nombres}}</p>',
        )
        self.client.force_authenticate(user=self.director)

    def test_delete_plantilla_con_constancias_emitidas_devuelve_409(self):
        ConstanciaEmitida.objects.create(
            numero='EST-2025-2026-0001', tipo='estudio', plantilla=self.plantilla,
            alumno=self.alumno, html_renderizado='<p>Iván</p>',
            emitida_por=self.director, periodo_escolar='2025-2026',
        )

        resp = self.client.delete(f'/api/constancias/plantillas/{self.plantilla.id}/')

        self.assertEqual(resp.status_code, 409, resp.content)
        self.assertIn('No se puede eliminar', resp.json()['detail'])
        self.assertTrue(PlantillaConstancia.objects.filter(pk=self.plantilla.id).exists())

    def test_delete_plantilla_sin_historico_elimina_normalmente(self):
        plantilla_sin_uso = PlantillaConstancia.objects.create(
            tipo='conducta', nombre='Sin uso', destinatario='alumno',
            cuerpo_html='<p>{{alumno.nombres}}</p>',
        )
        resp = self.client.delete(f'/api/constancias/plantillas/{plantilla_sin_uso.id}/')
        self.assertEqual(resp.status_code, 204, resp.content)
        self.assertFalse(PlantillaConstancia.objects.filter(pk=plantilla_sin_uso.id).exists())


@override_settings(ROOT_URLCONF=__name__)
class PermisoSensibleNominaTests(TestCase):
    """403 al previsualizar/emitir constancia de trabajador con sueldo/bono
    sin rol de nómina (director/sistemas/administrador, ver
    authentication.views.IsSystemAdminOrDirector)."""

    def setUp(self):
        self.client = APIClient()
        self.secretaria = _crear_usuario('secretaria1', 'secretaria')
        self.director = _crear_usuario('director4', 'director')
        _crear_configuracion_sistema()

        self.trabajador = Empleado.objects.create(
            cedula='V44455566', nombre='Pedro', apellido='Suárez',
            tipo_personal='docente', fecha_ingreso=date(2015, 9, 1),
            sueldo_base_ves='1850.00',
        )
        self.plantilla = PlantillaConstancia.objects.create(
            tipo='trabajo', nombre='Constancia de Trabajo con Sueldo', destinatario='trabajador',
            cuerpo_html=(
                '<p>{{trabajador.nombres}} {{trabajador.apellidos}} devenga '
                '{{trabajador.sueldo}} y {{trabajador.bono}}.</p>'
            ),
        )

    def test_previsualizar_sin_rol_nomina_devuelve_403(self):
        self.client.force_authenticate(user=self.secretaria)
        resp = self.client.post('/api/constancias/previsualizar/', {
            'plantilla_id': self.plantilla.id, 'trabajador_id': self.trabajador.id,
        }, format='json')
        self.assertEqual(resp.status_code, 403, resp.content)

    def test_emitir_sin_rol_nomina_devuelve_403(self):
        self.client.force_authenticate(user=self.secretaria)
        resp = self.client.post('/api/constancias/emitir/', {
            'plantilla_id': self.plantilla.id, 'trabajador_id': self.trabajador.id,
        }, format='json')
        self.assertEqual(resp.status_code, 403, resp.content)
        self.assertEqual(ConstanciaEmitida.objects.count(), 0)

    def test_previsualizar_con_rol_nomina_incluye_sueldo(self):
        self.client.force_authenticate(user=self.director)
        resp = self.client.post('/api/constancias/previsualizar/', {
            'plantilla_id': self.plantilla.id, 'trabajador_id': self.trabajador.id,
        }, format='json')
        self.assertEqual(resp.status_code, 200, resp.content)
        self.assertIn('Bs.', resp.json()['html_renderizado'])


@override_settings(ROOT_URLCONF=__name__)
class FirmanteSingletonTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.director = _crear_usuario('director5', 'director')
        self.secretaria = _crear_usuario('secretaria2', 'secretaria')

    def test_get_firmante_sin_configuracion_devuelve_vacio(self):
        self.client.force_authenticate(user=self.secretaria)
        resp = self.client.get('/api/constancias/firmante/')
        self.assertEqual(resp.status_code, 200, resp.content)
        self.assertEqual(resp.json(), {})

    def test_put_firmante_requiere_director_o_administrador(self):
        self.client.force_authenticate(user=self.secretaria)
        resp = self.client.put('/api/constancias/firmante/', {
            'nombre': 'Carlos Gómez', 'cedula': '12345678', 'cargo': 'Director',
        }, format='json')
        self.assertEqual(resp.status_code, 403, resp.content)

    def test_put_firmante_con_director_crea_singleton(self):
        self.client.force_authenticate(user=self.director)
        resp = self.client.put('/api/constancias/firmante/', {
            'nombre': 'Carlos Gómez', 'cedula': '12345678', 'cargo': 'Director',
        }, format='json')
        self.assertEqual(resp.status_code, 200, resp.content)
        self.assertEqual(ConfiguracionFirmante.objects.count(), 1)
        self.assertNotIn('firma_imagen', resp.json())


@override_settings(ROOT_URLCONF=__name__)
class PlaceholdersViewTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.secretaria = _crear_usuario('secretaria3', 'secretaria')
        self.client.force_authenticate(user=self.secretaria)

    def test_placeholders_alumno_incluye_institucion_y_documento(self):
        resp = self.client.get('/api/constancias/placeholders/', {'destinatario': 'alumno'})
        self.assertEqual(resp.status_code, 200, resp.content)
        grupos = {g['grupo'] for g in resp.json()['grupos']}
        self.assertEqual(grupos, {'alumno', 'institucion', 'documento'})

    def test_placeholders_destinatario_invalido_devuelve_400(self):
        resp = self.client.get('/api/constancias/placeholders/', {'destinatario': 'invalido'})
        self.assertEqual(resp.status_code, 400, resp.content)


@override_settings(ROOT_URLCONF=__name__)
class PdfConstanciaSinModuloTests(TestCase):
    """Si constancias/pdf.py (de 3B) todavía no existe, la vista debe
    devolver 503 en vez de romper — ver try/except ImportError en
    PdfConstanciaView."""

    def setUp(self):
        self.client = APIClient()
        self.director = _crear_usuario('director6', 'director')
        self.representante = Representante.objects.create(
            cedula='V55566677', nombre='Sofía', apellido='León',
            telefono='0414-1112224', correo='sofia@example.com', direccion='Calle 4',
        )
        self.alumno = Alumno.objects.create(
            nombre='Sofía', apellido='León', cedula_escolar='E84000006',
            genero='femenino', representante=self.representante,
        )
        self.plantilla = PlantillaConstancia.objects.create(
            tipo='estudio', nombre='Constancia PDF Test', destinatario='alumno',
            cuerpo_html='<p>{{alumno.nombres}}</p>',
        )
        self.constancia = ConstanciaEmitida.objects.create(
            numero='EST-2025-2026-0099', tipo='estudio', plantilla=self.plantilla,
            alumno=self.alumno, html_renderizado='<p>Sofía</p>',
            emitida_por=self.director, periodo_escolar='2025-2026',
        )
        self.client.force_authenticate(user=self.director)

    def test_pdf_devuelve_404_o_503_sin_romper(self):
        resp = self.client.get(f'/api/constancias/emitidas/{self.constancia.id}/pdf/')
        # 200 si 3B ya terminó constancias/pdf.py, 503 si aún no existe.
        self.assertIn(resp.status_code, (200, 503))
