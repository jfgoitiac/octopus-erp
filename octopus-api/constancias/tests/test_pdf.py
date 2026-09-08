"""
Tests de `constancias/pdf.py` (generación de constancias en PDF con
ReportLab).

Usa el ORM directo para crear las instancias mínimas necesarias -- no
depende de fixtures ni de los endpoints DRF de constancias (otro agente
trabaja esa capa en paralelo, de forma independiente).
"""

from io import BytesIO

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase

from constancias.models import ConfiguracionFirmante, ConstanciaEmitida, PlantillaConstancia
from constancias.pdf import generar_pdf_constancia

# PNG 1x1 válido (rojo opaco), generado con Pillow y embebido en bytes para
# no depender de un archivo binario en el repo.
def _png_1x1_bytes():
    from io import BytesIO as _BytesIO
    from PIL import Image

    buf = _BytesIO()
    Image.new('RGB', (1, 1), color=(200, 30, 30)).save(buf, format='PNG')
    return buf.getvalue()


def _crear_usuario():
    Usuario = get_user_model()
    return Usuario.objects.create_user(username='directora_test', password='x')


def _crear_plantilla(**overrides):
    datos = dict(
        tipo='estudio',
        nombre='Constancia de estudio estándar',
        destinatario='alumno',
        cuerpo_html='<p>El alumno cursa estudios regulares en esta institución.</p>',
    )
    datos.update(overrides)
    return PlantillaConstancia.objects.create(**datos)


def _crear_constancia(usuario, plantilla, html_renderizado, **overrides):
    """Crea una ConstanciaEmitida mínima. No se llama full_clean(): pdf.py
    no lee `alumno`/`trabajador` (el HTML ya viene resuelto por el motor de
    render), así que estos tests no necesitan instancias reales de Alumno o
    Empleado -- solo lo que pdf.py efectivamente consume.
    """
    datos = dict(
        numero=overrides.pop('numero', 'CONST-0001'),
        tipo=plantilla.tipo,
        plantilla=plantilla,
        html_renderizado=html_renderizado,
        salio_firmada=False,
        emitida_por=usuario,
        periodo_escolar='2025-2026',
    )
    datos.update(overrides)
    return ConstanciaEmitida.objects.create(**datos)


class GenerarPdfConstanciaSinImagenesTests(TestCase):
    """1. salio_firmada=False y sin ninguna imagen configurada (ni logo, ni
    encabezado, ni firma) -- debe generar bytes de PDF válidos sin lanzar
    excepción.
    """

    def test_genera_pdf_sin_ninguna_imagen_configurada(self):
        usuario = _crear_usuario()
        plantilla = _crear_plantilla()
        constancia = _crear_constancia(
            usuario, plantilla,
            html_renderizado='<p>Quien suscribe hace constar que el alumno cursa estudios.</p>',
            numero='CONST-0001',
        )

        # No debe lanzar excepción de ningún tipo, aunque no exista
        # ConfiguracionSistema ni ConfiguracionFirmante en la BD de test.
        resultado = generar_pdf_constancia(constancia)

        self.assertIsInstance(resultado, bytes)
        self.assertGreater(len(resultado), 0)
        self.assertTrue(resultado.startswith(b'%PDF-'))


class GenerarPdfConstanciaFirmadaTests(TestCase):
    """2. salio_firmada=True y ConfiguracionFirmante con firma_imagen
    cargada -- el PDF se genera igual sin excepción.
    """

    def test_genera_pdf_con_firma_imagen_cargada(self):
        usuario = _crear_usuario()
        plantilla = _crear_plantilla(tipo='conducta', nombre='Constancia de conducta')

        png_bytes = _png_1x1_bytes()
        ConfiguracionFirmante.objects.create(
            nombre='María Pérez',
            cedula='12345678',
            nacionalidad='V',
            cargo='Directora',
            firma_imagen=SimpleUploadedFile('firma.png', png_bytes, content_type='image/png'),
            sello_imagen=SimpleUploadedFile('sello.png', png_bytes, content_type='image/png'),
        )

        constancia = _crear_constancia(
            usuario, plantilla,
            html_renderizado='<p>Quien suscribe hace constar la buena conducta del alumno.</p>',
            salio_firmada=True,
            numero='CONST-0002',
        )

        resultado = generar_pdf_constancia(constancia)

        self.assertIsInstance(resultado, bytes)
        self.assertGreater(len(resultado), 0)
        self.assertTrue(resultado.startswith(b'%PDF-'))

    def test_genera_pdf_firmado_sin_imagenes_de_firma_no_lanza_excepcion(self):
        """salio_firmada=True pero ConfiguracionFirmante sin imágenes
        cargadas (o sin fila en absoluto) -- tampoco debe romper.
        """
        usuario = _crear_usuario()
        plantilla = _crear_plantilla(tipo='retiro', nombre='Constancia de retiro')

        ConfiguracionFirmante.objects.create(
            nombre='Carlos Gómez',
            cedula='87654321',
            nacionalidad='V',
            cargo='Director',
        )

        constancia = _crear_constancia(
            usuario, plantilla,
            html_renderizado='<p>Quien suscribe hace constar el retiro del alumno.</p>',
            salio_firmada=True,
            numero='CONST-0003',
        )

        resultado = generar_pdf_constancia(constancia)

        self.assertIsInstance(resultado, bytes)
        self.assertTrue(resultado.startswith(b'%PDF-'))


class GenerarPdfConstanciaWhitelistHtmlTests(TestCase):
    """3. html_renderizado con las tags de la whitelist (p, strong, em, u,
    ul, ol, li, h1-h3, br) -- no lanza excepción y produce un PDF con
    contenido.
    """

    def test_genera_pdf_con_todas_las_tags_de_la_whitelist(self):
        usuario = _crear_usuario()
        plantilla = _crear_plantilla(tipo='trabajo', nombre='Constancia de trabajo', destinatario='trabajador')

        html = (
            '<h1>Encabezado principal</h1>'
            '<h2>Subtítulo</h2>'
            '<h3>Sub-subtítulo</h3>'
            '<p>Quien suscribe <strong>hace constar</strong> que <em>el trabajador</em> '
            'presta servicios <u>de forma continua</u> en esta institución.<br/>'
            'Segunda línea del mismo párrafo.</p>'
            '<ul><li>Primer punto</li><li>Segundo punto con <strong>énfasis</strong></li></ul>'
            '<ol><li>Paso uno</li><li>Paso dos</li></ol>'
        )

        constancia = _crear_constancia(
            usuario, plantilla,
            html_renderizado=html,
            numero='CONST-0004',
        )

        resultado = generar_pdf_constancia(constancia)

        self.assertIsInstance(resultado, bytes)
        self.assertGreater(len(resultado), 500)  # con este contenido, el PDF no debería salir vacío/mínimo
        self.assertTrue(resultado.startswith(b'%PDF-'))

    def test_html_con_estructura_inesperada_no_lanza_excepcion(self):
        """Estructura rota/no whitelist (tags sin cerrar, tags fuera de la
        whitelist ya colados) -- pdf.py debe degradar a texto plano en vez
        de fallar.
        """
        usuario = _crear_usuario()
        plantilla = _crear_plantilla()

        html_roto = '<p>Párrafo sin cerrar <strong>negrita sin cerrar <div>tag no soportado</div>'

        constancia = _crear_constancia(
            usuario, plantilla,
            html_renderizado=html_roto,
            numero='CONST-0005',
        )

        resultado = generar_pdf_constancia(constancia)

        self.assertIsInstance(resultado, bytes)
        self.assertTrue(resultado.startswith(b'%PDF-'))


class GenerarPdfConstanciaFirmaHeaderTests(TestCase):
    """4. Verifica que el resultado empiece con la firma de cabecera de un
    PDF válido (b'%PDF-') en al menos un caso -- cubierto explícitamente
    aquí además de en los demás tests.
    """

    def test_pdf_generado_empieza_con_firma_pdf_valida(self):
        usuario = _crear_usuario()
        plantilla = _crear_plantilla()
        constancia = _crear_constancia(
            usuario, plantilla,
            html_renderizado='<p>Contenido mínimo de prueba.</p>',
            numero='CONST-0006',
        )

        resultado = generar_pdf_constancia(constancia)

        self.assertEqual(resultado[:5], b'%PDF-')
