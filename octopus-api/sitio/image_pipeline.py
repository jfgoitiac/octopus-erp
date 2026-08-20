"""
Pipeline de imágenes de la biblioteca de Media (SITIO_CONTRATO_API.md §5).

Al subir una imagen a `Media`:
1. Se valida tamaño (<=15MB) y MIME (jpeg/png/webp) en la vista (ver sitio/views.py).
2. Se guarda el archivo original tal cual.
3. Aquí se generan variantes WebP (thumb/sm/md/lg) con Pillow, manteniendo
   aspect ratio y SIN upscaling si el original es más chico que el ancho
   objetivo de la variante.
4. Las URLs resultantes se guardan en el JSONField `variantes`.
"""
import logging
import os

from django.core.files.base import ContentFile
from PIL import Image, ImageOps

logger = logging.getLogger(__name__)

# ancho objetivo (px) por variante — ver contrato §5
VARIANTES_ANCHO = {
    'thumb': 200,
    'sm': 480,
    'md': 960,
    'lg': 1600,
}

_CALIDAD_WEBP = 82


def generar_variantes_webp(media_instance):
    """
    Genera las variantes WebP del `archivo_original` de una instancia de Media
    y las guarda en disco bajo la misma carpeta de storage. Devuelve un dict
    {thumb, sm, md, lg, original} con las URLs públicas resultantes.

    No lanza excepción si Pillow no puede procesar el archivo (por ejemplo un
    formato no soportado que igual pasó el whitelist de MIME) — en ese caso
    solo se guarda 'original' y se loggea un warning, para que la subida no
    falle por completo.
    """
    archivo = media_instance.archivo_original
    variantes = {'original': archivo.url}

    try:
        archivo.open('rb')
        imagen = Image.open(archivo)
        # Corrige orientación EXIF (fotos de celular) antes de medir/redimensionar
        imagen = ImageOps.exif_transpose(imagen)
        if imagen.mode not in ('RGB', 'RGBA'):
            imagen = imagen.convert('RGBA' if 'A' in imagen.mode else 'RGB')

        ancho_original, alto_original = imagen.size

        base_nombre, _ext = os.path.splitext(os.path.basename(archivo.name))
        carpeta_destino = os.path.join('sitio', 'media', 'variantes', str(media_instance.pk or 'tmp'))

        for etiqueta, ancho_objetivo in VARIANTES_ANCHO.items():
            # Sin upscaling: si el original es más angosto que el ancho objetivo,
            # la variante usa el ancho original.
            ancho_final = min(ancho_objetivo, ancho_original)
            alto_final = max(1, round(alto_original * (ancho_final / ancho_original)))

            copia = imagen.copy()
            copia.thumbnail((ancho_final, alto_final), Image.LANCZOS)

            buffer_bytes = ContentFile(b'')
            copia.save(buffer_bytes, format='WEBP', quality=_CALIDAD_WEBP, method=6)

            nombre_variante = f'{base_nombre}_{etiqueta}.webp'
            ruta_relativa = os.path.join(carpeta_destino, nombre_variante)

            storage = archivo.storage
            buffer_bytes.seek(0)
            ruta_guardada = storage.save(ruta_relativa, buffer_bytes)
            variantes[etiqueta] = storage.url(ruta_guardada)

    except Exception as exc:
        # Fallback: la imagen queda utilizable con solo el original si Pillow
        # no puede procesarla (no debe romper la subida completa).
        logger.warning(
            'No se pudieron generar variantes WebP para Media #%s: %s',
            getattr(media_instance, 'pk', None), exc,
        )
    finally:
        try:
            archivo.close()
        except Exception:
            pass

    return variantes
