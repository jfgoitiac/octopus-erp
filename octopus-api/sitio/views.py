import copy
import logging
import secrets
from datetime import timedelta

from django.db import transaction
from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.utils import timezone

from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from config.pagination import StandardResultsPagination

from .image_pipeline import generar_variantes_webp
from .models import (
    Articulo,
    Categoria,
    ConfiguracionSitio,
    ItemMenu,
    Media,
    Menu,
    Pagina,
    PatronBloque,
    PlantillaPagina,
    PreviewSesion,
    Seccion,
)
from .permissions import IsDirectorOrSistemas
from .serializers import (
    ArticuloDetalleSerializer,
    ArticuloListaPublicaSerializer,
    ArticuloListSerializer,
    ArticuloPublicoSerializer,
    CategoriaSerializer,
    ConfiguracionSitioPublicaSerializer,
    ConfiguracionSitioSerializer,
    expandir_media_en_contenido,
    ItemMenuInputSerializer,
    MediaSerializer,
    MenuInputSerializer,
    MenuPublicoSerializer,
    MenuSerializer,
    PaginaDetalleSerializer,
    PaginaListSerializer,
    PaginaPublicaSerializer,
    PatronBloqueSerializer,
    PlantillaPaginaSerializer,
    PreviewPlantillaInputSerializer,
    SeccionReordenarSerializer,
    SeccionSerializer,
)

# TTL de una sesión de vista previa (CrearPaginaModal / ConstructorPaginas →
# octopus-sitio /preview/<token>) — suficiente para revisar el resultado sin
# dejar filas huérfanas creciendo indefinidamente en PreviewSesion.
_PREVIEW_TTL = timedelta(minutes=30)


def _crear_preview_sesion(payload):
    """Crea una PreviewSesion con token opaco y purga las ya expiradas."""
    PreviewSesion.objects.filter(expira_en__lt=timezone.now()).delete()
    token = secrets.token_urlsafe(24)
    expira_en = timezone.now() + _PREVIEW_TTL
    PreviewSesion.objects.create(token=token, payload=payload, expira_en=expira_en)
    return token, expira_en

logger = logging.getLogger(__name__)

# Tamaño máximo de imagen para la biblioteca de Media: 15 MB (contrato §5).
_MEDIA_MAX_BYTES = 15 * 1024 * 1024
_MEDIA_CONTENT_TYPES_PERMITIDOS = {'image/jpeg', 'image/png', 'image/webp'}


def _validar_imagen_media(archivo):
    """
    Valida tamaño (<=15MB) y MIME (jpeg/png/webp) de una imagen subida a la
    biblioteca de Media, mismo patrón de whitelist que portal/views.py con
    comprobantes (tamaño + content-type + magic bytes).
    Devuelve un mensaje de error (str) o None si la imagen es válida.
    """
    if archivo.size > _MEDIA_MAX_BYTES:
        return 'El archivo supera el tamaño máximo permitido (15 MB).'

    content_type = getattr(archivo, 'content_type', '')
    if content_type not in _MEDIA_CONTENT_TYPES_PERMITIDOS:
        return 'Formato no permitido. Use JPG, PNG o WEBP.'

    archivo.seek(0)
    header = archivo.read(12)
    archivo.seek(0)
    es_jpeg = header[:3] == b'\xff\xd8\xff'
    es_png = header[:8] == b'\x89PNG\r\n\x1a\n'
    es_webp = header[:4] == b'RIFF' and header[8:12] == b'WEBP'
    if not (es_jpeg or es_png or es_webp):
        return 'El contenido del archivo no corresponde a una imagen válida.'

    return None


def _rol_activo(request):
    perfil = getattr(request.user, 'perfil', None)
    if perfil is None:
        return ''
    return perfil.rol if perfil.esta_activo else ''


# ══════════════════════════════════════════════════════════════════════════════
# ADMIN — CONFIGURACIÓN DEL SITIO (singleton)
# ══════════════════════════════════════════════════════════════════════════════

class ConfiguracionSitioAdminView(APIView):
    """GET/PATCH api/sitio/admin/configuracion/ — singleton, sin create/delete."""
    permission_classes = [permissions.IsAuthenticated, IsDirectorOrSistemas]

    def get(self, request):
        config = ConfiguracionSitio.obtener()
        return Response(ConfiguracionSitioSerializer(config, context={'request': request}).data)

    def patch(self, request):
        config = ConfiguracionSitio.obtener()
        serializer = ConfiguracionSitioSerializer(
            config, data=request.data, partial=True, context={'request': request}
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


# ══════════════════════════════════════════════════════════════════════════════
# ADMIN — PÁGINAS
# ══════════════════════════════════════════════════════════════════════════════

class PaginaListCreateAdminView(APIView):
    """GET/POST api/sitio/admin/paginas/ — filtros: estado, search."""
    permission_classes = [permissions.IsAuthenticated, IsDirectorOrSistemas]
    pagination_class = StandardResultsPagination

    def get(self, request):
        # Papelera (Fase 2) siempre excluida de este listado — tiene su propia
        # vista (PaginaPapeleraAdminView) para no mezclar borradores/publicadas
        # con páginas eliminadas en ningún filtro de `estado`.
        qs = Pagina.objects.filter(eliminado_en__isnull=True)

        estado = request.query_params.get('estado')
        if estado:
            qs = qs.filter(estado=estado)

        search = request.query_params.get('search')
        if search:
            qs = qs.filter(Q(titulo__icontains=search) | Q(slug__icontains=search))

        paginator = self.pagination_class()
        pagina_actual = paginator.paginate_queryset(qs, request, view=self)
        serializer = PaginaListSerializer(pagina_actual, many=True, context={'request': request})
        return paginator.get_paginated_response(serializer.data)

    def post(self, request):
        serializer = PaginaDetalleSerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        serializer.save(creado_por=request.user if request.user.is_authenticated else None)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class PaginaDetailAdminView(APIView):
    """GET/PATCH/DELETE api/sitio/admin/paginas/<id>/."""
    permission_classes = [permissions.IsAuthenticated, IsDirectorOrSistemas]

    def get_object(self, pk):
        return get_object_or_404(Pagina, pk=pk)

    def get(self, request, pk):
        return Response(PaginaDetalleSerializer(self.get_object(pk), context={'request': request}).data)

    def patch(self, request, pk):
        pagina = self.get_object(pk)
        serializer = PaginaDetalleSerializer(pagina, data=request.data, partial=True, context={'request': request})
        serializer.is_valid(raise_exception=True)
        serializer.save(actualizado_por=request.user if request.user.is_authenticated else None)
        return Response(serializer.data)

    def delete(self, request, pk):
        # Fase 2: borrado permanente solo permitido si la página ya pasó por
        # la papelera (POST .../papelera/) — evita perder contenido sin red
        # de seguridad. El botón "Eliminar" del admin ahora manda a papelera;
        # "Eliminar definitivamente" (solo visible dentro de la papelera) es
        # el único que llega hasta aquí con la página ya en eliminado_en.
        pagina = self.get_object(pk)
        if pagina.eliminado_en is None:
            return Response(
                {'detail': 'Esta página no está en la papelera. Envíala a la papelera antes de eliminarla definitivamente.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        pagina.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class PaginaPapeleraAdminView(APIView):
    """GET api/sitio/admin/paginas/papelera/ — listado paginado de páginas en la papelera."""
    permission_classes = [permissions.IsAuthenticated, IsDirectorOrSistemas]
    pagination_class = StandardResultsPagination

    def get(self, request):
        qs = Pagina.objects.filter(eliminado_en__isnull=False).order_by('-eliminado_en')
        paginator = self.pagination_class()
        pagina_actual = paginator.paginate_queryset(qs, request, view=self)
        serializer = PaginaListSerializer(pagina_actual, many=True, context={'request': request})
        return paginator.get_paginated_response(serializer.data)


class PaginaEnviarPapeleraAdminView(APIView):
    """
    POST api/sitio/admin/paginas/<id>/papelera/ — soft-delete: fuerza
    estado=borrador y es_home=False (así los endpoints públicos, que ya
    filtran por estado=publicado, la excluyen sin cambios adicionales) y
    marca eliminado_en. No borra secciones ni datos.
    """
    permission_classes = [permissions.IsAuthenticated, IsDirectorOrSistemas]

    def post(self, request, pk):
        pagina = get_object_or_404(Pagina, pk=pk)
        pagina.estado = 'borrador'
        pagina.es_home = False
        pagina.eliminado_en = timezone.now()
        pagina.save(update_fields=['estado', 'es_home', 'eliminado_en'])
        return Response(PaginaDetalleSerializer(pagina, context={'request': request}).data)


class PaginaRestaurarAdminView(APIView):
    """
    POST api/sitio/admin/paginas/<id>/restaurar/ — saca la página de la
    papelera. Queda en borrador (el usuario debe republicarla a propósito,
    no se reactiva sola).
    """
    permission_classes = [permissions.IsAuthenticated, IsDirectorOrSistemas]

    def post(self, request, pk):
        pagina = get_object_or_404(Pagina, pk=pk)
        if pagina.eliminado_en is None:
            return Response({'detail': 'Esta página no está en la papelera.'}, status=status.HTTP_400_BAD_REQUEST)
        pagina.eliminado_en = None
        pagina.save(update_fields=['eliminado_en'])
        return Response(PaginaDetalleSerializer(pagina, context={'request': request}).data)


class PaginaDuplicarAdminView(APIView):
    """
    POST api/sitio/admin/paginas/<id>/duplicar/ — copia la página y todas sus
    secciones. La copia queda en borrador, sin es_home, con slug/título
    nuevos (sufijo autogenerado por generar_slug_unico si "<titulo> (copia)"
    ya existe).
    """
    permission_classes = [permissions.IsAuthenticated, IsDirectorOrSistemas]

    def post(self, request, pk):
        original = get_object_or_404(Pagina, pk=pk)
        with transaction.atomic():
            copia = Pagina.objects.create(
                titulo=f'{original.titulo} (copia)',
                estado='borrador',
                es_home=False,
                orden_menu=original.orden_menu,
                mostrar_en_menu=original.mostrar_en_menu,
                seo_titulo=original.seo_titulo,
                seo_descripcion=original.seo_descripcion,
                creado_por=request.user if request.user.is_authenticated else None,
            )
            for seccion in original.secciones.order_by('orden', 'id'):
                Seccion.objects.create(
                    pagina=copia,
                    tipo=seccion.tipo,
                    orden=seccion.orden,
                    contenido=copy.deepcopy(seccion.contenido),
                    animacion=seccion.animacion,
                    config_estilo=copy.deepcopy(seccion.config_estilo),
                )
        return Response(
            PaginaDetalleSerializer(copia, context={'request': request}).data,
            status=status.HTTP_201_CREATED,
        )


class PaginaPublicarAdminView(APIView):
    """POST api/sitio/admin/paginas/<id>/publicar/."""
    permission_classes = [permissions.IsAuthenticated, IsDirectorOrSistemas]

    def post(self, request, pk):
        pagina = get_object_or_404(Pagina, pk=pk)
        pagina.estado = 'publicado'
        pagina.publicado_en = timezone.now()
        pagina.actualizado_por = request.user if request.user.is_authenticated else None
        pagina.save(update_fields=['estado', 'publicado_en', 'actualizado_por'])
        return Response(PaginaDetalleSerializer(pagina, context={'request': request}).data)


class PaginaDespublicarAdminView(APIView):
    """POST api/sitio/admin/paginas/<id>/despublicar/."""
    permission_classes = [permissions.IsAuthenticated, IsDirectorOrSistemas]

    def post(self, request, pk):
        pagina = get_object_or_404(Pagina, pk=pk)
        pagina.estado = 'borrador'
        pagina.actualizado_por = request.user if request.user.is_authenticated else None
        pagina.save(update_fields=['estado', 'actualizado_por'])
        return Response(PaginaDetalleSerializer(pagina, context={'request': request}).data)


class PaginaConSeccionesAdminView(APIView):
    """
    POST api/sitio/admin/paginas/con-secciones/ — crea una Pagina y sus
    Secciones iniciales en una sola llamada atómica (flujo "elegir plantilla"
    del editor: hoy no hay endpoint bulk, crear una página con N secciones
    requiere N+1 llamadas separadas).

    Body: {titulo, es_home?, mostrar_en_menu?, secciones: [{tipo, contenido,
    animacion, config_estilo}, ...]}. `secciones` es opcional (página en
    blanco). El `orden` de cada sección es su índice en la lista.

    Body alternativo (Fase 2 — "Tus plantillas"): {..., plantilla_usuario_id}
    en vez de `secciones` — copia las secciones RAW de esa `PlantillaPagina`
    (con media por id, no expandida) directo en el servidor. Necesario porque
    el admin también consume `PlantillaPaginaSerializer` para mostrar el
    mockup con fotos reales, que expande cada `media_id` a
    `{id, variantes, alt_text}` — si el frontend reenviara esa forma expandida
    como `secciones`, quedaría guardada así en vez del id crudo que espera el
    contrato (SITIO_CONTRATO_API.md §4).
    """
    permission_classes = [permissions.IsAuthenticated, IsDirectorOrSistemas]

    def post(self, request):
        datos_pagina = {
            k: v for k, v in request.data.items() if k not in ('secciones', 'plantilla_usuario_id')
        }
        plantilla_usuario_id = request.data.get('plantilla_usuario_id')
        if plantilla_usuario_id:
            plantilla = get_object_or_404(PlantillaPagina, pk=plantilla_usuario_id)
            secciones_data = plantilla.secciones or []
        else:
            secciones_data = request.data.get('secciones') or []

        with transaction.atomic():
            pagina_serializer = PaginaDetalleSerializer(data=datos_pagina)
            pagina_serializer.is_valid(raise_exception=True)
            pagina = pagina_serializer.save(
                creado_por=request.user if request.user.is_authenticated else None
            )

            for orden, seccion_data in enumerate(secciones_data):
                seccion_serializer = SeccionSerializer(data={**seccion_data, 'pagina': pagina.pk, 'orden': orden})
                seccion_serializer.is_valid(raise_exception=True)
                seccion_serializer.save(pagina=pagina, orden=orden)

        return Response(
            PaginaDetalleSerializer(pagina, context={'request': request}).data,
            status=status.HTTP_201_CREATED,
        )


class PaginaPreviewAdminView(APIView):
    """
    POST api/sitio/admin/paginas/<id>/preview/ — genera una PreviewSesion con
    las secciones ACTUALES de la página (cualquiera sea su `estado`, a
    diferencia del endpoint público que solo sirve páginas publicadas) y
    devuelve un token opaco para abrir en octopus-sitio (`/preview/<token>`),
    donde se renderiza con el mismo motor animado (Framer Motion/Embla) que
    el sitio en vivo. Usado por el botón "Vista previa" del editor visual.
    """
    permission_classes = [permissions.IsAuthenticated, IsDirectorOrSistemas]

    def post(self, request, pk):
        pagina = get_object_or_404(Pagina, pk=pk)
        payload = PaginaPublicaSerializer(pagina, context={'request': request}).data
        token, expira_en = _crear_preview_sesion(payload)
        return Response({'token': token, 'expira_en': expira_en})


class PreviewPlantillaAdminView(APIView):
    """
    POST api/sitio/admin/preview-plantilla/ — igual que
    `PaginaPreviewAdminView` pero para secciones "sueltas" que todavía no son
    una `Pagina` guardada: la galería de plantillas de `CrearPaginaModal`
    (paso 2) manda su catálogo (`components/sitio/plantillas.js`) para que el
    usuario vea cómo se ve realmente antes de decidir cuál usar.

    Body: {titulo?, secciones: [{tipo, contenido, animacion, config_estilo}]}.
    """
    permission_classes = [permissions.IsAuthenticated, IsDirectorOrSistemas]

    def post(self, request):
        entrada = PreviewPlantillaInputSerializer(data=request.data)
        entrada.is_valid(raise_exception=True)
        datos = entrada.validated_data

        secciones_payload = [
            {
                'id': None,
                'pagina': None,
                'tipo': s['tipo'],
                'orden': orden,
                'contenido': expandir_media_en_contenido(s.get('contenido'), request),
                'animacion': s.get('animacion', ''),
                'config_estilo': s.get('config_estilo') or {},
            }
            for orden, s in enumerate(datos['secciones'])
        ]
        payload = {
            'id': None,
            'titulo': datos.get('titulo') or 'Vista previa de plantilla',
            'slug': None,
            'es_home': False,
            'seo_titulo': '',
            'seo_descripcion': '',
            'publicado_en': None,
            'secciones': secciones_payload,
        }
        token, expira_en = _crear_preview_sesion(payload)
        return Response({'token': token, 'expira_en': expira_en})


# ══════════════════════════════════════════════════════════════════════════════
# ADMIN — SECCIONES
# ══════════════════════════════════════════════════════════════════════════════

def _marcar_pagina_actualizada(pagina, request):
    """
    Historial mínimo (Fase 2): editar bloques es la forma más común de editar
    una página, así que también cuenta como "actualización" para
    Pagina.actualizado_por/actualizado_en, no solo el PATCH de metadatos.
    """
    pagina.actualizado_por = request.user if request.user.is_authenticated else None
    pagina.save(update_fields=['actualizado_por', 'actualizado_en'])


class SeccionListCreateAdminView(APIView):
    """GET/POST api/sitio/admin/paginas/<pagina_id>/secciones/ — ordenado por orden."""
    permission_classes = [permissions.IsAuthenticated, IsDirectorOrSistemas]

    def get(self, request, pagina_id):
        get_object_or_404(Pagina, pk=pagina_id)
        secciones = Seccion.objects.filter(pagina_id=pagina_id).order_by('orden', 'id')
        return Response(SeccionSerializer(secciones, many=True, context={'request': request}).data)

    def post(self, request, pagina_id):
        pagina = get_object_or_404(Pagina, pk=pagina_id)
        data = request.data.copy() if hasattr(request.data, 'copy') else dict(request.data)
        data['pagina'] = pagina.pk
        serializer = SeccionSerializer(data=data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        serializer.save(pagina=pagina)
        _marcar_pagina_actualizada(pagina, request)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class SeccionDetailAdminView(APIView):
    """PATCH/DELETE api/sitio/admin/secciones/<id>/."""
    permission_classes = [permissions.IsAuthenticated, IsDirectorOrSistemas]

    def get_object(self, pk):
        return get_object_or_404(Seccion, pk=pk)

    def patch(self, request, pk):
        seccion = self.get_object(pk)
        serializer = SeccionSerializer(seccion, data=request.data, partial=True, context={'request': request})
        serializer.is_valid(raise_exception=True)
        serializer.save()
        _marcar_pagina_actualizada(seccion.pagina, request)
        return Response(serializer.data)

    def delete(self, request, pk):
        seccion = self.get_object(pk)
        pagina = seccion.pagina
        seccion.delete()
        _marcar_pagina_actualizada(pagina, request)
        return Response(status=status.HTTP_204_NO_CONTENT)


class SeccionReordenarAdminView(APIView):
    """POST api/sitio/admin/paginas/<pagina_id>/secciones/reordenar/ — body {orden: [id,...]}."""
    permission_classes = [permissions.IsAuthenticated, IsDirectorOrSistemas]

    def post(self, request, pagina_id):
        pagina = get_object_or_404(Pagina, pk=pagina_id)
        serializer = SeccionReordenarSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        ids_orden = serializer.validated_data['orden']

        secciones_de_pagina = set(
            Seccion.objects.filter(pagina_id=pagina_id).values_list('id', flat=True)
        )
        ids_invalidos = [i for i in ids_orden if i not in secciones_de_pagina]
        if ids_invalidos:
            return Response(
                {'error': f'Los siguientes ids no pertenecen a esta página: {ids_invalidos}'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        with transaction.atomic():
            for posicion, seccion_id in enumerate(ids_orden):
                Seccion.objects.filter(pk=seccion_id).update(orden=posicion)

        _marcar_pagina_actualizada(pagina, request)
        secciones = Seccion.objects.filter(pagina_id=pagina_id).order_by('orden', 'id')
        return Response(SeccionSerializer(secciones, many=True, context={'request': request}).data)


# ══════════════════════════════════════════════════════════════════════════════
# ADMIN — PATRONES DE BLOQUE Y PLANTILLAS DE PÁGINA DEL USUARIO (Fase 2)
# ══════════════════════════════════════════════════════════════════════════════

class PatronBloqueListCreateAdminView(APIView):
    """GET/POST api/sitio/admin/patrones/ — bloques guardados para reusar en cualquier página."""
    permission_classes = [permissions.IsAuthenticated, IsDirectorOrSistemas]

    def get(self, request):
        patrones = PatronBloque.objects.all()
        tipo = request.query_params.get('tipo')
        if tipo:
            patrones = patrones.filter(tipo=tipo)
        return Response(PatronBloqueSerializer(patrones, many=True, context={'request': request}).data)

    def post(self, request):
        serializer = PatronBloqueSerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        serializer.save(creado_por=request.user if request.user.is_authenticated else None)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class PatronBloqueDetailAdminView(APIView):
    """DELETE api/sitio/admin/patrones/<id>/."""
    permission_classes = [permissions.IsAuthenticated, IsDirectorOrSistemas]

    def delete(self, request, pk):
        patron = get_object_or_404(PatronBloque, pk=pk)
        patron.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class PlantillaPaginaListCreateAdminView(APIView):
    """
    GET/POST api/sitio/admin/plantillas-usuario/ — plantillas de página
    propias del colegio (junto al catálogo fijo de plantillas.js, pero
    guardadas por el usuario en vez de venir en el código).
    """
    permission_classes = [permissions.IsAuthenticated, IsDirectorOrSistemas]

    def get(self, request):
        plantillas = PlantillaPagina.objects.all()
        return Response(PlantillaPaginaSerializer(plantillas, many=True, context={'request': request}).data)

    def post(self, request):
        serializer = PlantillaPaginaSerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        serializer.save(creado_por=request.user if request.user.is_authenticated else None)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class PlantillaPaginaDetailAdminView(APIView):
    """DELETE api/sitio/admin/plantillas-usuario/<id>/."""
    permission_classes = [permissions.IsAuthenticated, IsDirectorOrSistemas]

    def delete(self, request, pk):
        plantilla = get_object_or_404(PlantillaPagina, pk=pk)
        plantilla.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class PlantillaPaginaDesdeAdminView(APIView):
    """
    POST api/sitio/admin/paginas/<id>/guardar-como-plantilla/ — congela las
    secciones ACTUALES de una página existente como PlantillaPagina nueva.
    Body: {nombre}.
    """
    permission_classes = [permissions.IsAuthenticated, IsDirectorOrSistemas]

    def post(self, request, pk):
        pagina = get_object_or_404(Pagina, pk=pk)
        nombre = (request.data.get('nombre') or '').strip() or pagina.titulo
        secciones = [
            {
                'tipo': s.tipo,
                'contenido': copy.deepcopy(s.contenido),
                'animacion': s.animacion,
                'config_estilo': copy.deepcopy(s.config_estilo),
            }
            for s in pagina.secciones.order_by('orden', 'id')
        ]
        if not secciones:
            return Response(
                {'detail': 'Esta página no tiene bloques todavía — agrega al menos uno antes de guardarla como plantilla.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        plantilla = PlantillaPagina.objects.create(
            nombre=nombre,
            secciones=secciones,
            creado_por=request.user if request.user.is_authenticated else None,
        )
        return Response(
            PlantillaPaginaSerializer(plantilla, context={'request': request}).data,
            status=status.HTTP_201_CREATED,
        )


# ══════════════════════════════════════════════════════════════════════════════
# ADMIN — ARTÍCULOS
# ══════════════════════════════════════════════════════════════════════════════

class ArticuloListCreateAdminView(APIView):
    """GET/POST api/sitio/admin/articulos/ — filtros: estado, categoria, search."""
    permission_classes = [permissions.IsAuthenticated, IsDirectorOrSistemas]
    pagination_class = StandardResultsPagination

    def get(self, request):
        qs = Articulo.objects.select_related('categoria', 'imagen_destacada').all()

        estado = request.query_params.get('estado')
        if estado:
            qs = qs.filter(estado=estado)

        categoria = request.query_params.get('categoria')
        if categoria:
            qs = qs.filter(categoria_id=categoria)

        search = request.query_params.get('search')
        if search:
            qs = qs.filter(Q(titulo__icontains=search) | Q(resumen__icontains=search))

        paginator = self.pagination_class()
        pagina_actual = paginator.paginate_queryset(qs, request, view=self)
        serializer = ArticuloListSerializer(pagina_actual, many=True, context={'request': request})
        return paginator.get_paginated_response(serializer.data)

    def post(self, request):
        serializer = ArticuloDetalleSerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        serializer.save(autor=request.user if request.user.is_authenticated else None)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class ArticuloDetailAdminView(APIView):
    """GET/PATCH/DELETE api/sitio/admin/articulos/<id>/."""
    permission_classes = [permissions.IsAuthenticated, IsDirectorOrSistemas]

    def get_object(self, pk):
        return get_object_or_404(Articulo, pk=pk)

    def get(self, request, pk):
        return Response(ArticuloDetalleSerializer(self.get_object(pk), context={'request': request}).data)

    def patch(self, request, pk):
        articulo = self.get_object(pk)
        serializer = ArticuloDetalleSerializer(
            articulo, data=request.data, partial=True, context={'request': request}
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    def delete(self, request, pk):
        articulo = self.get_object(pk)
        articulo.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class ArticuloPublicarAdminView(APIView):
    """POST api/sitio/admin/articulos/<id>/publicar/."""
    permission_classes = [permissions.IsAuthenticated, IsDirectorOrSistemas]

    def post(self, request, pk):
        articulo = get_object_or_404(Articulo, pk=pk)
        articulo.estado = 'publicado'
        articulo.publicado_en = timezone.now()
        articulo.save(update_fields=['estado', 'publicado_en'])
        return Response(ArticuloDetalleSerializer(articulo, context={'request': request}).data)


# ══════════════════════════════════════════════════════════════════════════════
# ADMIN — CATEGORÍAS
# ══════════════════════════════════════════════════════════════════════════════

class CategoriaListCreateAdminView(APIView):
    """GET/POST api/sitio/admin/categorias/."""
    permission_classes = [permissions.IsAuthenticated, IsDirectorOrSistemas]

    def get(self, request):
        return Response(CategoriaSerializer(Categoria.objects.all(), many=True).data)

    def post(self, request):
        serializer = CategoriaSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class CategoriaDetailAdminView(APIView):
    """PATCH/DELETE api/sitio/admin/categorias/<id>/."""
    permission_classes = [permissions.IsAuthenticated, IsDirectorOrSistemas]

    def patch(self, request, pk):
        categoria = get_object_or_404(Categoria, pk=pk)
        serializer = CategoriaSerializer(categoria, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    def delete(self, request, pk):
        categoria = get_object_or_404(Categoria, pk=pk)
        categoria.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


# ══════════════════════════════════════════════════════════════════════════════
# ADMIN — MEDIA
# ══════════════════════════════════════════════════════════════════════════════

class MediaListCreateAdminView(APIView):
    """
    GET/POST api/sitio/admin/media/ — filtro `search` por alt_text.
    POST es multipart (campo 'archivo_original') y dispara el pipeline WebP.
    """
    permission_classes = [permissions.IsAuthenticated, IsDirectorOrSistemas]
    pagination_class = StandardResultsPagination

    def get(self, request):
        qs = Media.objects.all()
        search = request.query_params.get('search')
        if search:
            qs = qs.filter(alt_text__icontains=search)

        paginator = self.pagination_class()
        pagina_actual = paginator.paginate_queryset(qs, request, view=self)
        serializer = MediaSerializer(pagina_actual, many=True, context={'request': request})
        return paginator.get_paginated_response(serializer.data)

    def post(self, request):
        archivo = request.FILES.get('archivo_original')
        if not archivo:
            return Response(
                {'error': "Debe adjuntar una imagen en el campo 'archivo_original'."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        error = _validar_imagen_media(archivo)
        if error:
            return Response({'error': error}, status=status.HTTP_400_BAD_REQUEST)

        # Dimensiones del original vía Pillow (no confiar en metadata del cliente)
        from PIL import Image
        archivo.seek(0)
        try:
            with Image.open(archivo) as img:
                ancho_original, alto_original = img.size
        except Exception:
            return Response(
                {'error': 'No se pudo leer la imagen. El archivo puede estar corrupto.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        archivo.seek(0)

        media = Media.objects.create(
            archivo_original=archivo,
            alt_text=request.data.get('alt_text', ''),
            ancho_original=ancho_original,
            alto_original=alto_original,
            peso_bytes=archivo.size,
            subido_por=request.user if request.user.is_authenticated else None,
        )

        # Pipeline de variantes WebP (contrato §5) — se ejecuta después del
        # create() porque necesita el pk para la carpeta de destino y la URL
        # ya persistida del archivo original.
        media.variantes = generar_variantes_webp(media)
        media.save(update_fields=['variantes'])

        return Response(MediaSerializer(media, context={'request': request}).data, status=status.HTTP_201_CREATED)


class MediaDetailAdminView(APIView):
    """
    GET/PATCH api/sitio/admin/media/<id>/ — PATCH solo permite editar alt_text
    (conveniencia no listada explícitamente en el contrato, pero necesaria
    para poder describir imágenes ya subidas sin volver a subirlas).
    DELETE api/sitio/admin/media/<id>/ — 409 si está referenciada en alguna
    Seccion.contenido o Articulo.imagen_destacada (contrato §2).
    """
    permission_classes = [permissions.IsAuthenticated, IsDirectorOrSistemas]

    def get(self, request, pk):
        media = get_object_or_404(Media, pk=pk)
        return Response(MediaSerializer(media, context={'request': request}).data)

    def patch(self, request, pk):
        media = get_object_or_404(Media, pk=pk)
        if 'alt_text' in request.data:
            media.alt_text = request.data['alt_text']
            media.save(update_fields=['alt_text'])
        return Response(MediaSerializer(media, context={'request': request}).data)

    def delete(self, request, pk):
        media = get_object_or_404(Media, pk=pk)
        referencias = media.esta_referenciada()
        if referencias:
            return Response(
                {
                    'detail': 'Esta imagen está en uso y no puede eliminarse.',
                    'referencias': referencias,
                },
                status=status.HTTP_409_CONFLICT,
            )
        media.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


# ══════════════════════════════════════════════════════════════════════════════
# ADMIN — MENÚS
# ══════════════════════════════════════════════════════════════════════════════

class MenuListAdminView(APIView):
    """
    GET api/sitio/admin/menus/ — Menu con items anidados (nested read-only).
    POST api/sitio/admin/menus/ — crea un Menu nuevo (bug de instalación
    nueva: sin esto, 'principal'/'footer' solo podían crearse por Django
    admin/shell y la navegación pública quedaba vacía para siempre).
    Body: {nombre: 'principal' | 'footer'}.
    """
    permission_classes = [permissions.IsAuthenticated, IsDirectorOrSistemas]

    def get(self, request):
        return Response(MenuSerializer(Menu.objects.all(), many=True).data)

    def post(self, request):
        serializer = MenuInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        menu = Menu.objects.create(nombre=serializer.validated_data['nombre'])
        return Response(MenuSerializer(menu).data, status=status.HTTP_201_CREATED)


class MenuItemsReplaceAdminView(APIView):
    """
    PUT api/sitio/admin/menus/<id>/items/ — reemplaza el árbol completo de
    ItemMenu de ese menú (simplifica el reorder en el editor: el frontend
    manda la lista completa ya reordenada y con los ids que quiere conservar;
    los que faltan se borran y los sin id se crean).
    """
    permission_classes = [permissions.IsAuthenticated, IsDirectorOrSistemas]

    def put(self, request, pk):
        menu = get_object_or_404(Menu, pk=pk)

        items_raw = request.data.get('items', request.data if isinstance(request.data, list) else [])
        serializer = ItemMenuInputSerializer(data=items_raw, many=True)
        serializer.is_valid(raise_exception=True)
        items_validados = serializer.validated_data

        with transaction.atomic():
            ids_existentes = set(menu.items.values_list('id', flat=True))
            ids_conservados = set()

            for posicion, item_data in enumerate(items_validados):
                item_id = item_data.get('id')
                pagina_id = item_data.get('pagina')
                pagina_obj = None
                if item_data.get('tipo_destino') == 'pagina' and pagina_id:
                    pagina_obj = get_object_or_404(Pagina, pk=pagina_id)

                articulo_id = item_data.get('articulo')
                articulo_obj = None
                if item_data.get('tipo_destino') == 'articulo' and articulo_id:
                    articulo_obj = get_object_or_404(Articulo, pk=articulo_id)

                campos = {
                    'menu': menu,
                    'etiqueta': item_data['etiqueta'],
                    'tipo_destino': item_data['tipo_destino'],
                    'pagina': pagina_obj,
                    'articulo': articulo_obj,
                    'url_externa': item_data.get('url_externa', ''),
                    'orden': item_data.get('orden', posicion),
                    'abre_nueva_pestana': item_data.get('abre_nueva_pestana', False),
                }

                if item_id and item_id in ids_existentes:
                    ItemMenu.objects.filter(pk=item_id).update(**campos)
                    ids_conservados.add(item_id)
                else:
                    nuevo = ItemMenu.objects.create(**campos)
                    ids_conservados.add(nuevo.id)

            # Borra los items que ya no vienen en el payload
            ItemMenu.objects.filter(menu=menu).exclude(pk__in=ids_conservados).delete()

        return Response(MenuSerializer(menu).data)


# ══════════════════════════════════════════════════════════════════════════════
# ADMIN — MÉTRICAS
# ══════════════════════════════════════════════════════════════════════════════

class MetricasAdminView(APIView):
    """GET api/sitio/admin/metricas/ — resumen del CMS."""
    permission_classes = [permissions.IsAuthenticated, IsDirectorOrSistemas]

    def get(self, request):
        articulos_mas_vistos = list(
            Articulo.objects.filter(estado='publicado')
            .order_by('-vistas')[:5]
            .values('id', 'titulo', 'slug', 'vistas')
        )
        ultimas_ediciones_paginas = list(
            Pagina.objects.order_by('-actualizado_en')[:5]
            .values('id', 'titulo', 'slug', 'estado', 'actualizado_en')
        )
        ultimas_ediciones_articulos = list(
            Articulo.objects.order_by('-actualizado_en')[:5]
            .values('id', 'titulo', 'slug', 'estado', 'actualizado_en')
        )

        return Response({
            'paginas_publicadas': Pagina.objects.filter(estado='publicado').count(),
            'paginas_borrador': Pagina.objects.filter(estado='borrador').count(),
            'articulos_publicados': Articulo.objects.filter(estado='publicado').count(),
            'articulos_borrador': Articulo.objects.filter(estado='borrador').count(),
            'media_total': Media.objects.count(),
            'articulos_mas_vistos': articulos_mas_vistos,
            'ultimas_ediciones': {
                'paginas': ultimas_ediciones_paginas,
                'articulos': ultimas_ediciones_articulos,
            },
        })


# ══════════════════════════════════════════════════════════════════════════════
# PÚBLICO — siempre AllowAny, siempre filtra estado='publicado' server-side
# ══════════════════════════════════════════════════════════════════════════════

class ConfiguracionSitioPublicaView(APIView):
    """GET api/sitio/configuracion/."""
    permission_classes = [permissions.AllowAny]
    authentication_classes = []

    def get(self, request):
        config = ConfiguracionSitio.obtener()
        return Response(ConfiguracionSitioPublicaSerializer(config, context={'request': request}).data)


class MenuPublicoView(APIView):
    """GET api/sitio/menus/<nombre>/."""
    permission_classes = [permissions.AllowAny]
    authentication_classes = []

    def get(self, request, nombre):
        menu = Menu.objects.filter(nombre=nombre).first()
        if not menu:
            # 404 genérico: mismo criterio que páginas/artículos (no filtrar info)
            return Response({'detail': 'No encontrado.'}, status=status.HTTP_404_NOT_FOUND)
        return Response(MenuPublicoSerializer(menu).data)


class PaginaHomePublicaView(APIView):
    """GET api/sitio/paginas/home/ — la página con es_home=True, si está publicada."""
    permission_classes = [permissions.AllowAny]
    authentication_classes = []

    def get(self, request):
        pagina = Pagina.objects.filter(es_home=True, estado='publicado').first()
        if not pagina:
            return Response({'detail': 'No encontrado.'}, status=status.HTTP_404_NOT_FOUND)
        return Response(PaginaPublicaSerializer(pagina, context={'request': request}).data)


class PaginaDetallePublicaView(APIView):
    """GET api/sitio/paginas/<slug>/ — 404 genérico si no existe o no está publicada."""
    permission_classes = [permissions.AllowAny]
    authentication_classes = []

    def get(self, request, slug):
        pagina = Pagina.objects.filter(slug=slug, estado='publicado').first()
        if not pagina:
            return Response({'detail': 'No encontrado.'}, status=status.HTTP_404_NOT_FOUND)
        return Response(PaginaPublicaSerializer(pagina, context={'request': request}).data)


class ArticuloListaPublicaView(APIView):
    """GET api/sitio/articulos/ — listado paginado, filtros categoria/search, solo publicado."""
    permission_classes = [permissions.AllowAny]
    authentication_classes = []
    pagination_class = StandardResultsPagination

    def get(self, request):
        qs = Articulo.objects.filter(estado='publicado').select_related('categoria', 'imagen_destacada')

        categoria = request.query_params.get('categoria')
        if categoria:
            qs = qs.filter(Q(categoria_id=categoria) | Q(categoria__slug=categoria))

        search = request.query_params.get('search')
        if search:
            qs = qs.filter(Q(titulo__icontains=search) | Q(resumen__icontains=search))

        qs = qs.order_by('-publicado_en', '-creado_en')

        paginator = self.pagination_class()
        pagina_actual = paginator.paginate_queryset(qs, request, view=self)
        serializer = ArticuloListaPublicaSerializer(pagina_actual, many=True, context={'request': request})
        return paginator.get_paginated_response(serializer.data)


class ArticuloDetallePublicoView(APIView):
    """
    GET api/sitio/articulos/<slug>/ — incrementa vistas. 404 genérico si no
    existe o no está publicado.

    Deuda técnica anotada (no implementada en v1, ver contrato §3 y
    NOTAS_TECNICAS.md): el incremento de `vistas` no tiene throttle por
    IP/sesión todavía, por lo que refrescos repetidos inflan el contador.
    """
    permission_classes = [permissions.AllowAny]
    authentication_classes = []

    def get(self, request, slug):
        articulo = Articulo.objects.filter(slug=slug, estado='publicado').select_related(
            'categoria', 'imagen_destacada', 'autor'
        ).first()
        if not articulo:
            return Response({'detail': 'No encontrado.'}, status=status.HTTP_404_NOT_FOUND)

        Articulo.objects.filter(pk=articulo.pk).update(vistas=articulo.vistas + 1)
        articulo.vistas += 1

        return Response(ArticuloPublicoSerializer(articulo, context={'request': request}).data)


class PreviewPublicoView(APIView):
    """
    GET api/sitio/preview/<token>/ — AllowAny a propósito: el token opaco de
    32+ bytes (secrets.token_urlsafe) es la única credencial, igual patrón
    que un link de "compartir" — no requiere sesión de admin porque
    octopus-sitio (donde se abre la vista previa) corre en otro origin sin
    el JWT del panel. Nunca expone más que lo que ya trae el payload
    guardado por `_crear_preview_sesion` (misma forma que
    `PaginaPublicaSerializer`).
    """
    permission_classes = [permissions.AllowAny]
    authentication_classes = []

    def get(self, request, token):
        sesion = PreviewSesion.objects.filter(token=token, expira_en__gte=timezone.now()).first()
        if not sesion:
            return Response({'detail': 'Esta vista previa expiró o no existe.'}, status=status.HTTP_404_NOT_FOUND)
        return Response(sesion.payload)


class CategoriaListaPublicaView(APIView):
    """GET api/sitio/categorias/ — listado simple para filtros del blog."""
    permission_classes = [permissions.AllowAny]
    authentication_classes = []

    def get(self, request):
        return Response(CategoriaSerializer(Categoria.objects.all(), many=True).data)
