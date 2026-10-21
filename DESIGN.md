# Design — Portal de representantes

Alcance: `octopus-frontend/src/portal/` (portal de representantes). El panel administrativo, el portal docente y la cantina tienen su propio lenguaje y no se rigen por este documento.

Modo: **Operate**. El representante viene a resolver algo concreto (¿debo?, pagar/reportar, leer un aviso), casi siempre desde el celular.

## Dirección

Fijada por el dueño del producto con una imagen de referencia: el dashboard "Harmik Creation" (reemplaza a la primera referencia, "University"). Se toma su **composición y aire**, no su contenido ni su paleta: el único acento es el color del colegio y no hay promociones.

- **Tesis:** riel y encabezado blancos, lienzo gris-lavanda muy claro, secciones con títulos grandes y livianos y mucho aire; un solo color de acento (la marca del colegio) para lo activo o destacado. El estado de cuenta vive arriba del riel como en la tarjeta "Balance" de la referencia. Rechaza el tablero de muchas cajas del mismo peso compitiendo.
- **Mundo propio:** superficies blancas con radio 24px y sombras casi imperceptibles, íconos de trazo fino (1.75), avatares de iniciales teñidos, fechas como bloque (día grande + mes), píldoras de estado. Sin texto rotado (no funciona en 360px).
- **Traducción de la referencia:** "Balance" → tarjeta de saldo (REF. y Bs.; verde "Al día" si no debe). "Welcome back" → "Hola, {nombre}" con una tarjeta por hijo (avatar, grado, accesos a mensajes, rendimiento y plan). "Course Result" → promedio por materia del hijo activo. "Today's Progress" → próximos vencimientos y estado de comprobantes. Desde lg, rejilla 2×2 de secciones; en celular se apilan.
- **Primer viewport (360×640):** encabezado con colegio + avatar + salir; "Hola, {nombre}"; estado de cuenta con la acción de pago; barra inferior con Inicio, Historial, Avisos, Más; botón flotante de pago sobre la barra.

## Tokens (en `src/index.css`, `:root`)

| Token | Uso |
|---|---|
| `--portal-primary` / `--portal-secondary` | Marca del colegio, inyectada por `BrandingContext`. Nunca se fija a mano. |
| `--portal-canvas` | Fondo del área de contenido: `#f4f5f9` con 3% de la marca. |
| `--portal-surface` | Blanco de riel, encabezado, tarjetas y barra inferior. |
| `--portal-line` | Borde de 1px de tarjetas (8% de tinta). |
| `--portal-tint` / `--portal-tint-ink` | Fondo teñido (10% marca) y su tinta legible (marca 70% + azul noche). Avatares, fecha, estados activos. |
| `--portal-hero` | Marca oscurecida (76% + `#0f172a`): fondo del bloque protagonista y del botón principal. Garantiza contraste con texto blanco sin depender del color que configure el colegio. |
| `--portal-ink` / `--portal-muted` | Texto principal `#2b303a` y secundario `#646b78` (≥4.5:1 sobre blanco y lienzo). |
| `--portal-shadow` | `0 1px 2px` + `0 10px 28px` muy suaves. |
| `--portal-radius` 24px · `-sm` 16px · `-xl` 32px | Tarjetas · controles/fechas · bloque protagonista. |

Estados (rojo mora, verde aprobado, ámbar pendiente) usan los tokens globales `--red`, `--green`, `--yellow`, nunca la marca.

## Clases

- `.portal-shell` — raíz; define fondo, selección de texto y anillo de foco con la marca.
- `.portal-topbar` — encabezado pegajoso blanco translúcido con borde inferior de 1px.
- `.portal-card` (+ `--soft`) — tarjeta base. No se anidan tarjetas dentro de tarjetas.
- `.portal-hero` + `.portal-hero-card` — bloque protagonista de color con hasta dos tarjetas blancas internas (como la referencia). Uno por pantalla como máximo.
- `.portal-date` (+ `--alerta`) — bloque de fecha de 60px: `<strong>` día, `<span>` mes (date-fns `es`).
- `.portal-avatar` — círculo de iniciales teñido.
- `.portal-page-title` / `.portal-section-title` — títulos; la sección es grande y liviana (peso 500); el tamaño va en Tailwind (`text-2xl sm:text-3xl`, `text-xl sm:text-2xl`).
- `.portal-kicker` — etiqueta discreta en tipo de oración. **No** se usan eyebrows en mayúsculas sobre títulos.
- `.portal-action` — acceso rápido clicable (radio 20px, se eleva 2px al pasar el mouse).
- `.portal-rail-link` (`.active`: fondo teñido, tinta plena, ícono en la marca) y `.portal-tab` (`.is-active`, `__icon`) — navegación.
- `.portal-skeleton` — color de los skeletons (`SkeletonCard`, `SkeletonLine`).

## Marco (`PortalLayout`)

- **< md:** encabezado (logo + nombre del colegio · avatar → Mi perfil · Salir), contenido a ancho completo con `px-4`, barra inferior de 64px con Inicio, Historial, Avisos y Más. "Más" abre un panel sobre la barra con Mensajes, Rendimiento, Plan de evaluación, Cantina, Mi perfil, Seguridad (e Instalar app si aplica); se cierra tocando fuera o con Escape.
- **md:** riel fijo de 80px solo con íconos (etiqueta en `title` y `sr-only`).
- **lg+:** riel blanco de 256px: logo + nombre real del colegio, tarjeta de saldo (deuda en REF./Bs. o "Al día"; enlaza a Inicio), navegación con texto, Instalar app y Salir al pie. El encabezado muestra la fecha del día y el avatar del representante (→ Mi perfil). Sin buscador: el portal tiene pocas secciones (decisión del dueño).
- El saldo lo carga `PortalLayout` con `getDashboard()` y lo publica en el contexto del Outlet (`resumenFinanciero`, `recargarResumen`) para que las páginas lo reutilicen y lo refresquen tras un pago.
- Contenido centrado `max-w-6xl`. Las etiquetas de navegación salen de una sola lista: `components/navPortal.js`.

## Composición del contenido

- Más espacio arriba de un título de sección que debajo; secciones separadas por `space-y-6 sm:space-y-8`.
- Tarjetas con `p-5 sm:p-6`. Listas con fecha en bloque a la izquierda, título + detalle al centro y monto/estado a la derecha.
- Grillas siempre con breakpoint (`grid-cols-1 md:grid-cols-…`). Única excepción: grupos de botones cortos (barra inferior, menú Más).

## Movimiento

Mínimo y funcional: transiciones de color de 160–200ms en navegación, elevación de 2px en accesos rápidos con `cubic-bezier(.22,1,.36,1)`, pulso en skeletons. Todo se desactiva con `prefers-reduced-motion`.

## Tipografía

Inter (la del sistema, `--font-sans`). Títulos de página 700 con tracking −0.025em; títulos de sección 650; montos con cifras tabulares.
