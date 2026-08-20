# Plan — Sitio Institucional + Gestor de Contenido (CMS)

> Módulo nuevo para publicar información institucional y artículos del colegio en el dominio raíz, gestionado desde dentro de Octopus (roles `director` y `sistemas`), con editor visual, plantillas modernas y animaciones.

## Decisiones ya aprobadas

- **Gestión:** dentro del panel admin de Octopus (mismo login/layout), acceso restringido a roles `director` y `sistemas`.
- **Sitio público:** proyecto Vite separado (`octopus-sitio/`), servido en el dominio raíz vía nginx. El subdominio actual de Octopus no se toca.
- **Imágenes:** límite de subida 15MB, con optimización automática a WebP (varios tamaños) al guardar.
- **Sliders:** bloque Carrusel con **Embla Carousel**.
- **Animaciones:** catálogo preconfigurado con **Framer Motion** (fade-in, slide-up/left/right, scroll-reveal, stagger, parallax solo desktop, hover-lift, hover-glow, zoom-on-scroll), respetando `prefers-reduced-motion`.
- **Rich text (artículos):** **Tiptap**.
- **Editor visual (reordenar bloques):** **@dnd-kit**.
- **Alineación:** sistema de grilla estructurada por bloque (alineación/ancho/espaciado controlados), sin posicionamiento libre en píxeles — evita desalineaciones por diseño, no las corrige después.
- **Plantillas:** galería inicial de **8-10 páginas completas** (varios estilos de Home, Nosotros, Contacto, Admisiones, Artículo, Eventos, etc.), diseñadas con las skills `impeccable`, `animate`, `apple-design`, `emil-design-eng` y **`design-taste-frontend`** (obligatoria en cada plantilla — evita resultados genéricos/"templados", fuerza una dirección visual con punto de vista propio en vez de un layout de stock).
- **Artículos → páginas:** cada `Articulo` publicado genera su URL automáticamente (`/articulos/slug`), sin gestión manual de páginas por artículo.
- **Formato:** stack existente (Django + React/Vite), **no PHP**, no WordPress, no CMS de terceros — todo dentro del stack del proyecto.

## Librerías nuevas a instalar (frontend)

| Librería | Uso |
|---|---|
| `tiptap` (+ extensiones) | Editor de texto enriquecido para artículos |
| `framer-motion` | Catálogo de animaciones por bloque |
| `@dnd-kit/core` | Drag & drop de secciones en el editor visual |
| `embla-carousel-react` | Bloque de slider/carrusel |

## Arquitectura de datos (backend — app Django `sitio`)

| Modelo | Propósito |
|---|---|
| `ConfiguracionSitio` | Singleton: logo, colores de marca, favicon, redes sociales, SEO default |
| `Pagina` | Páginas institucionales (slug, título, estado borrador/publicado, orden en menú) |
| `Seccion` | Bloques dentro de una página (`tipo`, `orden`, `contenido` JSON, `animacion`, `config_estilo` JSON) |
| `Articulo` | Blog institucional (título, slug, cuerpo rich text, imagen destacada, categoría, estado, autor, vistas) |
| `Categoria` | Categorías de artículos |
| `Media` | Biblioteca de imágenes/archivos reutilizable |
| `Menu` / `ItemMenu` | Navegación pública editable |

Endpoints admin (CRUD, protegidos por rol) + endpoints públicos read-only (solo contenido publicado).

## Estructura de carpetas

```
octopus-api/sitio/
├── models.py
├── serializers.py
├── views.py
├── urls.py
└── migrations/

octopus-frontend/src/
├── pages/GestionSitio.jsx           # tabs: Artículos / Páginas / Editor visual / Menú / Config / Métricas
├── pages/MetricasSitio.jsx
├── api/sitio.service.js
└── components/sitio/
    ├── EditorVisual/
    │   ├── ConstructorPaginas.jsx   # reorder con dnd-kit
    │   ├── PanelPropiedadesBloque.jsx
    │   ├── PreviewBloque.jsx
    │   └── bloques/                 # Hero, TextoImagen, Galeria, Cards, CTA, Testimonios, Carrusel
    ├── EditorArticulo.jsx           # Tiptap
    ├── BibliotecaMedia.jsx
    ├── TablaArticulos.jsx
    └── TablaPaginas.jsx

octopus-sitio/                       # proyecto Vite nuevo, mismo stack
└── src/
    ├── layouts/LayoutPublico.jsx
    ├── pages/Home.jsx, Articulos.jsx, ArticuloDetalle.jsx, PaginaDinamica.jsx
    ├── components/bloques/          # versión solo-lectura + animada de cada tipo de bloque
    └── api/sitio.service.js
```

## Anticipación de bugs / edge cases

- Sanitizar HTML del rich text en backend antes de guardar (evitar XSS).
- Slugs únicos en artículos/páginas, autogenerado con sufijo si colisiona.
- Endpoint público siempre filtra por `estado='publicado'` y fecha — nunca confiar en el frontend.
- Bloques con `contenido` JSON corrupto o de un tipo eliminado → fallback silencioso en el renderer público, no debe romper la página completa.
- Concurrencia: última edición gana en v1 (versionado/lock optimista queda como deuda técnica anotada).
- Animaciones pesadas (parallax) limitadas a desktop por rendimiento en mobile.
- SEO: meta title/description editables por página/artículo, no fijos en código.
- Limpieza de imágenes huérfanas en la biblioteca de media: tarea periódica, no borrado inmediato.

## Fases de implementación

### Fase 0 — Contrato de API (secuencial)
Definir forma exacta de endpoints y schema de `Seccion.contenido` por tipo de bloque, para desbloquear trabajo en paralelo sobre mocks.

### Fase 1 — Construcción base (4 agentes en paralelo)

| Agente | Tarea | Depende de |
|---|---|---|
| 1 · Backend | App `sitio`: modelos, migraciones, serializers, views, permisos, pipeline de optimización de imágenes | Fase 0 |
| 2 · Diseño/plantillas | 8-10 plantillas completas con skills de diseño/animación, pasando cada una por `design-taste-frontend` antes de darse por terminada | — |
| 3 · Admin scaffold | Estructura `GestionSitio`: rutas, tabs, servicios (mocks), tablas | Fase 0 |
| 4 · Sitio público scaffold | Proyecto `octopus-sitio/`: Vite, Tailwind, layout, routing, servicio (mocks) | Fase 0 |

### Fase 2 — Integración de piezas (2 agentes en paralelo) ✅ Completada (2026-08-15)

| Agente | Tarea |
|---|---|
| 1 · Editor visual admin | Constructor de bloques (dnd-kit), panel de propiedades, animaciones, Tiptap, biblioteca de media — conectado al backend real |
| 2 · Renderer público | Motor `Pagina → Seccion[] → bloques animados` (Framer Motion/Embla), conectado al backend real |

Verificado en navegador end-to-end: creación/edición de bloque Hero con autosave persistido en base de datos real, editor de artículos (Tiptap) renderizando y guardando. Bugs de backend encontrados y corregidos durante la integración: URLs de `Media` ahora absolutas en endpoints públicos (`context={'request': request}`), y `articulo_slug` agregado al menú público (requirió campo `ItemMenu.articulo` + migración `0002_itemmenu_articulo`, faltaba en el modelo original). Deuda técnica pendiente anotada en `octopus-api/NOTAS_TECNICAS.md`.

### Fase 3 — Integración final (secuencial) ✅ Completada
Reemplazar mocks por API real en ambos frontends. Probar flujo completo: crear página → elegir plantilla → editar → publicar → verla en el sitio público.

### Fase 4 — Infra/deploy (secuencial) ✅ Completada (2026-08-16)
Server block nginx para el dominio raíz, build de `octopus-sitio`, SSL con certbot. No afecta el subdominio de producción actual.

Entregado: `deploy/nginx/clhma.com.conf` (server block completo: redirect HTTP→HTTPS, `www`→apex, SPA fallback,
cache de `/assets/` versionados por Vite, webroot para certbot), `deploy/nginx/README.md` (runbook de una sola vez:
DNS, carpeta en el servidor, `DJANGO_CORS_ORIGINS`, primer certificado con `certbot certonly --webroot`),
`octopus-sitio/.env.production` (`VITE_API_BASE_URL=https://app.clhma.com`, no versionado igual que el del panel
admin) y `deploy.sh` actualizado con el build de `octopus-sitio` (paso 5). Verificado con `npm run build` local
sobre `octopus-sitio/` — compila sin errores usando `.env.production`.

Pendiente en el servidor real (fuera del alcance de este entorno de desarrollo): ejecutar el runbook de
`deploy/nginx/README.md` — apuntar DNS, copiar el server block, emitir el certificado con certbot y agregar
`clhma.com`/`www.clhma.com` a `DJANGO_CORS_ORIGINS` en el `.env` de producción del backend.

### Fase 5 — QA y cierre ✅ Completada (2026-08-16)
Pruebas mobile-first, accesibilidad básica, anotar deuda técnica pendiente en `NOTAS_TECNICAS.md`.

QA encontró 2 bloqueantes (creación de `Menu` desde el admin, contraste WCAG insuficiente en botones del
sitio público) y 3 hallazgos de severidad media (carrusel no operable por teclado en mobile, página publicada sin
bloques renderizaba vacía sin `h1`, byline de autor no expuesto por la API pública) — los 5 se corrigieron y
verificaron (build/tests/requests reales). De paso se cerraron 3 ítems de deuda técnica de Fase 3 (warning de
Tiptap, formulario de edición de metadatos de página, 6 variantes visuales de `BloqueCards`). Detalle completo de
cada fix en `octopus-api/NOTAS_TECNICAS.md`.

## Deuda técnica anotada (no implementada en v1)

- Versionado / lock optimista para edición concurrente de páginas.
- Limpieza automática de media huérfana.
- Cache de endpoints públicos.
