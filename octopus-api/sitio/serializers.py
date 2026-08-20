import copy
import logging
import re

import bleach
from rest_framework import serializers

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
    Seccion,
)

logger = logging.getLogger(__name__)

# ──────────────────────────────────────────────────────────────────────────────
# SANITIZACIÓN DE HTML (Articulo.cuerpo, texto rico de Tiptap)
# ──────────────────────────────────────────────────────────────────────────────

_BLEACH_TAGS_PERMITIDAS = [
    'p', 'br', 'strong', 'em', 'u', 's', 'a', 'ul', 'ol', 'li',
    'h1', 'h2', 'h3', 'h4', 'blockquote', 'code', 'pre', 'span',
    'img', 'figure', 'figcaption', 'hr', 'table', 'thead', 'tbody',
    'tr', 'th', 'td',
]
_BLEACH_ATRIBUTOS_PERMITIDOS = {
    'a': ['href', 'title', 'target', 'rel'],
    'img': ['src', 'alt', 'width', 'height'],
    'span': ['class'],
    'td': ['colspan', 'rowspan'],
    'th': ['colspan', 'rowspan'],
}
_BLEACH_PROTOCOLOS_PERMITIDOS = ['http', 'https', 'mailto']

# bleach.clean(strip=True) elimina las etiquetas no permitidas pero conserva su
# texto interno — para <script>/<style> eso deja el código JS/CSS crudo visible
# como contenido de la página (confirmado en auditoría: 'hi<script>alert(1)
# </script>' quedaba guardado como 'hialert(1)'). No es XSS ejecutable (bleach
# sí quita el tag y el navegador no ejecuta <script> insertado vía innerHTML),
# pero es contenido roto servido al público. Se elimina el elemento completo
# (tag + contenido) antes de bleach, único caso que bleach no cubre por diseño.
_ELEMENTOS_PELIGROSOS = re.compile(r'<(script|style)\b[^>]*>.*?</\1>', re.IGNORECASE | re.DOTALL)


def _eliminar_elementos_peligrosos(html_crudo):
    return _ELEMENTOS_PELIGROSOS.sub('', html_crudo)


def sanitizar_html_articulo(html_crudo):
    """
    Sanitiza el HTML producido por el editor Tiptap del panel admin antes de
    guardarlo en Articulo.cuerpo, evitando XSS (SITIO_CONTRATO_API.md §1,
    PLAN_SITIO_INSTITUCIONAL.md "Anticipación de bugs / edge cases").
    """
    if not html_crudo:
        return html_crudo
    return bleach.clean(
        _eliminar_elementos_peligrosos(html_crudo),
        tags=_BLEACH_TAGS_PERMITIDAS,
        attributes=_BLEACH_ATRIBUTOS_PERMITIDOS,
        protocols=_BLEACH_PROTOCOLOS_PERMITIDOS,
        strip=True,
    )


# ──────────────────────────────────────────────────────────────────────────────
# SANITIZACIÓN DE HTML dentro de Seccion.contenido (contrato §4: los campos
# "texto" de bloques como texto_imagen/cards/cta/testimonios/carrusel son
# "html simple, negrita/enlaces" — a diferencia de Articulo.cuerpo, se guardan
# como JSON crudo y NUNCA pasaban por bleach, quedando XSS almacenado servido
# al público de PaginaPublicaSerializer sin escapar.
# ──────────────────────────────────────────────────────────────────────────────

_BLEACH_TAGS_SECCION = ['strong', 'em', 'u', 'br', 'a']
_BLEACH_ATRIBUTOS_SECCION = {'a': ['href', 'title', 'target', 'rel']}


def _sanitizar_texto_seccion(html_crudo):
    if not isinstance(html_crudo, str) or not html_crudo:
        return html_crudo
    return bleach.clean(
        _eliminar_elementos_peligrosos(html_crudo),
        tags=_BLEACH_TAGS_SECCION,
        attributes=_BLEACH_ATRIBUTOS_SECCION,
        protocols=_BLEACH_PROTOCOLOS_PERMITIDOS,
        strip=True,
    )


def sanitizar_contenido_seccion(contenido):
    """
    Recorre `contenido` (dict/list arbitrariamente anidado, tal como llega en
    el JSONField) y sanitiza cualquier valor bajo una clave 'texto', que es la
    única marcada como HTML en el contrato — el resto de las claves (títulos,
    textos de botón, URLs, etc.) se deja intacta.
    """
    if isinstance(contenido, dict):
        return {
            clave: (_sanitizar_texto_seccion(valor) if clave == 'texto' and isinstance(valor, str)
                    else sanitizar_contenido_seccion(valor))
            for clave, valor in contenido.items()
        }
    if isinstance(contenido, list):
        return [sanitizar_contenido_seccion(item) for item in contenido]
    return contenido


# ──────────────────────────────────────────────────────────────────────────────
# EXPANSIÓN DE REFERENCIAS A MEDIA DENTRO DE Seccion.contenido (contrato §4)
# ──────────────────────────────────────────────────────────────────────────────

# Claves cuyo valor es un id (int) de Media referenciada directamente.
_CLAVES_MEDIA_ID = {'imagen_fondo', 'imagen', 'foto', 'fondo', 'media_id'}


def _absolutizar_variantes(variantes, request):
    """Convierte las URLs (relativas, vía storage.url()) de `variantes` en absolutas
    usando el request entrante, para que un frontend en otro origin (ej. el sitio
    público servido aparte) pueda cargarlas directamente."""
    if not request or not isinstance(variantes, dict):
        return variantes
    return {clave: request.build_absolute_uri(valor) if valor else valor for clave, valor in variantes.items()}


def _media_a_dict(media_obj, request=None):
    return {
        'id': media_obj.pk,
        'variantes': _absolutizar_variantes(media_obj.variantes, request),
        'alt_text': media_obj.alt_text,
    }


def expandir_media_en_contenido(contenido, request=None):
    """
    Recorre `contenido` (dict/list del JSONField de Seccion) y reemplaza los
    ids de Media (bajo las claves de `_CLAVES_MEDIA_ID`) por su objeto
    expandido {id, variantes, alt_text}, para que el frontend público/admin
    no tenga que resolver cada imagen con una llamada aparte.

    Si un id no existe (media borrada, dato corrupto), se deja el valor
    original y se loggea un warning — nunca lanza excepción ni rompe la
    sección completa (fallback silencioso, ver contrato §4).
    """
    if not contenido:
        return contenido

    contenido = copy.deepcopy(contenido)

    # Recolectar todos los ids referenciados para resolverlos en una sola query
    ids_encontrados = set()

    def _recolectar(nodo):
        if isinstance(nodo, dict):
            for clave, valor in nodo.items():
                if clave in _CLAVES_MEDIA_ID and isinstance(valor, (int, str)) and str(valor).isdigit():
                    ids_encontrados.add(int(valor))
                else:
                    _recolectar(valor)
        elif isinstance(nodo, list):
            for item in nodo:
                _recolectar(item)

    _recolectar(contenido)

    if not ids_encontrados:
        return contenido

    media_por_id = {m.pk: m for m in Media.objects.filter(pk__in=ids_encontrados)}

    def _reemplazar(nodo):
        if isinstance(nodo, dict):
            for clave, valor in list(nodo.items()):
                if clave in _CLAVES_MEDIA_ID and isinstance(valor, (int, str)) and str(valor).isdigit():
                    media_obj = media_por_id.get(int(valor))
                    if media_obj is not None:
                        nodo[clave] = _media_a_dict(media_obj, request)
                    else:
                        logger.warning(
                            'Seccion.contenido referencia Media #%s que no existe (fallback: se deja el id).',
                            valor,
                        )
                else:
                    _reemplazar(valor)
        elif isinstance(nodo, list):
            for item in nodo:
                _reemplazar(item)

    _reemplazar(contenido)
    return contenido


# ──────────────────────────────────────────────────────────────────────────────
# CONFIGURACIÓN DEL SITIO
# ──────────────────────────────────────────────────────────────────────────────

class ConfiguracionSitioSerializer(serializers.ModelSerializer):
    """Serializer admin — lectura/edición completa del singleton."""

    class Meta:
        model = ConfiguracionSitio
        fields = [
            'id', 'logo', 'favicon', 'color_primario', 'color_secundario',
            'color_acento', 'estilo_menu', 'menu_fijo', 'alineacion_menu',
            'estilo_footer', 'estilo_botones', 'tipografia', 'redes_sociales',
            'seo_titulo_default', 'seo_descripcion_default', 'telefono_contacto',
            'email_contacto', 'direccion', 'actualizado_en',
        ]
        read_only_fields = ['id', 'actualizado_en']


class ConfiguracionSitioPublicaSerializer(serializers.ModelSerializer):
    """Subconjunto público (sin datos sensibles, si los hubiera)."""

    class Meta:
        model = ConfiguracionSitio
        fields = [
            'logo', 'favicon', 'color_primario', 'color_secundario',
            'color_acento', 'estilo_menu', 'menu_fijo', 'alineacion_menu',
            'estilo_footer', 'estilo_botones', 'tipografia', 'redes_sociales',
            'seo_titulo_default', 'seo_descripcion_default', 'telefono_contacto',
            'email_contacto', 'direccion',
        ]


# ──────────────────────────────────────────────────────────────────────────────
# MEDIA
# ──────────────────────────────────────────────────────────────────────────────

class MediaSerializer(serializers.ModelSerializer):
    variantes = serializers.SerializerMethodField()

    class Meta:
        model = Media
        fields = [
            'id', 'archivo_original', 'variantes', 'alt_text',
            'ancho_original', 'alto_original', 'peso_bytes',
            'subido_por', 'creado_en',
        ]
        read_only_fields = [
            'id', 'ancho_original', 'alto_original',
            'peso_bytes', 'subido_por', 'creado_en',
        ]

    def get_variantes(self, obj):
        return _absolutizar_variantes(obj.variantes, self.context.get('request'))


# ──────────────────────────────────────────────────────────────────────────────
# CATEGORÍA
# ──────────────────────────────────────────────────────────────────────────────

class CategoriaSerializer(serializers.ModelSerializer):
    class Meta:
        model = Categoria
        fields = ['id', 'nombre', 'slug']
        read_only_fields = ['id', 'slug']


# ──────────────────────────────────────────────────────────────────────────────
# SECCIÓN
# ──────────────────────────────────────────────────────────────────────────────

class SeccionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Seccion
        fields = ['id', 'pagina', 'tipo', 'orden', 'contenido', 'animacion', 'config_estilo']
        read_only_fields = ['id']
        extra_kwargs = {
            'pagina': {'required': False},
        }

    def validate_contenido(self, value):
        return sanitizar_contenido_seccion(value)

    def to_representation(self, instance):
        data = super().to_representation(instance)
        data['contenido'] = expandir_media_en_contenido(data.get('contenido'), self.context.get('request'))
        return data


class SeccionReordenarSerializer(serializers.Serializer):
    """POST paginas/<id>/secciones/reordenar/ — body {orden: [id1, id2, ...]}."""
    orden = serializers.ListField(child=serializers.IntegerField(), allow_empty=False)


class SeccionPlantillaSerializer(serializers.Serializer):
    """
    Una sección "suelta" (sin `Pagina` guardada todavía) para la vista previa
    de una plantilla del catálogo (`components/sitio/plantillas.js`) antes de
    crearla. Mismos campos que `SeccionSerializer` menos `id`/`pagina`.
    """
    tipo = serializers.ChoiceField(choices=[c[0] for c in Seccion.TIPO_CHOICES])
    contenido = serializers.JSONField(default=dict)
    animacion = serializers.ChoiceField(choices=[c[0] for c in Seccion.ANIMACION_CHOICES], required=False, allow_blank=True, default='')
    config_estilo = serializers.JSONField(default=dict)

    def validate_contenido(self, value):
        return sanitizar_contenido_seccion(value)


# ──────────────────────────────────────────────────────────────────────────────
# PATRÓN DE BLOQUE (Fase 2)
# ──────────────────────────────────────────────────────────────────────────────

class PatronBloqueSerializer(serializers.ModelSerializer):
    class Meta:
        model = PatronBloque
        fields = ['id', 'nombre', 'tipo', 'contenido', 'animacion', 'config_estilo', 'creado_por', 'creado_en']
        read_only_fields = ['id', 'creado_por', 'creado_en']

    def validate_contenido(self, value):
        return sanitizar_contenido_seccion(value)

    def to_representation(self, instance):
        data = super().to_representation(instance)
        data['contenido'] = expandir_media_en_contenido(data.get('contenido'), self.context.get('request'))
        return data


# ──────────────────────────────────────────────────────────────────────────────
# PLANTILLA DE PÁGINA DEL USUARIO (Fase 2)
# ──────────────────────────────────────────────────────────────────────────────

class PlantillaPaginaSerializer(serializers.ModelSerializer):
    secciones = SeccionPlantillaSerializer(many=True, allow_empty=False)

    class Meta:
        model = PlantillaPagina
        fields = ['id', 'nombre', 'secciones', 'creado_por', 'creado_en']
        read_only_fields = ['id', 'creado_por', 'creado_en']

    def to_representation(self, instance):
        data = super().to_representation(instance)
        request = self.context.get('request')
        data['secciones'] = [
            {**s, 'contenido': expandir_media_en_contenido(s.get('contenido'), request)}
            for s in data.get('secciones') or []
        ]
        return data


class PreviewPlantillaInputSerializer(serializers.Serializer):
    """POST admin/preview-plantilla/ — body {titulo?, secciones: [...]}."""
    titulo = serializers.CharField(max_length=200, required=False, allow_blank=True, default='')
    secciones = SeccionPlantillaSerializer(many=True, allow_empty=False)


# ──────────────────────────────────────────────────────────────────────────────
# PÁGINA
# ──────────────────────────────────────────────────────────────────────────────

class PaginaListSerializer(serializers.ModelSerializer):
    """Listado — sin secciones anidadas (se piden aparte, paginado propio)."""
    actualizado_por_nombre = serializers.SerializerMethodField()

    class Meta:
        model = Pagina
        fields = [
            'id', 'titulo', 'slug', 'estado', 'es_home', 'orden_menu',
            'mostrar_en_menu', 'seo_titulo', 'seo_descripcion',
            'creado_por', 'creado_en', 'actualizado_en', 'publicado_en',
            'actualizado_por', 'actualizado_por_nombre', 'eliminado_en',
        ]
        read_only_fields = [
            'id', 'slug', 'creado_por', 'creado_en', 'actualizado_en', 'publicado_en',
            'actualizado_por', 'eliminado_en',
        ]

    def get_actualizado_por_nombre(self, obj):
        if not obj.actualizado_por_id or not obj.actualizado_por:
            return None
        return obj.actualizado_por.get_full_name() or obj.actualizado_por.username


class PaginaDetalleSerializer(PaginaListSerializer):
    """Detalle admin — incluye secciones ordenadas."""
    secciones = serializers.SerializerMethodField()

    class Meta(PaginaListSerializer.Meta):
        fields = PaginaListSerializer.Meta.fields + ['secciones']

    def get_secciones(self, obj):
        return SeccionSerializer(obj.secciones.order_by('orden', 'id'), many=True, context=self.context).data

    def validate_es_home(self, value):
        return value


class PaginaPublicaSerializer(serializers.ModelSerializer):
    """
    Página pública con sus secciones ordenadas y expandidas. Nunca se usa
    sobre una página en 'borrador' — la vista filtra por estado='publicado'
    antes de instanciar este serializer.
    """
    secciones = serializers.SerializerMethodField()

    class Meta:
        model = Pagina
        fields = [
            'id', 'titulo', 'slug', 'es_home', 'seo_titulo', 'seo_descripcion',
            'publicado_en', 'secciones',
        ]

    def get_secciones(self, obj):
        return SeccionSerializer(obj.secciones.order_by('orden', 'id'), many=True, context=self.context).data


# ──────────────────────────────────────────────────────────────────────────────
# ARTÍCULO
# ──────────────────────────────────────────────────────────────────────────────

class ArticuloListSerializer(serializers.ModelSerializer):
    categoria_nombre = serializers.CharField(source='categoria.nombre', read_only=True, default=None)
    imagen_destacada_data = serializers.SerializerMethodField()

    class Meta:
        model = Articulo
        fields = [
            'id', 'titulo', 'slug', 'resumen', 'imagen_destacada', 'imagen_destacada_data',
            'categoria', 'categoria_nombre', 'estado', 'autor', 'vistas',
            'creado_en', 'actualizado_en', 'publicado_en',
        ]
        read_only_fields = ['id', 'slug', 'autor', 'vistas', 'creado_en', 'actualizado_en', 'publicado_en']

    def get_imagen_destacada_data(self, obj):
        if obj.imagen_destacada_id and obj.imagen_destacada:
            return _media_a_dict(obj.imagen_destacada, self.context.get('request'))
        return None


class ArticuloDetalleSerializer(ArticuloListSerializer):
    class Meta(ArticuloListSerializer.Meta):
        fields = ArticuloListSerializer.Meta.fields + [
            'cuerpo', 'seo_titulo', 'seo_descripcion',
        ]

    def validate_cuerpo(self, value):
        return sanitizar_html_articulo(value)


class ArticuloPublicoSerializer(serializers.ModelSerializer):
    """Detalle público de un artículo publicado (incrementa vistas en la vista, no aquí)."""
    categoria = CategoriaSerializer(read_only=True)
    imagen_destacada = serializers.SerializerMethodField()
    autor = serializers.SerializerMethodField()

    class Meta:
        model = Articulo
        fields = [
            'id', 'titulo', 'slug', 'resumen', 'cuerpo', 'imagen_destacada',
            'categoria', 'autor', 'vistas', 'seo_titulo', 'seo_descripcion', 'publicado_en',
        ]

    def get_imagen_destacada(self, obj):
        if obj.imagen_destacada_id and obj.imagen_destacada:
            return _media_a_dict(obj.imagen_destacada, self.context.get('request'))
        return None

    def get_autor(self, obj):
        """
        Nombre público del autor (byline en ArticuloDetalle.jsx). `autor` es
        FK a Usuario con null=True — nunca se expone email/username, solo el
        nombre para mostrar, con fallback a username si no cargó nombre/apellido.
        """
        if not obj.autor_id or not obj.autor:
            return None
        nombre = obj.autor.get_full_name() or obj.autor.username
        if not nombre:
            return None
        return {'nombre': nombre}


class ArticuloListaPublicaSerializer(serializers.ModelSerializer):
    """Listado público — versión resumida para cards del blog."""
    categoria = CategoriaSerializer(read_only=True)
    imagen_destacada = serializers.SerializerMethodField()

    class Meta:
        model = Articulo
        fields = [
            'id', 'titulo', 'slug', 'resumen', 'imagen_destacada',
            'categoria', 'publicado_en',
        ]

    def get_imagen_destacada(self, obj):
        if obj.imagen_destacada_id and obj.imagen_destacada:
            return _media_a_dict(obj.imagen_destacada, self.context.get('request'))
        return None


# ──────────────────────────────────────────────────────────────────────────────
# MENÚ / ITEM DE MENÚ
# ──────────────────────────────────────────────────────────────────────────────

class ItemMenuSerializer(serializers.ModelSerializer):
    class Meta:
        model = ItemMenu
        fields = [
            'id', 'menu', 'etiqueta', 'tipo_destino', 'pagina', 'articulo',
            'url_externa', 'orden', 'abre_nueva_pestana',
        ]
        read_only_fields = ['id']
        extra_kwargs = {
            'menu': {'required': False},
        }


class MenuSerializer(serializers.ModelSerializer):
    """Lectura anidada: incluye sus items ordenados (contrato §2, GET menus/)."""
    items = serializers.SerializerMethodField()

    class Meta:
        model = Menu
        fields = ['id', 'nombre', 'items']

    def get_items(self, obj):
        return ItemMenuSerializer(obj.items.order_by('orden', 'id'), many=True).data


class MenuInputSerializer(serializers.Serializer):
    """
    Body de POST api/sitio/admin/menus/ — creación de un Menu nuevo. `nombre`
    restringido a los valores que el sitio público realmente consulta
    (LayoutPublico.jsx pide 'principal' y 'footer'; no hay más en el contrato).
    """
    nombre = serializers.ChoiceField(choices=['principal', 'footer'])

    def validate_nombre(self, valor):
        if Menu.objects.filter(nombre=valor).exists():
            raise serializers.ValidationError(f"Ya existe un menú '{valor}'.")
        return valor


class ItemMenuInputSerializer(serializers.Serializer):
    """Item del árbol reemplazado por PUT menus/<id>/items/ — id opcional (crea si falta)."""
    id = serializers.IntegerField(required=False, allow_null=True)
    etiqueta = serializers.CharField(max_length=100)
    tipo_destino = serializers.ChoiceField(choices=[c[0] for c in ItemMenu.TIPO_DESTINO_CHOICES])
    pagina = serializers.IntegerField(required=False, allow_null=True)
    articulo = serializers.IntegerField(required=False, allow_null=True)
    url_externa = serializers.CharField(max_length=500, required=False, allow_blank=True)
    orden = serializers.IntegerField(required=False, default=0)
    abre_nueva_pestana = serializers.BooleanField(required=False, default=False)


class MenuPublicoSerializer(serializers.ModelSerializer):
    """GET público menus/<nombre>/ — árbol de items."""
    items = serializers.SerializerMethodField()

    class Meta:
        model = Menu
        fields = ['nombre', 'items']

    def get_items(self, obj):
        items = obj.items.select_related('pagina', 'articulo').order_by('orden', 'id')
        resultado = []
        for item in items:
            resultado.append({
                'id': item.id,
                'etiqueta': item.etiqueta,
                'tipo_destino': item.tipo_destino,
                'pagina_slug': item.pagina.slug if item.tipo_destino == 'pagina' and item.pagina_id else None,
                'articulo_slug': item.articulo.slug if item.tipo_destino == 'articulo' and item.articulo_id else None,
                'url_externa': item.url_externa if item.tipo_destino == 'url_externa' else None,
                'orden': item.orden,
                'abre_nueva_pestana': item.abre_nueva_pestana,
            })
        return resultado
