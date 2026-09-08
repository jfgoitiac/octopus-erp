"""
Verificación de cierre (Fase 5) de las cuatro plantillas semilla del
colegio: `constancias/fixtures/plantillas_semilla.json` (creado por el
agente 2A en Fase 2, fiel a los formatos Word de
`PROMPT_MODULO_CONSTANCIAS.md` Parte II).

Este test carga el fixture real con `loaddata` (no reconstruye las
plantillas a mano) y las pasa por el endpoint real `/previsualizar/` con
datos de ejemplo razonables, confirmando:

- Estudio: cuerpo + anexo (con fecha de nacimiento) renderizan sin
  advertencias de tokens desconocidos para los campos que el resolver de
  datos SÍ puebla.
- Conducta y Retiro: cuerpo renderiza limpio (Retiro necesita datos de
  promoción capturados a mano en el body, ver `resolver_datos`).
- Trabajo: sin permiso de nómina no se ven sueldo/bono (403); con permiso
  de nómina (rol director) sí aparecen, sin advertencias.

También documenta (sin arreglarlo — fuera del alcance de Fase 5, ver
`PROMPT_MODULO_CONSTANCIAS.md` §ANEXO "Mapa de propiedad de archivos": este
agente no es dueño de `constancias/resolvers.py`) un hallazgo real de
integración: el anexo de Estudio usa `{{familia.madre_*}}` y
`{{familia.padre_*}}` (documentados en el catálogo de `views.py` y en el
mapeo de notación vieja de `render.py`), pero
`resolvers.py::resolver_datos` nunca puebla esas claves — solo
`familia.representante_*` y `familia.parentesco`. El test de abajo
verifica el comportamiento REAL (con advertencias para esos tokens), no el
comportamiento esperado por el catálogo, para no encubrir el hallazgo.
"""
from datetime import date
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.test import TestCase, override_settings
from django.urls import include, path
from rest_framework.test import APIClient

from constancias.models import ConfiguracionFirmante, PlantillaConstancia
from constancias.urls import urlpatterns as constancias_urlpatterns
from nomina.models import Empleado, RegistroNomina
from secretaria.models import Alumno, ConfiguracionSistema, Representante

urlpatterns = [
    path('api/constancias/', include((constancias_urlpatterns, 'constancias'))),
]

User = get_user_model()


def _crear_usuario(username, rol):
    user = User.objects.create_user(username=username, password='password123')
    perfil = user.perfil
    perfil.rol = rol
    perfil.esta_activo = True
    perfil.save()
    return user


@override_settings(ROOT_URLCONF=__name__)
class PlantillasSemillaTests(TestCase):
    """Carga real de `plantillas_semilla.json` + previsualización end-to-end."""

    def setUp(self):
        # Se carga con loaddata (no se reconstruyen las plantillas a mano)
        # dentro de la transacción de TestCase — se revierte solo al
        # terminar cada test, sin dejar datos de prueba en la BD real.
        call_command('loaddata', 'plantillas_semilla', verbosity=0)

        self.client = APIClient()
        self.director = _crear_usuario('director_semilla', 'director')
        self.secretaria = _crear_usuario('secretaria_semilla', 'secretaria')

        ConfiguracionSistema.objects.create(
            nombre_colegio='Colegio Ejemplo', rif='J-12345678-9',
            municipio='Barquisimeto', estado_colegio='Lara',
            fecha_inicio_inscripciones=date(2025, 1, 1),
            fecha_fin_inscripciones=date(2025, 3, 1),
            fecha_inicio_ano_escolar=date(2025, 9, 1),
            fecha_fin_ano_escolar=date(2026, 7, 15),
            periodo_escolar_activo='2025-2026',
        )
        ConfiguracionFirmante.objects.create(
            nombre='Carlos Andrés Gómez', cedula='12345678',
            nacionalidad='V', cargo='Director',
        )

        self.representante = Representante.objects.create(
            cedula='V11122233', nombre='Ana', apellido='García',
            telefono='0414-1234567', correo='ana@example.com', direccion='Calle 1',
        )

    def test_las_cuatro_plantillas_cargan_desde_el_fixture(self):
        self.assertEqual(PlantillaConstancia.objects.count(), 4)
        tipos = set(PlantillaConstancia.objects.values_list('tipo', flat=True))
        self.assertEqual(tipos, {'estudio', 'conducta', 'retiro', 'trabajo'})

    def test_estudio_cuerpo_y_anexo_renderizan_madre_padre_sin_resolver(self):
        """`PrevisualizarView` concatena cuerpo + anexo en un solo
        `html_renderizado` cuando `anexo_habilitado=True` (ver
        `views.py::_cuerpo_completo`), así que Estudio siempre se
        previsualiza con su anexo incluido — no hay forma de aislar el
        cuerpo solo a través del endpoint real.

        Documenta el hallazgo de Fase 5: `resolvers.py::resolver_datos`
        nunca puebla `familia.madre_*` / `familia.padre_*` (solo
        `familia.representante_*` y `familia.parentesco`), aunque esos 6
        tokens están documentados en el catálogo de `views.py` y en el
        mapeo de notación vieja de `render.py`. El anexo de Estudio
        siempre reporta esos 6 tokens como desconocidos. No se corrige
        aquí: `resolvers.py` no es un archivo propio de este agente (ver
        mapa de propiedad de archivos — Fase 5 no tiene fila asignada) —
        se documenta en `NOTAS_TECNICAS.md` para que se decida a futuro."""
        plantilla = PlantillaConstancia.objects.get(tipo='estudio')
        alumno = Alumno.objects.create(
            nombre='María José', apellido='Rodríguez', cedula_escolar='E84000001',
            genero='femenino', grado_seccion='3er Grado A',
            fecha_nacimiento=date(2012, 3, 12),
            representante=self.representante, parentesco='madre',
        )
        self.client.force_authenticate(user=self.director)
        resp = self.client.post('/api/constancias/previsualizar/', {
            'plantilla_id': plantilla.id, 'alumno_id': alumno.id,
        }, format='json')

        self.assertEqual(resp.status_code, 200, resp.content)
        data = resp.json()
        html = data['html_renderizado']

        # Cuerpo: renderiza limpio.
        self.assertIn('María José Rodríguez', html)
        self.assertIn('inscrita', html)
        self.assertIn('3er Grado A', html)
        self.assertIn('2025-2026', html)
        # Anexo: la fecha de nacimiento sí resuelve.
        self.assertIn('12/03/2012', html)

        advertencias_madre_padre = [
            a for a in data['advertencias']
            if 'familia.madre' in a or 'familia.padre' in a
        ]
        # Hallazgo real: hoy SIEMPRE hay advertencia para los 6 tokens de
        # madre/padre porque el resolver no los puebla. Ninguna otra
        # advertencia debería aparecer.
        self.assertEqual(len(advertencias_madre_padre), 6, data['advertencias'])
        self.assertEqual(len(data['advertencias']), 6, data['advertencias'])

    def test_conducta_renderiza_sin_advertencias(self):
        plantilla = PlantillaConstancia.objects.get(tipo='conducta')
        alumno = Alumno.objects.create(
            nombre='Pedro', apellido='Pérez', cedula_escolar='E84000002',
            genero='masculino', grado_seccion='1er Grado B',
            representante=self.representante,
        )
        self.client.force_authenticate(user=self.director)
        resp = self.client.post('/api/constancias/previsualizar/', {
            'plantilla_id': plantilla.id, 'alumno_id': alumno.id,
        }, format='json')

        self.assertEqual(resp.status_code, 200, resp.content)
        data = resp.json()
        self.assertIn('Pedro Pérez', data['html_renderizado'])
        self.assertIn('inscrito', data['html_renderizado'])
        self.assertIn('buena conducta', data['html_renderizado'])
        self.assertEqual(data['advertencias'], [])

    def test_retiro_renderiza_sin_advertencias_con_datos_de_promocion(self):
        plantilla = PlantillaConstancia.objects.get(tipo='retiro')
        alumno = Alumno.objects.create(
            nombre='Diego', apellido='Soto', cedula_escolar='E84000004',
            genero='masculino', grado_seccion='3er Grado A',
            representante=self.representante,
        )
        self.client.force_authenticate(user=self.director)
        resp = self.client.post('/api/constancias/previsualizar/', {
            'plantilla_id': plantilla.id,
            'alumno_id': alumno.id,
            # grado/nivel/año de promoción no viven en el modelo Alumno —
            # se capturan a mano al emitir, ver resolver_datos.
            'datos_capturados': {
                'grado_promocion': '4to Grado',
                'nivel_promocion': 'Educación Primaria',
                'anio_escolar_promocion': '2026-2027',
            },
        }, format='json')

        self.assertEqual(resp.status_code, 200, resp.content)
        data = resp.json()
        html = data['html_renderizado']
        self.assertIn('Diego Soto', html)
        self.assertIn('promovido', html)
        self.assertIn('4to Grado', html)
        self.assertIn('2026-2027', html)
        self.assertEqual(data['advertencias'], [])

    def test_trabajo_sin_rol_nomina_no_ve_sueldo_ni_bono(self):
        plantilla = PlantillaConstancia.objects.get(tipo='trabajo')
        trabajador = Empleado.objects.create(
            cedula='44455566', nombre='Pedro', apellido='Suárez',
            tipo_personal='docente', fecha_ingreso=date(2015, 9, 1),
            sueldo_base_ves=Decimal('1850.00'),
        )
        self.client.force_authenticate(user=self.secretaria)
        resp = self.client.post('/api/constancias/previsualizar/', {
            'plantilla_id': plantilla.id, 'trabajador_id': trabajador.id,
        }, format='json')

        self.assertEqual(resp.status_code, 403, resp.content)

    def test_trabajo_con_rol_nomina_ve_sueldo_y_bono_sin_advertencias(self):
        plantilla = PlantillaConstancia.objects.get(tipo='trabajo')
        # Cédula sin prefijo de nacionalidad: el resolver siempre antepone
        # 'V-' para trabajadores (Empleado no tiene campo de nacionalidad
        # propio, ver resolvers.py::resolver_datos) — con 'V44455566' aquí
        # el resultado sería el dato duplicado 'V-V44455566'.
        trabajador = Empleado.objects.create(
            cedula='44455566', nombre='Pedro', apellido='Suárez',
            tipo_personal='docente', fecha_ingreso=date(2015, 9, 1),
            sueldo_base_ves=Decimal('1850.00'),
        )
        RegistroNomina.objects.create(
            empleado=trabajador, mes_correspondiente=8, anio_correspondiente=2026,
            monto_cestaticket=Decimal('120.00'), tasa_pago_bono=Decimal('36.00'),
            bono_usd=Decimal('320.00'),
        )
        self.client.force_authenticate(user=self.director)
        resp = self.client.post('/api/constancias/previsualizar/', {
            'plantilla_id': plantilla.id, 'trabajador_id': trabajador.id,
        }, format='json')

        self.assertEqual(resp.status_code, 200, resp.content)
        data = resp.json()
        html = data['html_renderizado']
        self.assertIn('Pedro Suárez', html)
        self.assertIn('V-44455566', html)
        self.assertIn('Bs. 1,850.00', html)
        self.assertIn('Bs. 320.00', html)
        self.assertEqual(data['advertencias'], [])
