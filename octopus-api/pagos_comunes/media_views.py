"""
Vista para servir comprobantes de pago (media/comprobantes/) con control de
acceso real.

Contexto (ver comentario en config/settings.py junto a MEDIA_URL/MEDIA_ROOT):
en producción se espera que nginx sirva /media/ directamente o vía
X-Accel-Redirect, pero el repo no incluye el nginx conf real de app.clhma.com.
Los comprobantes
contienen datos bancarios y nombres de representantes — si nginx los sirve
directo desde /media/comprobantes/ sin autenticación, cualquiera que conozca
o adivine el nombre de archivo puede descargarlos.

Esta vista es el control de acceso real, en Django, para ese archivo:
- Requiere autenticación (admin del panel o representante del portal).
- Verifica que quien pide el archivo tenga permiso sobre ese comprobante
  específico (staff con rol de cobranza/admin/director, o el representante
  dueño de la mensualidad asociada).
- En DEBUG sirve el archivo directo (no hay nginx en desarrollo local).
- Fuera de DEBUG, delega el servido real a nginx vía X-Accel-Redirect,
  apuntando a una ubicación interna /protected-media/ que nginx debe mapear
  a MEDIA_ROOT con `internal;` (ver deploy/nginx/app.clhma.com.snippet.conf).
  Esto evita que Django tenga que leer y transmitir el archivo completo en
  producción — nginx lo hace de forma eficiente, pero solo después de que
  esta vista autorizó la solicitud.

IMPORTANTE: mientras el nginx real de app.clhma.com no tenga el bloque
`location /protected-media/ { internal; ... }` configurado, el
X-Accel-Redirect no funcionará. Ver el snippet de nginx para más detalle.

La ruta vive bajo /api/ (api/media-protegido/comprobantes/<filename>/) porque
nginx solo reenvía /api/ y /admin/ a Django: fuera de /api/ el `try_files` del
SPA devolvía index.html con 200 y el visor mostraba una imagen rota.
"""
import mimetypes
import os

from django.conf import settings
from django.http import FileResponse, HttpResponse
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status, permissions

from authentication.authentication import AdminJWTAuthentication
from portal.authentication import PortalJWTAuthentication
from portal.models import ComprobantePago

ROLES_STAFF_PERMITIDOS = ('director', 'sistemas', 'administrador', 'cobranza', 'cajero')
RUTA_COMPROBANTES = '/api/media-protegido/comprobantes/'


def url_archivo_comprobante(request, comprobante):
    """URL (absoluta si hay request) de la ruta protegida del archivo, o None."""
    if not comprobante.archivo:
        return None
    ruta = f'{RUTA_COMPROBANTES}{os.path.basename(comprobante.archivo.name)}/'
    return request.build_absolute_uri(ruta) if request is not None else ruta


class ComprobanteProtegidoView(APIView):
    """
    Sirve un comprobante de pago (media/comprobantes/<filename>) solo a
    quien tiene permiso sobre él: staff con rol de cobranza/admin/director,
    o el representante dueño de la mensualidad asociada al comprobante.

    Devuelve 404 (no 403) cuando el comprobante no existe o no pertenece a
    quien lo pide, para no filtrar la existencia de archivos vía enumeración
    de nombres.
    """
    authentication_classes = [AdminJWTAuthentication, PortalJWTAuthentication]
    # AllowAny a nivel de DRF: el chequeo real de "quién puede ver este
    # comprobante" es específico al objeto y se hace en get()/_usuario_autorizado.
    permission_classes = [permissions.AllowAny]

    def get(self, request, filename):
        user = request.user
        if user is None or not user.is_authenticated:
            return Response(status=status.HTTP_404_NOT_FOUND)

        relative_path = f'comprobantes/{filename}'
        comprobante = (
            ComprobantePago.objects
            .select_related('mensualidad__alumno__representante')
            .filter(archivo=relative_path)
            .first()
        )
        if comprobante is None:
            return Response(status=status.HTTP_404_NOT_FOUND)

        if not self._usuario_autorizado(user, comprobante):
            return Response(status=status.HTTP_404_NOT_FOUND)

        if not comprobante.archivo or not comprobante.archivo.storage.exists(comprobante.archivo.name):
            return Response(status=status.HTTP_404_NOT_FOUND)

        if settings.DEBUG:
            return FileResponse(comprobante.archivo.open('rb'))

        # Producción: delega el servido real a nginx vía X-Accel-Redirect.
        # nginx debe mapear /protected-media/ (con `internal;`) a MEDIA_ROOT
        # — ver deploy/nginx/app.clhma.com.snippet.conf.
        internal_path = f'/protected-media/{comprobante.archivo.name}'
        response = HttpResponse()
        # nginx conserva el Content-Type de la respuesta original: se envía el
        # real para que el navegador sepa renderizar imagen o PDF.
        response['Content-Type'] = (
            mimetypes.guess_type(comprobante.archivo.name)[0] or 'application/octet-stream'
        )
        response['X-Accel-Redirect'] = internal_path
        return response

    @staticmethod
    def _usuario_autorizado(user, comprobante):
        perfil = getattr(user, 'perfil', None)
        rol = getattr(perfil, 'rol', '')
        if user.is_superuser or rol in ROLES_STAFF_PERMITIDOS:
            return True

        rep_user = getattr(user, 'representante_portal', None)
        if rep_user is None:
            return False

        try:
            representante_dueno = comprobante.mensualidad.alumno.representante
        except AttributeError:
            return False

        return rep_user.representante_id == representante_dueno.id
