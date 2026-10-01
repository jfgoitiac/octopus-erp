"""
Portal de representantes como app instalable (PWA) con la identidad del colegio.

Cada despliegue sirve a un solo colegio, pero el build del frontend es el
mismo para todos: por eso el manifest y los íconos no pueden ser estáticos
del build (saldrían siempre "Octopus"), se generan aquí a partir de
ConfiguracionSistema.

- GET /api/portal/manifest.webmanifest — nombre, colores e íconos del colegio.
- GET /api/portal/icono-app/<tamaño>.png — logo_colegio centrado en un lienzo
  cuadrado blanco (Android/iOS exigen íconos cuadrados y opacos se ven mejor
  que un logo con transparencia sobre el fondo del launcher).

Solo se usa el logo SUBIDO (logo_colegio): un logo_url externo no se descarga
desde el servidor; en ese caso se cae a los íconos genéricos del frontend.
"""
import hashlib
import io
import logging

from django.core.cache import cache
from django.http import HttpResponse, HttpResponseNotFound, JsonResponse
from django.views import View

logger = logging.getLogger(__name__)

TAMANOS_ICONO = (180, 192, 512)
# Margen alrededor del logo: ocupa el 80% del lado para que el recorte
# redondeado de los launchers no le coma los bordes.
PROPORCION_LOGO = 0.8
COLOR_FONDO_DEFECTO = '#0fa3b1'
LARGO_MAX_NOMBRE_CORTO = 12
CACHE_TTL_ICONO = 60 * 60 * 24

ICONOS_GENERICOS = [
    {'src': '/icons/icon-192.png', 'sizes': '192x192', 'type': 'image/png'},
    {'src': '/icons/icon-512.png', 'sizes': '512x512', 'type': 'image/png'},
]


def _config():
    from secretaria.models import ConfiguracionSistema
    return ConfiguracionSistema.objects.first()


def nombre_corto(nombre):
    """Nombre bajo el ícono en la pantalla de inicio. Los launchers cortan
    cerca de los 12 caracteres ("Colegio La H..."), así que un nombre largo
    se reduce a sus iniciales en mayúscula: "Colegio La Hora de María
    Auxiliadora" → "CLHMA"."""
    nombre = (nombre or '').strip()
    if len(nombre) <= LARGO_MAX_NOMBRE_CORTO:
        return nombre
    iniciales = ''.join(p[0] for p in nombre.split() if p[0].isupper())
    if 2 <= len(iniciales) <= LARGO_MAX_NOMBRE_CORTO:
        return iniciales
    return nombre[:LARGO_MAX_NOMBRE_CORTO].rstrip()


def version_icono(config):
    """Hash del archivo de logo: cambia cuando se sube otro logo (Django
    nunca reutiliza el nombre), así el ?v= rompe la caché del navegador y
    del service worker. None si el colegio no tiene logo subido."""
    if not config or not config.logo_colegio:
        return None
    return hashlib.md5(config.logo_colegio.name.encode()).hexdigest()[:10]


def url_icono_app(config, tamano):
    """URL (relativa al host de la API) del ícono del colegio, o '' si no hay logo."""
    version = version_icono(config)
    if not version:
        return ''
    return f'/api/portal/icono-app/{tamano}.png?v={version}'


def generar_icono(config, tamano):
    """PNG cuadrado tamano×tamano con el logo centrado sobre blanco, o None."""
    from PIL import Image

    try:
        with config.logo_colegio.open('rb') as archivo:
            logo = Image.open(archivo)
            logo.load()
    except Exception:
        logger.warning('No se pudo abrir logo_colegio para el ícono de la app', exc_info=True)
        return None

    logo = logo.convert('RGBA')
    lado = int(tamano * PROPORCION_LOGO)
    logo.thumbnail((lado, lado), Image.LANCZOS)

    lienzo = Image.new('RGBA', (tamano, tamano), (255, 255, 255, 255))
    lienzo.paste(logo, ((tamano - logo.width) // 2, (tamano - logo.height) // 2), logo)

    salida = io.BytesIO()
    lienzo.convert('RGB').save(salida, format='PNG', optimize=True)
    return salida.getvalue()


class ManifestPortalView(View):
    """Web App Manifest del portal con nombre, colores e íconos del colegio."""

    def get(self, request):
        config = _config()
        nombre = (config.nombre_colegio if config else '') or 'Portal Escolar'
        color = (config.color_primario if config else '') or COLOR_FONDO_DEFECTO
        descripcion = (config.descripcion_web if config else '') or (
            'Portal de representantes — saldo, pagos, comunicaciones y rendimiento académico.'
        )

        version = version_icono(config)
        if version:
            # Rutas relativas al manifest (/api/portal/): resuelven al host
            # de la API, esté o no en el mismo dominio que el frontend.
            iconos = [
                {
                    'src': f'icono-app/{t}.png?v={version}',
                    'sizes': f'{t}x{t}',
                    'type': 'image/png',
                    'purpose': 'any',
                }
                for t in (192, 512)
            ]
        else:
            iconos = ICONOS_GENERICOS

        manifest = {
            'id': '/portal',
            'name': nombre,
            'short_name': nombre_corto(nombre),
            'description': descripcion,
            'lang': 'es',
            'start_url': '/portal',
            'scope': '/',
            'display': 'standalone',
            'background_color': '#ffffff',
            'theme_color': color,
            'icons': iconos,
        }
        respuesta = JsonResponse(manifest, content_type='application/manifest+json')
        # Corto: si el colegio cambia nombre o logo, los nuevos accesos
        # directos lo toman en minutos.
        respuesta['Cache-Control'] = 'public, max-age=300'
        return respuesta


class IconoAppPortalView(View):
    """Ícono cuadrado de la app generado desde logo_colegio."""

    def get(self, request, tamano):
        if tamano not in TAMANOS_ICONO:
            return HttpResponseNotFound()

        config = _config()
        version = version_icono(config)
        if not version:
            return HttpResponseNotFound()

        clave = f'portal_icono_app:{version}:{tamano}'
        png = cache.get(clave)
        if png is None:
            png = generar_icono(config, tamano)
            if png is None:
                return HttpResponseNotFound()
            cache.set(clave, png, timeout=CACHE_TTL_ICONO)

        respuesta = HttpResponse(png, content_type='image/png')
        # La URL lleva ?v=<hash del logo>: es seguro cachearla mucho tiempo.
        respuesta['Cache-Control'] = 'public, max-age=604800'
        return respuesta
