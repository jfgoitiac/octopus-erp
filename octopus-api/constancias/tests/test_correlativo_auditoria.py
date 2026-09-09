"""
Tests de correlativo y auditoría de `constancias` (Fase 4 — agente 4B).

Cubre:
- `resolvers.py::generar_numero_constancia`: no colisiona para el mismo
  tipo+período (secuencial), no comparte contador entre tipos/períodos
  distintos, y funciona para la primera constancia de un prefijo nuevo.
  No hay precedente de tests con threading real contra SQLite en este
  proyecto (ver `cantina/tests_apertura_caja.py`), así que aquí se prueba
  de forma secuencial -- lo que importa para este agente es que el nuevo
  mecanismo (lock sobre la fila única de ConfiguracionFirmante en vez de
  select_for_update()+count() combinados) siga produciendo el mismo
  contrato de numeración que antes, y no truene en Postgres.
- `EmitirView.post()`: la cuarta condición de `salio_firmada`
  (`puede_firmar_como_director`) -- la constancia se emite igual (201) esté
  o no delegada la firma, solo cambia `salio_firmada`.
- Auditoría: `ConstanciaEmitida.emitida_por`, `fecha_emision` y
  `salio_firmada` quedan poblados correctamente tras `EmitirView`.

Mismo patrón de `ROOT_URLCONF` mínimo que `test_views.py`/`test_permissions.py`,
porque `constancias/urls.py` todavía no está enganchado en `config/urls.py`.
"""
from datetime import date
from io import BytesIO

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from django.urls import include, path
from django.utils import timezone
from rest_framework.test import APIClient

from constancias.models import ConfiguracionFirmante, ConstanciaEmitida, PlantillaConstancia
from constancias.permissions import NOMBRE_GRUPO_FIRMA_DELEGADA
from constancias.resolvers import generar_numero_constancia
from constancias.urls import urlpatterns as constancias_urlpatterns
from secretaria.models import Alumno, ConfiguracionSistema, Representante

urlpatterns = [
    path('api/constancias/', include((constancias_urlpatterns, 'constancias'))),
]

User = get_user_model()


def _crear_usuario(username, rol, esta_activo=True):
    user = User.objects.create_user(username=username, password='password123')
    perfil = user.perfil
    perfil.rol = rol
    perfil.esta_activo = esta_activo
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


def _png_1x1_bytes():
    from PIL import Image

    buf = BytesIO()
    Image.new('RGB', (1, 1), color=(200, 30, 30)).save(buf, format='PNG')
    return buf.getvalue()


# ---------------------------------------------------------------------------
# Correlativo
# ---------------------------------------------------------------------------

class GenerarNumeroConstanciaTests(TestCase):
    """Prueba directa del resolver (sin pasar por EmitirView)."""

    def test_primera_constancia_de_un_prefijo_nuevo_es_0001(self):
        numero = generar_numero_constancia('estudio', '2025-2026')
        self.assertEqual(numero, 'EST-2025-2026-0001')

    def test_dos_numeros_consecutivos_no_colisionan(self):
        numero1 = generar_numero_constancia('estudio', '2025-2026')
        # Simula que la constancia anterior efectivamente se guardó con ese
        # número -- el resolver solo cuenta filas existentes, quien llama
        # es responsable de persistir antes de pedir el siguiente.
        ConstanciaEmitida.objects.create(
            numero=numero1, tipo='estudio',
            plantilla=PlantillaConstancia.objects.create(
                tipo='estudio', nombre='P1', destinatario='alumno', cuerpo_html='<p></p>',
            ),
            html_renderizado='<p></p>',
            emitida_por=_crear_usuario('u_correlativo_1', 'director'),
            periodo_escolar='2025-2026',
        )
        numero2 = generar_numero_constancia('estudio', '2025-2026')

        self.assertNotEqual(numero1, numero2)
        self.assertEqual(numero1, 'EST-2025-2026-0001')
        self.assertEqual(numero2, 'EST-2025-2026-0002')

    def test_tipos_distintos_no_comparten_contador(self):
        plantilla_estudio = PlantillaConstancia.objects.create(
            tipo='estudio', nombre='P estudio', destinatario='alumno', cuerpo_html='<p></p>',
        )
        usuario = _crear_usuario('u_correlativo_2', 'director')
        numero_estudio = generar_numero_constancia('estudio', '2025-2026')
        ConstanciaEmitida.objects.create(
            numero=numero_estudio, tipo='estudio', plantilla=plantilla_estudio,
            html_renderizado='<p></p>', emitida_por=usuario, periodo_escolar='2025-2026',
        )

        numero_conducta = generar_numero_constancia('conducta', '2025-2026')

        self.assertEqual(numero_estudio, 'EST-2025-2026-0001')
        # Aunque ya existe una constancia de 'estudio' para ese período, el
        # contador de 'conducta' arranca en 0001 -- prefijos distintos.
        self.assertEqual(numero_conducta, 'CON-2025-2026-0001')

    def test_periodos_distintos_no_comparten_contador(self):
        plantilla = PlantillaConstancia.objects.create(
            tipo='retiro', nombre='P retiro', destinatario='alumno', cuerpo_html='<p></p>',
        )
        usuario = _crear_usuario('u_correlativo_3', 'director')
        numero_2025 = generar_numero_constancia('retiro', '2025-2026')
        ConstanciaEmitida.objects.create(
            numero=numero_2025, tipo='retiro', plantilla=plantilla,
            html_renderizado='<p></p>', emitida_por=usuario, periodo_escolar='2025-2026',
        )

        numero_2026 = generar_numero_constancia('retiro', '2026-2027')

        self.assertEqual(numero_2025, 'RET-2025-2026-0001')
        self.assertEqual(numero_2026, 'RET-2026-2027-0001')

    def test_funciona_sin_configuracionfirmante_configurado(self):
        """Caso raro documentado en el resolver: sin fila de
        ConfiguracionFirmante no hay singleton contra el cual bloquear, pero
        la generación de número no debe explotar."""
        self.assertFalse(ConfiguracionFirmante.objects.exists())
        numero = generar_numero_constancia('trabajo', '2025-2026')
        self.assertEqual(numero, 'TRB-2025-2026-0001')

    def test_sin_firmante_configurado_dos_llamadas_seguidas_no_colisionan(self):
        """Hallazgo de deuda técnica resuelto: cuando nunca se configuró
        ConfiguracionFirmante (fila inexistente), la primera llamada ya no
        se degrada a contar sin lock -- garantiza la fila singleton
        (get_or_create sobre pk=1) antes de lockearla. Dos llamadas
        seguidas (simulando que la primera constancia efectivamente se
        persistió antes de pedir la siguiente, mismo patrón que
        test_dos_numeros_consecutivos_no_colisionan) deben seguir
        produciendo números consecutivos sin colisión, y de paso debe
        quedar creada una fila ConfiguracionFirmante (con campos vacíos)."""
        self.assertFalse(ConfiguracionFirmante.objects.exists())

        numero1 = generar_numero_constancia('estudio', '2025-2026')
        self.assertEqual(numero1, 'EST-2025-2026-0001')

        # La fila singleton ya existe tras la primera llamada, aunque sea
        # con campos vacíos (defaults del get_or_create del fix).
        self.assertTrue(ConfiguracionFirmante.objects.exists())
        self.assertEqual(ConfiguracionFirmante.objects.count(), 1)

        ConstanciaEmitida.objects.create(
            numero=numero1, tipo='estudio',
            plantilla=PlantillaConstancia.objects.create(
                tipo='estudio', nombre='P sin firmante', destinatario='alumno',
                cuerpo_html='<p></p>',
            ),
            html_renderizado='<p></p>',
            emitida_por=_crear_usuario('u_correlativo_sin_firmante', 'director'),
            periodo_escolar='2025-2026',
        )
        numero2 = generar_numero_constancia('estudio', '2025-2026')

        self.assertNotEqual(numero1, numero2)
        self.assertEqual(numero2, 'EST-2025-2026-0002')
        # Sigue existiendo una sola fila -- get_or_create no la duplicó en
        # la segunda llamada.
        self.assertEqual(ConfiguracionFirmante.objects.count(), 1)


# ---------------------------------------------------------------------------
# salio_firmada (cuarta condición: puede_firmar_como_director) + auditoría
# ---------------------------------------------------------------------------

@override_settings(ROOT_URLCONF=__name__)
class SalioFirmadaYAuditoriaTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        _crear_configuracion_sistema()
        self.secretaria = _crear_usuario('secretaria_firma', 'secretaria')
        self.director = _crear_usuario('director_firma_emite', 'director')

        self.representante = Representante.objects.create(
            cedula='V66677788', nombre='Nora', apellido='Vega',
            telefono='0414-9998887', correo='nora@example.com', direccion='Calle 5',
        )
        self.alumno = Alumno.objects.create(
            nombre='Sofía', apellido='Vega', cedula_escolar='E84000010',
            genero='femenino', representante=self.representante,
        )
        self.plantilla = PlantillaConstancia.objects.create(
            tipo='estudio', nombre='Constancia de Estudio Firmada', destinatario='alumno',
            cuerpo_html='<p>{{alumno.nombres}} — {{documento.numero}}</p>',
            permite_estampado=True,
        )
        # Las tres condiciones "viejas" en True: plantilla.permite_estampado,
        # firmante.estampado_global_activo y firmante.firma_imagen.
        ConfiguracionFirmante.objects.create(
            nombre='Directora Principal', cedula='11122233', nacionalidad='V',
            cargo='Directora', estampado_global_activo=True,
            firma_imagen=SimpleUploadedFile('firma.png', _png_1x1_bytes(), content_type='image/png'),
        )

    def test_tres_condiciones_en_true_pero_sin_permiso_delegado_no_sale_firmada(self):
        """secretaria sin grupo ConstanciasFirmaDelegada: las 3 condiciones
        viejas están en True pero la 4ta (puede_firmar_como_director) es
        False -- la constancia se emite igual (201, no 403/400) y queda
        salio_firmada=False."""
        self.client.force_authenticate(user=self.secretaria)

        resp = self.client.post('/api/constancias/emitir/', {
            'plantilla_id': self.plantilla.id, 'alumno_id': self.alumno.id,
        }, format='json')

        self.assertEqual(resp.status_code, 201, resp.content)
        data = resp.json()
        self.assertFalse(data['salio_firmada'])
        constancia = ConstanciaEmitida.objects.get(pk=data['id'])
        self.assertFalse(constancia.salio_firmada)

    def test_cuatro_condiciones_en_true_sale_firmada(self):
        """director activo (puede_firmar_como_director=True vía rol) con
        las 4 condiciones en True -- salio_firmada=True."""
        self.client.force_authenticate(user=self.director)

        resp = self.client.post('/api/constancias/emitir/', {
            'plantilla_id': self.plantilla.id, 'alumno_id': self.alumno.id,
        }, format='json')

        self.assertEqual(resp.status_code, 201, resp.content)
        data = resp.json()
        self.assertTrue(data['salio_firmada'])
        constancia = ConstanciaEmitida.objects.get(pk=data['id'])
        self.assertTrue(constancia.salio_firmada)

    def test_secretaria_con_grupo_delegado_sale_firmada(self):
        """Permiso delegado vía Group (sin campo nuevo en el modelo, ver
        4A) -- secretaria sin rol de director también puede salir firmada
        si pertenece al grupo ConstanciasFirmaDelegada."""
        grupo, _ = Group.objects.get_or_create(name=NOMBRE_GRUPO_FIRMA_DELEGADA)
        self.secretaria.groups.add(grupo)
        self.client.force_authenticate(user=self.secretaria)

        resp = self.client.post('/api/constancias/emitir/', {
            'plantilla_id': self.plantilla.id, 'alumno_id': self.alumno.id,
        }, format='json')

        self.assertEqual(resp.status_code, 201, resp.content)
        self.assertTrue(resp.json()['salio_firmada'])

    def test_auditoria_registra_emitida_por_fecha_y_salio_firmada(self):
        antes = timezone.now()
        self.client.force_authenticate(user=self.director)

        resp = self.client.post('/api/constancias/emitir/', {
            'plantilla_id': self.plantilla.id, 'alumno_id': self.alumno.id,
        }, format='json')
        despues = timezone.now()

        self.assertEqual(resp.status_code, 201, resp.content)
        constancia = ConstanciaEmitida.objects.get(pk=resp.json()['id'])

        self.assertEqual(constancia.emitida_por_id, self.director.id)
        self.assertIsNotNone(constancia.fecha_emision)
        self.assertTrue(antes <= constancia.fecha_emision <= despues)
        self.assertTrue(constancia.salio_firmada)
