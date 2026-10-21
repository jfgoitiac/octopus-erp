# Design — Portal de representantes

Alcance: `octopus-frontend/src/portal/` (portal de representantes). El panel administrativo, el portal docente y la cantina tienen su propio lenguaje y no se rigen por este documento.

Modo: **Operate**. El representante viene a resolver algo concreto (¿debo?, pagar/reportar, leer un aviso), casi siempre desde el celular.

## Dirección

Fijada por el dueño del producto con una imagen de referencia (dashboard "University"). Se toma su **composición y aire**, no su contenido ni su paleta: el color es el del colegio y no hay promociones.

- **Tesis:** un lienzo gris muy claro, pocas tarjetas blancas holgadas y un único bloque protagonista con el color del colegio que responde la pregunta principal: cuánto debo y cómo lo pago. Rechaza el tablero de muchas cajas del mismo peso compitiendo.
- **Mundo propio:** lienzo `--portal-canvas` (gris frío apenas teñido de marca), superficies blancas con radio 24px y sombra suave con desplazamiento, un solo campo de color saturado por pantalla (`.portal-hero`), iniciales en círculos teñidos en lugar de fotos, fechas como bloque (día grande + mes).
- **Recorrido:** ve el estado de cuenta → toca pagar/reportar → baja a vencimientos, comprobantes y pagos → avisos y mensajes.
- **Primer viewport (360×640):** encabezado con colegio + avatar + salir; saludo; bloque protagonista con deuda en REF/Bs. y acción de pago; barra inferior con Inicio, Historial, Avisos, Más; botón flotante de pago sobre la barra.

## Tokens (en `src/index.css`, `:root`)

| Token | Uso |
|---|---|
| `--portal-primary` / `--portal-secondary` | Marca del colegio, inyectada por `BrandingContext`. Nunca se fija a mano. |
| `--portal-canvas` | Fondo de la app: `#f2f3f6` con 3% de la marca. |
| `--portal-surface` | Blanco de tarjetas, riel activo y barra inferior. |
| `--portal-line` | Borde de 1px de tarjetas (8% de tinta). |
| `--portal-tint` / `--portal-tint-ink` | Fondo teñido (10% marca) y su tinta legible (marca 70% + azul noche). Avatares, fecha, estados activos. |
| `--portal-hero` | Marca oscurecida (76% + `#0f172a`): fondo del bloque protagonista y del botón principal. Garantiza contraste con texto blanco sin depender del color que configure el colegio. |
| `--portal-ink` / `--portal-muted` | Texto principal `#2b303a` y secundario `#646b78` (≥4.5:1 sobre blanco y lienzo). |
| `--portal-shadow` | `0 1px 2px` + `0 10px 28px` muy suaves. |
| `--portal-radius` 24px · `-sm` 16px · `-xl` 32px | Tarjetas · controles/fechas · bloque protagonista. |

Estados (rojo mora, verde aprobado, ámbar pendiente) usan los tokens globales `--red`, `--green`, `--yellow`, nunca la marca.

## Clases

- `.portal-shell` — raíz; define fondo, selección de texto y anillo de foco con la marca.
- `.portal-topbar` — encabezado pegajoso translúcido sobre el lienzo, sin borde.
- `.portal-card` (+ `--soft`) — tarjeta base. No se anidan tarjetas dentro de tarjetas.
- `.portal-hero` + `.portal-hero-card` — bloque protagonista de color con hasta dos tarjetas blancas internas (como la referencia). Uno por pantalla como máximo.
- `.portal-date` (+ `--alerta`) — bloque de fecha de 60px: `<strong>` día, `<span>` mes (date-fns `es`).
- `.portal-avatar` — círculo de iniciales teñido.
- `.portal-page-title` / `.portal-section-title` — títulos; el tamaño va en Tailwind (`text-2xl sm:text-3xl`, `text-xl sm:text-2xl`).
- `.portal-kicker` — etiqueta discreta en tipo de oración. **No** se usan eyebrows en mayúsculas sobre títulos.
- `.portal-action` — acceso rápido clicable (radio 20px, se eleva 2px al pasar el mouse).
- `.portal-rail-link` (`.active`) y `.portal-tab` (`.is-active`, `__icon`) — navegación.
- `.portal-skeleton` — color de los skeletons (`SkeletonCard`, `SkeletonLine`).

## Marco (`PortalLayout`)

- **< md:** encabezado (logo + nombre del colegio · avatar → Mi perfil · Salir), contenido a ancho completo con `px-4`, barra inferior de 64px con Inicio, Historial, Avisos y Más. "Más" abre un panel sobre la barra con Mensajes, Rendimiento, Plan de evaluación, Cantina, Mi perfil, Seguridad (e Instalar app si aplica); se cierra tocando fuera o con Escape.
- **md:** riel fijo de 80px solo con íconos (etiqueta en `title` y `sr-only`).
- **lg+:** riel de 256px: logo + nombre real del colegio, tarjeta del representante (iniciales, nombre, "Representante"), navegación con texto, Instalar app al pie. El encabezado muestra la fecha del día y el chip del representante.
- Contenido centrado `max-w-6xl`. Las etiquetas de navegación salen de una sola lista: `components/navPortal.js`.

## Composición del contenido

- Más espacio arriba de un título de sección que debajo; secciones separadas por `space-y-6 sm:space-y-8`.
- Tarjetas con `p-5 sm:p-6`. Listas con fecha en bloque a la izquierda, título + detalle al centro y monto/estado a la derecha.
- Grillas siempre con breakpoint (`grid-cols-1 md:grid-cols-…`). Única excepción: grupos de botones cortos (barra inferior, menú Más).

## Movimiento

Mínimo y funcional: transiciones de color de 160–200ms en navegación, elevación de 2px en accesos rápidos con `cubic-bezier(.22,1,.36,1)`, pulso en skeletons. Todo se desactiva con `prefers-reduced-motion`.

## Tipografía

Inter (la del sistema, `--font-sans`). Títulos de página 700 con tracking −0.025em; títulos de sección 650; montos con cifras tabulares.
