from django.contrib.auth import get_user_model
from django.db import models
from django.utils.text import slugify

User = get_user_model()

ESTADO_CHOICES = [
    ('borrador', 'Borrador'),
    ('publicado', 'Publicado'),
]


def generar_slug_unico(model_class, texto_base, instance_pk=None):
    """
    Genera un slug único para `model_class` a partir de `texto_base`,
    agregando sufijo -2, -3... si colisiona (SITIO_CONTRATO_API.md: Pagina y
    Articulo requieren slug único autogenerado).
    `instance_pk` excluye la propia instancia al editar (para no chocar
    consigo misma cuando el título no cambió).
    """
    slug_base = slugify(texto_base)[:190] or 'sin-titulo'
    slug = slug_base
    contador = 2
    qs = model_class.objects.all()
    if instance_pk is not None:
        qs = qs.exclude(pk=instance_pk)
    while qs.filter(slug=slug).exists():
        slug = f'{slug_base}-{contador}'
        contador += 1
    return slug


# ──────────────────────────────────────────────────────────────────────────────
# CONFIGURACIÓN DEL SITIO (singleton)
# ──────────────────────────────────────────────────────────────────────────────

class ConfiguracionSitio(models.Model):
    """
    Configuración global del sitio institucional. Singleton forzado a pk=1
    en save() — no hay create/delete desde la API (solo GET/PATCH).
    """
    logo = models.ImageField(upload_to='sitio/config/', blank=True, null=True)
    favicon = models.ImageField(upload_to='sitio/config/', blank=True, null=True)
    color_primario = models.CharField(max_length=7, blank=True, default='#0fa3b1')
    color_secundario = models.CharField(max_length=7, blank=True, default='#1f3864')
    color_acento = models.CharField(max_length=7, blank=True, default='')

    ESTILO_MENU_CHOICES = [
        ('claro', 'Claro'),
        ('oscuro', 'Oscuro'),
        ('marca', 'Color de marca'),
        ('transparente', 'Transparente sobre el hero'),
    ]
    ESTILO_FOOTER_CHOICES = [
        ('claro', 'Claro'),
        ('oscuro', 'Oscuro'),
        ('marca', 'Color de marca'),
    ]
    ALINEACION_MENU_CHOICES = [
        ('izquierda', 'Logo izquierda, links derecha'),
        ('centro', 'Logo y links centrados'),
    ]
    ESTILO_BOTONES_CHOICES = [
        ('pildora', 'Píldora'),
        ('redondeado', 'Redondeado'),
        ('cuadrado', 'Cuadrado'),
    ]
    TIPOGRAFIA_CHOICES = [
        ('moderna', 'Moderna (sans)'),
        ('editorial', 'Editorial (serif + sans)'),
        ('clasica', 'Clásica (serif)'),
    ]

    estilo_menu = models.CharField(max_length=15, choices=ESTILO_MENU_CHOICES, default='claro')
    menu_fijo = models.BooleanField(default=True, help_text='Si el menú queda fijo (sticky) al hacer scroll.')
    alineacion_menu = models.CharField(max_length=15, choices=ALINEACION_MENU_CHOICES, default='izquierda')
    estilo_footer = models.CharField(max_length=15, choices=ESTILO_FOOTER_CHOICES, default='claro')
    estilo_botones = models.CharField(max_length=15, choices=ESTILO_BOTONES_CHOICES, default='pildora')
    tipografia = models.CharField(max_length=15, choices=TIPOGRAFIA_CHOICES, default='moderna')

    redes_sociales = models.JSONField(
        default=dict, blank=True,
        help_text='{facebook, instagram, twitter, youtube, tiktok} — todas opcionales',
    )
    seo_titulo_default = models.CharField(max_length=70, blank=True, default='')
    seo_descripcion_default = models.CharField(max_length=160, blank=True, default='')
    telefono_contacto = models.CharField(max_length=50, blank=True, default='')
    email_contacto = models.EmailField(blank=True, default='')
    direccion = models.CharField(max_length=255, blank=True, default='')
    actualizado_en = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Configuración del Sitio'
        verbose_name_plural = 'Configuración del Sitio'

    def save(self, *args, **kwargs):
        self.pk = 1
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        # Singleton: nunca se borra desde la API (no hay endpoint DELETE en el contrato).
        pass

    @classmethod
    def obtener(cls):
        obj, _creado = cls.objects.get_or_create(pk=1)
        return obj

    def __str__(self):
        return 'Configuración del Sitio Institucional'


# ──────────────────────────────────────────────────────────────────────────────
# CATEGORÍA (de artículos)
# ──────────────────────────────────────────────────────────────────────────────

class Categoria(models.Model):
    nombre = models.CharField(max_length=100)
    slug = models.SlugField(max_length=200, unique=True, blank=True)

    class Meta:
        verbose_name = 'Categoría'
        verbose_name_plural = 'Categorías'
        ordering = ['nombre']

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug = generar_slug_unico(Categoria, self.nombre, self.pk)
        super().save(*args, **kwargs)

    def __str__(self):
        return self.nombre


# ──────────────────────────────────────────────────────────────────────────────
# MEDIA (biblioteca de imágenes)
# ──────────────────────────────────────────────────────────────────────────────

class Media(models.Model):
    """
    Biblioteca de imágenes reutilizable. `variantes` se completa por el
    pipeline de Pillow (sitio/image_pipeline.py) al subir el archivo.
    """
    archivo_original = models.ImageField(upload_to='sitio/media/originales/')
    variantes = models.JSONField(
        default=dict, blank=True,
        help_text='{thumb, sm, md, lg, original}',
    )
    alt_text = models.CharField(max_length=200, blank=True, default='')
    ancho_original = models.IntegerField(default=0)
    alto_original = models.IntegerField(default=0)
    peso_bytes = models.IntegerField(default=0)
    subido_por = models.ForeignKey(
        User, null=True, blank=True, on_delete=models.SET_NULL, related_name='sitio_media_subida',
    )
    creado_en = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'Media'
        verbose_name_plural = 'Media'
        ordering = ['-creado_en']

    def __str__(self):
        return self.alt_text or self.archivo_original.name

    def esta_referenciada(self):
        """
        Devuelve una lista de referencias humanas si esta Media está en uso
        en alguna Seccion.contenido o como Articulo.imagen_destacada — usado
        por la vista de borrado para responder 409 en vez de eliminar
        (contrato §2, DELETE media/<id>/).
        """
        referencias = []

        articulos = Articulo.objects.filter(imagen_destacada_id=self.pk).values_list('id', 'titulo')
        for art_id, titulo in articulos:
            referencias.append(f'Artículo #{art_id} "{titulo}" (imagen destacada)')

        # Búsqueda de id dentro del JSON de contenido de cada Seccion. No hay
        # forma portable/eficiente de indexar esto en SQLite/Postgres a la vez
        # sin duplicar el esquema por tipo de bloque, así que se recorre en
        # Python — la tabla de secciones institucionales es pequeña (decenas,
        # no miles de filas) por lo que el costo es aceptable en v1.
        import json
        for seccion in Seccion.objects.select_related('pagina').all():
            contenido_str = json.dumps(seccion.contenido)
            if str(self.pk) in _extraer_ids_media(seccion.contenido):
                referencias.append(
                    f'Sección #{seccion.pk} ({seccion.tipo}) de la página "{seccion.pagina.titulo}"'
                )

        return referencias


def _extraer_ids_media(contenido):
    """
    Recorre recursivamente un dict/list de `Seccion.contenido` y devuelve el
    conjunto de valores encontrados bajo claves típicas de referencia a Media
    (imagen, imagen_fondo, foto, fondo, media_id, icono/imagen en items, etc.),
    como strings, para comparar contra Media.pk.
    """
    claves_media = {'imagen', 'imagen_fondo', 'foto', 'fondo', 'media_id'}
    encontrados = set()

    def _recorrer(nodo):
        if isinstance(nodo, dict):
            for clave, valor in nodo.items():
                if clave in claves_media and valor is not None:
                    encontrados.add(str(valor))
                else:
                    _recorrer(valor)
        elif isinstance(nodo, list):
            for item in nodo:
                _recorrer(item)

    _recorrer(contenido or {})
    return encontrados


# ──────────────────────────────────────────────────────────────────────────────
# PÁGINA
# ──────────────────────────────────────────────────────────────────────────────

class Pagina(models.Model):
    titulo = models.CharField(max_length=200)
    slug = models.SlugField(max_length=220, unique=True, blank=True)
    estado = models.CharField(max_length=15, choices=ESTADO_CHOICES, default='borrador', db_index=True)
    es_home = models.BooleanField(default=False)
    orden_menu = models.IntegerField(default=0)
    mostrar_en_menu = models.BooleanField(default=True)
    seo_titulo = models.CharField(max_length=70, blank=True, default='')
    seo_descripcion = models.CharField(max_length=160, blank=True, default='')
    creado_por = models.ForeignKey(
        User, null=True, blank=True, on_delete=models.SET_NULL, related_name='sitio_paginas_creadas',
    )
    actualizado_por = models.ForeignKey(
        User, null=True, blank=True, on_delete=models.SET_NULL, related_name='sitio_paginas_actualizadas',
        help_text='Historial mínimo (Fase 2): quién hizo la última edición, sin versionado de contenido.',
    )
    creado_en = models.DateTimeField(auto_now_add=True)
    actualizado_en = models.DateTimeField(auto_now=True)
    publicado_en = models.DateTimeField(null=True, blank=True)
    eliminado_en = models.DateTimeField(
        null=True, blank=True, db_index=True,
        help_text='Papelera (soft-delete, Fase 2): si no es null, la página está en la papelera. '
                   'Al enviarla a la papelera también se fuerza estado=borrador, así los endpoints '
                   'públicos (que ya filtran por estado=publicado) la excluyen sin cambios adicionales.',
    )

    class Meta:
        verbose_name = 'Página'
        verbose_name_plural = 'Páginas'
        ordering = ['orden_menu', 'titulo']

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug = generar_slug_unico(Pagina, self.titulo, self.pk)

        # Solo una página puede ser es_home=True (contrato §1). Se resuelve
        # también aquí (además del serializer) para cubrir creaciones/edits
        # que no pasen por la API (admin de Django, shell, fixtures, etc.).
        if self.es_home:
            Pagina.objects.filter(es_home=True).exclude(pk=self.pk).update(es_home=False)

        super().save(*args, **kwargs)

    def __str__(self):
        return self.titulo


# ──────────────────────────────────────────────────────────────────────────────
# SECCIÓN (bloques dentro de una página)
# ──────────────────────────────────────────────────────────────────────────────

class Seccion(models.Model):
    TIPO_CHOICES = [
        ('hero', 'Hero'),
        ('texto_imagen', 'Texto + Imagen'),
        ('galeria', 'Galería'),
        ('cards', 'Cards'),
        ('cta', 'CTA'),
        ('testimonios', 'Testimonios'),
        ('carrusel', 'Carrusel'),
    ]
    ANIMACION_CHOICES = [
        ('', 'Ninguna'),
        ('fade-in', 'Fade in'),
        ('slide-up', 'Slide up'),
        ('slide-left', 'Slide left'),
        ('slide-right', 'Slide right'),
        ('scroll-reveal', 'Scroll reveal'),
        ('stagger', 'Stagger'),
        ('parallax', 'Parallax'),
        ('hover-lift', 'Hover lift'),
        ('hover-glow', 'Hover glow'),
        ('zoom-on-scroll', 'Zoom on scroll'),
    ]

    pagina = models.ForeignKey(Pagina, on_delete=models.CASCADE, related_name='secciones')
    tipo = models.CharField(max_length=20, choices=TIPO_CHOICES)
    orden = models.IntegerField(default=0)
    contenido = models.JSONField(default=dict, blank=True)
    animacion = models.CharField(max_length=20, choices=ANIMACION_CHOICES, blank=True, default='')
    config_estilo = models.JSONField(
        default=dict, blank=True,
        help_text='{ancho, espaciado_top, espaciado_bottom, fondo}',
    )

    class Meta:
        verbose_name = 'Sección'
        verbose_name_plural = 'Secciones'
        ordering = ['orden', 'id']

    def __str__(self):
        return f'{self.get_tipo_display()} — {self.pagina.titulo} (#{self.orden})'


# ──────────────────────────────────────────────────────────────────────────────
# ARTÍCULO (blog institucional)
# ──────────────────────────────────────────────────────────────────────────────

class Articulo(models.Model):
    titulo = models.CharField(max_length=200)
    slug = models.SlugField(max_length=220, unique=True, blank=True)
    resumen = models.CharField(max_length=300, blank=True, default='')
    cuerpo = models.TextField(blank=True, default='')
    imagen_destacada = models.ForeignKey(
        Media, null=True, blank=True, on_delete=models.SET_NULL, related_name='articulos_destacados',
    )
    categoria = models.ForeignKey(
        Categoria, null=True, blank=True, on_delete=models.SET_NULL, related_name='articulos',
    )
    estado = models.CharField(max_length=15, choices=ESTADO_CHOICES, default='borrador', db_index=True)
    autor = models.ForeignKey(
        User, null=True, blank=True, on_delete=models.SET_NULL, related_name='sitio_articulos',
    )
    vistas = models.PositiveIntegerField(default=0)
    seo_titulo = models.CharField(max_length=70, blank=True, default='')
    seo_descripcion = models.CharField(max_length=160, blank=True, default='')
    creado_en = models.DateTimeField(auto_now_add=True)
    actualizado_en = models.DateTimeField(auto_now=True)
    publicado_en = models.DateTimeField(null=True, blank=True)

    class Meta:
        verbose_name = 'Artículo'
        verbose_name_plural = 'Artículos'
        ordering = ['-creado_en']

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug = generar_slug_unico(Articulo, self.titulo, self.pk)
        super().save(*args, **kwargs)

    def __str__(self):
        return self.titulo


# ──────────────────────────────────────────────────────────────────────────────
# SESIÓN DE VISTA PREVIA (páginas en borrador / plantillas aún no guardadas)
# ──────────────────────────────────────────────────────────────────────────────

class PreviewSesion(models.Model):
    """
    Payload efímero para la "vista previa" del sitio público (octopus-sitio),
    generado desde el panel admin (CrearPaginaModal, ConstructorPaginas) y
    consumido sin autenticación por `PreviewPublicoView` vía token opaco.

    Existe porque el endpoint público de páginas (`PaginaDetallePublicaView`)
    filtra siempre por `estado='publicado'` (contrato de seguridad — nunca se
    debe poder ver una página en borrador solo conociendo su slug), y las
    plantillas del catálogo (`plantillas.js`) ni siquiera son una `Pagina`
    guardada todavía. Se persiste en tabla (no en cache de proceso) porque el
    backend corre con varios workers y el token se genera en un worker y se
    lee en otro.
    """
    token = models.CharField(max_length=64, unique=True, db_index=True)
    payload = models.JSONField()
    creado_en = models.DateTimeField(auto_now_add=True)
    expira_en = models.DateTimeField(db_index=True)

    class Meta:
        verbose_name = 'Sesión de vista previa'
        verbose_name_plural = 'Sesiones de vista previa'

    def __str__(self):
        return f'Preview {self.token[:8]}… (expira {self.expira_en:%Y-%m-%d %H:%M})'


# ──────────────────────────────────────────────────────────────────────────────
# MENÚ / ITEM DE MENÚ
# ──────────────────────────────────────────────────────────────────────────────

class Menu(models.Model):
    nombre = models.CharField(max_length=50, unique=True, help_text="ej. 'principal', 'footer'")

    class Meta:
        verbose_name = 'Menú'
        verbose_name_plural = 'Menús'

    def __str__(self):
        return self.nombre


class ItemMenu(models.Model):
    TIPO_DESTINO_CHOICES = [
        ('pagina', 'Página'),
        ('articulo', 'Artículo'),
        ('url_externa', 'URL externa'),
    ]

    menu = models.ForeignKey(Menu, on_delete=models.CASCADE, related_name='items')
    etiqueta = models.CharField(max_length=100)
    tipo_destino = models.CharField(max_length=15, choices=TIPO_DESTINO_CHOICES, default='pagina')
    pagina = models.ForeignKey(
        Pagina, null=True, blank=True, on_delete=models.SET_NULL, related_name='items_menu',
    )
    articulo = models.ForeignKey(
        Articulo, null=True, blank=True, on_delete=models.SET_NULL, related_name='items_menu',
    )
    url_externa = models.CharField(max_length=500, blank=True, default='')
    orden = models.IntegerField(default=0)
    abre_nueva_pestana = models.BooleanField(default=False)

    class Meta:
        verbose_name = 'Item de Menú'
        verbose_name_plural = 'Items de Menú'
        ordering = ['orden', 'id']

    def __str__(self):
        return f'{self.menu.nombre} → {self.etiqueta}'


# ──────────────────────────────────────────────────────────────────────────────
# PATRÓN DE BLOQUE (Fase 2 — personalización: un bloque configurado, guardado
# para reusar en cualquier página sin reconstruirlo desde cero)
# ──────────────────────────────────────────────────────────────────────────────

class PatronBloque(models.Model):
    """
    Copia congelada de un bloque (mismo shape que Seccion: tipo/contenido/
    animacion/config_estilo) guardada por el usuario desde el editor visual
    para insertarla en otras páginas. Independiente de cualquier Pagina — si
    la Seccion original se borra o edita, el patrón no cambia.
    """
    nombre = models.CharField(max_length=100)
    tipo = models.CharField(max_length=20, choices=Seccion.TIPO_CHOICES)
    contenido = models.JSONField(default=dict, blank=True)
    animacion = models.CharField(max_length=20, choices=Seccion.ANIMACION_CHOICES, blank=True, default='')
    config_estilo = models.JSONField(default=dict, blank=True)
    creado_por = models.ForeignKey(
        User, null=True, blank=True, on_delete=models.SET_NULL, related_name='sitio_patrones_creados',
    )
    creado_en = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'Patrón de bloque'
        verbose_name_plural = 'Patrones de bloque'
        ordering = ['-creado_en']

    def __str__(self):
        return f'{self.nombre} ({self.get_tipo_display()})'


# ──────────────────────────────────────────────────────────────────────────────
# PLANTILLA DE PÁGINA DEL USUARIO (Fase 2 — personalización: análogo a
# PatronBloque pero para una página completa con todas sus secciones)
# ──────────────────────────────────────────────────────────────────────────────

class PlantillaPagina(models.Model):
    """
    Copia congelada de las secciones de una página, guardada por el usuario
    ("guardar esta página como plantilla") para reusarla al crear páginas
    nuevas — aparece junto al catálogo fijo de plantillas (plantillas.js) en
    CrearPaginaModal, pero es propia del colegio, no del código.
    """
    nombre = models.CharField(max_length=100)
    secciones = models.JSONField(
        default=list, blank=True,
        help_text='Lista congelada [{tipo, contenido, animacion, config_estilo}, ...], mismo orden que en la página de origen.',
    )
    creado_por = models.ForeignKey(
        User, null=True, blank=True, on_delete=models.SET_NULL, related_name='sitio_plantillas_creadas',
    )
    creado_en = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'Plantilla de página'
        verbose_name_plural = 'Plantillas de página'
        ordering = ['-creado_en']

    def __str__(self):
        return self.nombre
