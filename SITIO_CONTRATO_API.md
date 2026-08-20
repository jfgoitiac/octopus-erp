# Fase 0 — Contrato de API: Sitio Institucional (CMS)

> Referencia única para los 4 agentes de Fase 1. Fija forma exacta de endpoints, modelos y `Seccion.contenido` por tipo de bloque, para que backend, admin scaffold y sitio público puedan trabajar en paralelo sobre este contrato (con mocks donde corresponda).

Convenciones heredadas del proyecto (confirmadas en `portal/`, `secretaria/`, `authentication/`):
- JSON en **snake_case**, respuesta directa (`Response({...})` o serializer directo) — **sin** envolver en `{data: ...}`.
- Paginación: `config.pagination.StandardResultsPagination` (page_size=20, max 100) en listados admin. Endpoints públicos paginados igual, salvo que se indique lo contrario.
- Auth admin: `authentication.AdminJWTAuthentication` (mismo JWT que el resto del panel — no se crea uno nuevo).
- Permiso nuevo `IsDirectorOrSistemas` en `sitio/permissions.py`, mismo esqueleto que `IsSystemAdminOrDirector`: superusuario pasa siempre; si no, `request.user.perfil.esta_activo and request.user.perfil.rol in ['director', 'sistemas']`.
- Endpoints públicos: `AllowAny`, sin autenticación, filtran siempre por `estado='publicado'` server-side (nunca confiar en el frontend).
- Uploads: `FileField`/`ImageField` con `upload_to='sitio/...'`, validación de tamaño manual en la view (15MB, igual patrón que `portal/views.py` con comprobantes), MIME whitelist.

---

## 1. Modelos (app `octopus-api/sitio/`)

### `ConfiguracionSitio` (singleton — `pk=1` forzado en `save()`)
| Campo | Tipo | Notas |
|---|---|---|
| `logo` | `ImageField(upload_to='sitio/config/')` | |
| `favicon` | `ImageField(upload_to='sitio/config/')` | |
| `color_primario` | `CharField(7)` | hex `#rrggbb` |
| `color_secundario` | `CharField(7)` | hex |
| `color_acento` | `CharField(7)` | hex, opcional |
| `redes_sociales` | `JSONField` | `{facebook, instagram, twitter, youtube, tiktok}` — todas opcionales |
| `seo_titulo_default` | `CharField(70)` | |
| `seo_descripcion_default` | `CharField(160)` | |
| `telefono_contacto` | `CharField` | opcional |
| `email_contacto` | `EmailField` | opcional |
| `direccion` | `CharField` | opcional |
| `actualizado_en` | `DateTimeField(auto_now=True)` | |

### `Pagina`
| Campo | Tipo | Notas |
|---|---|---|
| `titulo` | `CharField(200)` | |
| `slug` | `SlugField(unique=True)` | autogenerado de `titulo`, sufijo `-2`, `-3`... si colisiona |
| `estado` | `CharField(choices)` | `borrador` / `publicado` |
| `es_home` | `BooleanField(default=False)` | solo una página puede ser `True` (validado en `save()`/serializer) |
| `orden_menu` | `IntegerField(default=0)` | |
| `mostrar_en_menu` | `BooleanField(default=True)` | |
| `seo_titulo` | `CharField(70, blank=True)` | fallback a `ConfiguracionSitio.seo_titulo_default` |
| `seo_descripcion` | `CharField(160, blank=True)` | fallback a default |
| `creado_por` | `FK(User, null=True, on_delete=SET_NULL)` | |
| `creado_en`, `actualizado_en` | `DateTimeField` | auto |
| `publicado_en` | `DateTimeField(null=True)` | se setea al pasar a `publicado` |

### `Seccion`
| Campo | Tipo | Notas |
|---|---|---|
| `pagina` | `FK(Pagina, related_name='secciones')` | |
| `tipo` | `CharField(choices)` | `hero`, `texto_imagen`, `galeria`, `cards`, `cta`, `testimonios`, `carrusel` |
| `orden` | `IntegerField` | posición dentro de la página, reordenable con dnd-kit |
| `contenido` | `JSONField` | schema por `tipo` — ver sección 4 |
| `animacion` | `CharField(choices, blank=True)` | `fade-in`, `slide-up`, `slide-left`, `slide-right`, `scroll-reveal`, `stagger`, `parallax`, `hover-lift`, `hover-glow`, `zoom-on-scroll`, `` (ninguna) |
| `config_estilo` | `JSONField(default=dict)` | `{ancho: 'contenido'|'completo', espaciado_top: 'sm'|'md'|'lg', espaciado_bottom: 'sm'|'md'|'lg', fondo: 'blanco'|'gris'|'primario'|'transparente'}` |

### `Articulo`
| Campo | Tipo | Notas |
|---|---|---|
| `titulo` | `CharField(200)` | |
| `slug` | `SlugField(unique=True)` | autogenerado |
| `resumen` | `CharField(300)` | para cards de listado |
| `cuerpo` | `TextField` | HTML de Tiptap, **sanitizado en backend** (bleach o similar) antes de guardar |
| `imagen_destacada` | `FK(Media, null=True, on_delete=SET_NULL)` | |
| `categoria` | `FK(Categoria, null=True, on_delete=SET_NULL)` | |
| `estado` | `CharField(choices)` | `borrador` / `publicado` |
| `autor` | `FK(User, null=True, on_delete=SET_NULL)` | |
| `vistas` | `PositiveIntegerField(default=0)` | incrementado en el endpoint público de detalle |
| `seo_titulo`, `seo_descripcion` | como en `Pagina` | |
| `creado_en`, `actualizado_en`, `publicado_en` | `DateTimeField` | |

URL pública: `/articulos/<slug>` — no hay `Pagina` asociada, se resuelve por ruta dedicada en el sitio público.

### `Categoria`
`nombre` (CharField), `slug` (SlugField unique).

### `Media`
| Campo | Tipo | Notas |
|---|---|---|
| `archivo_original` | `ImageField(upload_to='sitio/media/originales/')` | máx 15MB |
| `variantes` | `JSONField` | `{thumb: url, sm: url, md: url, lg: url, original: url}` — generadas a WebP al guardar (pipeline Pillow, ver §5) |
| `alt_text` | `CharField(200, blank=True)` | |
| `ancho_original`, `alto_original` | `IntegerField` | |
| `peso_bytes` | `IntegerField` | |
| `subido_por` | `FK(User, null=True, on_delete=SET_NULL)` | |
| `creado_en` | `DateTimeField(auto_now_add=True)` | |

### `Menu` / `ItemMenu`
`Menu`: `nombre` (único, ej. `principal`, `footer`).
`ItemMenu`: `menu` (FK), `etiqueta` (CharField), `tipo_destino` (`pagina`/`articulo`/`url_externa`), `pagina` (FK null), `url_externa` (CharField blank), `orden` (IntegerField), `abre_nueva_pestana` (BooleanField).

---

## 2. Endpoints admin (protegidos, `IsDirectorOrSistemas`)

Prefijo: `api/sitio/admin/`

| Método | Ruta | Descripción |
|---|---|---|
| GET/PATCH | `configuracion/` | singleton, no hay create/delete |
| GET/POST | `paginas/` | listado paginado (filtros: `estado`, `search`), crear |
| POST | `paginas/con-secciones/` | crea una `Pagina` y sus `Seccion`es iniciales en una sola llamada atómica — body `{titulo, es_home?, mostrar_en_menu?, secciones: [{tipo, contenido, animacion, config_estilo}, ...]}`, `secciones` opcional (página en blanco), `orden` = índice en la lista. Usado por el selector de plantilla del editor visual para no requerir N+1 llamadas (crear página + una por sección). |
| GET/PATCH/DELETE | `paginas/<id>/` | detalle/editar/eliminar |
| POST | `paginas/<id>/publicar/` | pasa a `publicado`, setea `publicado_en` |
| POST | `paginas/<id>/despublicar/` | vuelve a `borrador` |
| GET/POST | `paginas/<id>/secciones/` | listado (ordenado por `orden`) / crear sección |
| PATCH/DELETE | `secciones/<id>/` | editar `contenido`/`animacion`/`config_estilo` / eliminar |
| POST | `paginas/<id>/secciones/reordenar/` | body `{orden: [id1, id2, id3, ...]}` — reasigna `orden` en bloque |
| GET/POST | `articulos/` | listado paginado (filtros: `estado`, `categoria`, `search`) / crear |
| GET/PATCH/DELETE | `articulos/<id>/` | detalle/editar/eliminar |
| POST | `articulos/<id>/publicar/` | idem página |
| GET/POST | `categorias/` | |
| PATCH/DELETE | `categorias/<id>/` | |
| GET/POST | `media/` | listado paginado (filtros: `search` por `alt_text`) / subir (multipart, dispara pipeline WebP) |
| DELETE | `media/<id>/` | soft-check: si está referenciada en alguna `Seccion.contenido` o `Articulo.imagen_destacada`, devolver `409` con el detalle en vez de borrar |
| GET | `menus/` | lista los `Menu` con sus `items` anidados (nested read-only) |
| PUT | `menus/<id>/items/` | reemplaza el árbol completo de `ItemMenu` de ese menú (simplifica el reorder en el editor) |
| GET | `metricas/` | resumen: artículos más vistos, páginas publicadas, media total, últimas ediciones |

Errores: formato estándar del proyecto — `{"detail": "..."}` en 4xx, `{"campo": ["error"]}` en 400 de validación de serializer (default DRF).

## 3. Endpoints públicos (`AllowAny`, solo `publicado`)

Prefijo: `api/sitio/`

| Método | Ruta | Descripción |
|---|---|---|
| GET | `configuracion/` | config pública (logo, colores, redes, seo default) |
| GET | `menus/<nombre>/` | árbol de items del menú (`principal`, `footer`) |
| GET | `paginas/home/` | página marcada `es_home=True` con sus secciones |
| GET | `paginas/<slug>/` | página publicada por slug, con secciones ordenadas |
| GET | `articulos/` | listado paginado, filtros `categoria`, `search`; solo `publicado` |
| GET | `articulos/<slug>/` | detalle, incrementa `vistas` (throttle simple por IP/sesión para evitar inflar contador — anotar como deuda menor si no se implementa en v1) |
| GET | `categorias/` | listado simple, para filtros del blog |

Si un `slug` no existe o no está `publicado` → `404` genérico (no distinguir "no existe" de "no publicado", para no filtrar info).

---

## 4. Schema de `Seccion.contenido` por `tipo`

Todos los bloques con imagen referencian `Media` por **id**, no por URL directa — el serializer expande a las `variantes` al leer.

Todos los bloques (excepto `galeria`) admiten además una clave opcional `variante` (string) que el renderer público usa para elegir la composición visual del bloque dentro de su tipo (ej. hero `dividido|inmersivo|editorial`) — no forma parte de la validación mínima del backend (es solo una clave más dentro del JSONField `contenido`, se ignora si falta o si el consumidor no la usa) ni cambia el schema documentado abajo.

**`hero`**
```json
{
  "titulo": "string",
  "subtitulo": "string",
  "imagen_fondo": 12,
  "cta_texto": "string",
  "cta_url": "string",
  "overlay": "oscuro|claro|ninguno"
}
```

**`texto_imagen`**
```json
{
  "titulo": "string",
  "texto": "string (html simple, negrita/enlaces)",
  "imagen": 12,
  "posicion_imagen": "izquierda|derecha",
  "cta_texto": "string opcional",
  "cta_url": "string opcional"
}
```

**`galeria`**
```json
{
  "titulo": "string opcional",
  "imagenes": [{"media_id": 12, "caption": "string opcional"}],
  "columnas": 2
}
```

**`cards`**
```json
{
  "titulo": "string opcional",
  "items": [
    {"icono": "string (nombre lucide-react)", "imagen": 12, "titulo": "string", "texto": "string", "url": "string opcional"}
  ],
  "columnas": 3
}
```

**`cta`**
```json
{
  "titulo": "string",
  "texto": "string",
  "boton_texto": "string",
  "boton_url": "string",
  "fondo": 12
}
```

**`testimonios`**
```json
{
  "titulo": "string opcional",
  "items": [
    {"nombre": "string", "cargo": "string opcional", "foto": 12, "texto": "string"}
  ]
}
```

**`carrusel`** (Embla)
```json
{
  "slides": [{"imagen": 12, "titulo": "string opcional", "texto": "string opcional"}],
  "autoplay": true,
  "intervalo_ms": 5000
}
```

**Fallback de bloque desconocido/corrupto**: si `tipo` no está en el enum vigente, o `contenido` no valida contra el schema esperado, el renderer público debe omitir esa sección silenciosamente (log de warning en backend, no 500) — la página sigue renderizando el resto.

---

## 5. Pipeline de imágenes (`Media`)

Al subir (`POST media/`):
1. Validar tamaño (≤15MB) y MIME (`image/jpeg`, `image/png`, `image/webp`) — mismo patrón de whitelist que `portal/views.py`.
2. Guardar original.
3. Generar variantes WebP con Pillow: `thumb` (200px ancho), `sm` (480px), `md` (960px), `lg` (1600px) — manteniendo aspect ratio, sin upscaling si el original es menor.
4. Guardar URLs en `variantes` JSONField.

Limpieza de media huérfana (no referenciada) queda como tarea periódica futura — no se implementa en v1 (ya anotado en el plan como deuda técnica).

---

## 6. Contratos de mocks para Fase 1 (agentes 3 y 4)

Mientras el backend real (agente 1) no esté listo, los agentes de scaffold (admin y sitio público) deben consumir mocks que respeten **exactamente** las formas de arriba: mismos nombres de campo, mismo `contenido` por tipo de bloque, misma estructura de paginación (`{count, next, previous, results}` — default DRF). Esto es lo que permite reemplazar mocks por API real en Fase 3 sin tocar componentes.

Paginación estándar esperada en cualquier listado:
```json
{"count": 42, "next": "url|null", "previous": "url|null", "results": [...]}
```
