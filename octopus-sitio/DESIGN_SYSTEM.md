# Sistema de diseño — Sitio institucional

> Fase 1, agente 2 (Diseño/Plantillas). Cubre el sistema base compartido, el catálogo de animaciones con timings exactos, y las 10 plantillas de la galería inicial con su composición de bloques, variantes y justificación.
>
> No cubre el editor visual admin ni el renderer conectado a API real: eso es Fase 2.

---

## 0. Lectura del encargo

**Reading this as:** sitio institucional multi-colegio (CMS multi-tenant) para colegios privados de LATAM, audiencia principal madres y padres evaluando el colegio desde el celular, con un lenguaje **institucional-editorial cálido**, apoyado en tokens CSS más Tailwind v4 y Framer Motion.

### El problema real que resuelve este sistema

El color de marca **no se conoce en tiempo de diseño**. Viene de `ConfiguracionSitio.color_primario / _secundario / _acento` y cada colegio carga el suyo: uno pondrá `#123a6b`, otro `#f2c94c`. Un sistema de diseño normal se apoya en su paleta para tener personalidad. Aquí eso es imposible.

**Decisión rectora: la identidad la carga la estructura, el color entra como invitado.**

- El peso visual lo llevan la tipografía, el ritmo vertical, el filete y la proporción de las fotos.
- El color de marca aparece en superficies pequeñas y de alto valor: filetes de sección, el relleno de un único CTA por vista, el icono de una card, el borde de una cita, la barra de progreso de lectura.
- **Nunca** un wash de gradiente a pantalla completa con el hex del colegio. Un amarillo claro y un azul marino no pueden compartir ese tratamiento sin que uno de los dos se vea roto.
- Los grandes fondos de color usan `--marca-profundo` (mezcla del primario con casi-negro) o el neutro papel/tinta, que son predecibles con cualquier hex de entrada.

Consecuencia práctica: el contraste del texto sobre relleno de marca **se calcula, no se supone**. `_kit/tema.js` mide luminancia relativa WCAG y elige tinta o papel para `--marca-primario-texto`. Un colegio con marca amarilla obtiene texto oscuro en sus botones sin que nadie edite CSS.

### Dials base

| Dial | Base | Rango entre plantillas |
|---|---|---|
| `DESIGN_VARIANCE` | 6 | 4 (Artículo, Contacto) a 7 (Patio, Niveles) |
| `MOTION_INTENSITY` | 5 | 3 (Artículo, Contacto) a 7 (Patio) |
| `VISUAL_DENSITY` | 3 | 3 a 6 (Eventos) |

Variance moderada a propósito: un editor sin formación en diseño va a reordenar estos bloques con dnd-kit. Una plantilla de variance 9 se rompe en cuanto alguien mueve una sección. La rejilla estructurada del plan (alineación/ancho/espaciado controlados, sin posicionamiento libre) es lo que sostiene esa promesa.

---

## 1. Tokens

Archivo único: `src/styles/tokens.css`, importado desde `src/index.css`.

### 1.1 Marca (puente con el scaffold)

El scaffold del sitio público ya inyecta `--color-primario / --color-secundario / --color-acento` en `:root` desde `ConfiguracionContext`. Los tokens de las plantillas **se derivan de esos**, no compiten con ellos:

```css
--marca-primario:   var(--color-primario,   #1f4d3d);
--marca-secundario: var(--color-secundario, #8a6a3b);
--marca-acento:     var(--color-acento,     #b3432f);
```

Derivados con `color-mix(in oklab, ...)`, para que cualquier hex produzca una rampa usable sin definir 9 pasos a mano en el admin:

| Token | Uso |
|---|---|
| `--marca-tinte-04 / -08 / -16 / -32` | fondos de sección teñidos, estados hover, badges |
| `--marca-sombra` | sombra tintada del gesto `hover-glow` |
| `--marca-profundo` | velo de hero y CTA sobre foto (mezcla 82% marca + `#0b0a09`) |
| `--marca-primario-texto` | texto legible SOBRE relleno de marca. Calculado por luminancia en runtime |
| `--marca-acento-texto` | idem para el acento |

### 1.2 Neutros papel/tinta

Independientes de la marca, en escala cálida. Nunca `#000` ni `#fff` puros.

| Token | Claro | Oscuro |
|---|---|---|
| `--papel` | `#fbfaf8` | `#15140f` |
| `--papel-2` | `#f4f2ed` | `#1d1c17` |
| `--papel-3` | `#eae6df` | `#26241e` |
| `--tinta` | `#191817` | `#f6f4f0` |
| `--tinta-700` | `#3d3a36` | `#d5d0c8` |
| `--tinta-500` | `#6d6660` | `#a09a91` |
| `--tinta-400` | `#918a83` | `#7d766e` |
| `--linea` | `#e2ded7` | `#2e2b25` |
| `--linea-fuerte` | `#cdc7bd` | `#423e36` |

Modo oscuro por `prefers-color-scheme`, con override manual vía `:root[data-tema='oscuro'|'claro']`. **Bloqueo de tema:** el tema es de página, no de sección. Una sección no invierte a modo contrario a mitad del scroll. Las secciones de foto a sangre con velo oscuro no cuentan como inversión de tema: son fotografía, no superficie de UI.

### 1.3 Tipografía

| Token | Valor | Uso |
|---|---|---|
| `--fuente-display` | Geist, fallback system-ui | titulares en **todas** las plantillas |
| `--fuente-texto` | Geist | cuerpo por defecto |
| `--fuente-editorial` | EB Garamond, fallback Georgia | **solo** cuerpo de artículo largo |
| `--fuente-mono` | Geist Mono | fechas de agenda, datos tabulares |

**Sobre la serif.** Es el único punto del sistema donde aparece, y está justificada: lectura larga, párrafos reales, contexto de publicación escolar. Los titulares del artículo siguen siendo sans display, porque el titular es la voz del colegio y esa voz es la misma en todo el sitio. La serif no se usa por "sensación editorial" en homes, admisiones ni contacto.

Escala (`--paso--2` a `--paso-7`, de 12px a 72px). Regla de titular: `--paso-7` (72px) solo se permite con titulares de 3 a 5 palabras. Todo titular usa `clamp()` con `text-wrap: balance` y `letter-spacing: -0.022em`.

Medidas de línea: `--ancho-lectura: 68ch` para cuerpo de artículo, `46ch` para lead, `52ch` para párrafo de bloque.

### 1.4 Ritmo vertical

Mapea directamente `config_estilo.espaciado_top/bottom`:

| Valor | Token | Medida |
|---|---|---|
| `sm` | `--ritmo-sm` | 3rem |
| `md` | `--ritmo-md` | 5rem |
| `lg` | `--ritmo-lg` | 7.5rem |

`config_estilo.ancho`: `contenido` = `--ancho-contenido` (1200px) con canal lateral de 1.25rem; `completo` = 100vw sin canal (el bloque gestiona su propio contenedor interno).

### 1.5 Radios — una sola regla

| Token | Valor | Aplica a |
|---|---|---|
| `--radio-interactivo` | `999px` | botones, controles de carrusel, chips |
| `--radio-superficie` | `14px` | imágenes, tarjetas, contenedores de media |
| `--radio-campo` | `10px` | inputs, selects, textareas |

Esta es la regla documentada del sistema y no admite excepciones por plantilla. Botón redondo sobre tarjeta cuadrada es coherente **porque la regla lo dice**, no por capricho de sección.

### 1.6 Sombras

Tintadas al papel, nunca negro puro sobre fondo claro.

- `--sombra-1`: reposo de superficie elevada.
- `--sombra-2`: hero dividido, media destacada.
- `--sombra-marca`: exclusiva del gesto `hover-glow`, derivada del primario del colegio.

La tarjeta con caja se usa **solo** cuando la elevación comunica jerarquía real (cada card es un destino navegable). Si no, se agrupa con `--linea` y espacio negativo: es la variante `desnudas` de `cards`.

### 1.7 Foco y accesibilidad

Anillo de foco único en todo el sitio: `outline: 2px solid var(--marca-primario); outline-offset: 3px`. Contraste objetivo AA (4.5:1) en cuerpo y AAA en titulares. Botón sobre foto nunca es texto suelto: usa la variante `velo` (vidrio con borde propio de 1px).

---

## 2. Catálogo de animaciones

Archivo: `src/templates/_kit/animaciones.js`. Corresponde 1:1 con el enum `Seccion.animacion` del contrato.

### 2.1 Curvas y duraciones

| Nombre | Valor | Uso |
|---|---|---|
| `CURVA_SALIDA` | `cubic-bezier(0.16, 1, 0.3, 1)` | **toda** entrada del sitio |
| `CURVA_ESTANDAR` | `cubic-bezier(0.4, 0, 0.2, 1)` | cambios de color y de fondo |
| `RESORTE_SUAVE` | `spring · stiffness 320 · damping 26 · mass 0.6` | gestos hover y tap |

Una sola curva de entrada en todo el sitio es deliberado: dos bloques distintos configurados por dos editores distintos se siguen sintiendo del mismo sitio.

### 2.2 Entradas

| `animacion` | Estado inicial | Estado final | Duración | Curva |
|---|---|---|---|---|
| `fade-in` | `opacity 0` | `opacity 1` | 500 ms | salida |
| `slide-up` | `opacity 0, y 24` | `opacity 1, y 0` | 600 ms | salida |
| `slide-left` | `opacity 0, x 32` | `opacity 1, x 0` | 600 ms | salida |
| `slide-right` | `opacity 0, x -32` | `opacity 1, x 0` | 600 ms | salida |
| `scroll-reveal` | `opacity 0, y 32` | `opacity 1, y 0` | 700 ms | salida |
| `stagger` | contenedor | `staggerChildren 70 ms, delayChildren 50 ms` | por hijo 500 ms, `y 20 → 0` | salida |

`viewport: { once: true, amount: 0.25 }` siempre (`0.12` en bloques altos como hero y galería a sangre). Un bloque que se re-anima al volver a subir se siente roto, no vivo.

### 2.3 Gestos

| `animacion` | Hover | Tap |
|---|---|---|
| `hover-lift` | `y -4` con `RESORTE_SUAVE` | `y -1, scale 0.985`, 180 ms |
| `hover-glow` | `boxShadow 0 10px 30px var(--marca-sombra)`, 320 ms, curva estándar | `scale 0.985`, 180 ms |

`hover-glow` es el único punto donde el color del colegio aparece como luz, y solo en reposo hover de bloques sin caja.

### 2.4 Ligadas a scroll

| `animacion` | Implementación | Rango | Restricción |
|---|---|---|---|
| `parallax` | `useScroll` + `useTransform` sobre `y` | `-8%` a `+8%`, imagen a `scale 1.16` | **solo ≥1024px** |
| `zoom-on-scroll` | `useScroll` offset `start end → center center` | `scale 1.12 → 1` | ninguna, es barato |

Parallax es desktop-only porque en gama media de LATAM compite con el scroll, que ya es la interacción principal, y produce jank visible. El corte se hace con `matchMedia`, no con CSS: si no aplica, el motion value ni se conecta.

**Prohibido en todo el sitio:** `window.addEventListener('scroll')`. La nav pública detecta el desplazamiento con un centinela de `IntersectionObserver`, no con listener de scroll.

### 2.5 `prefers-reduced-motion`

No negociable y resuelto en un solo punto: `variantes(animacion, reducir)` devuelve `null` cuando hay reduced-motion, y `Revelar` renderiza entonces un elemento plano, sin `motion`, sin coste. Parallax, zoom, barra de progreso y stagger colapsan a estado final instantáneo. `tokens.css` además fuerza `animation-duration: 0.01ms` global bajo la media query, como red de seguridad para CSS de terceros.

### 2.6 Presupuesto de animación por página

Máximo **una** animación ligada a scroll continuo (parallax o zoom) por pantalla visible. Un hero con parallax seguido de una galería con zoom en la misma pantalla es la receta del jank. Toda animación tiene que poder justificarse en una frase (jerarquía, narrativa, feedback o cambio de estado); si no, se quita.

---

## 3. Variantes por bloque

Los 7 tipos del contrato son la materia prima. Las variantes son lo que evita que 10 plantillas se vean iguales.

| Bloque | Variantes | Nota |
|---|---|---|
| `hero` | `dividido`, `inmersivo`, `editorial` | `overlay` del contenido controla el velo: `oscuro` usa `--marca-profundo`, `claro` usa papel al 94%, `ninguno` deja la foto limpia |
| `texto_imagen` | `filete`, `solapado`, `formulario` | `posicion_imagen` del contenido decide el lado; la variante decide el tratamiento |
| `galeria` | `mosaico` (primera a doble alto), `rejilla` (`columnas` manda) | |
| `cards` | `desnudas`, `contenidas`, `retrato`, `pasos`, `agenda`, `hito`, `lista`, `destacada`, `contacto` | `columnas` 2/3/4 del contenido |
| `cta` | `banda` (fondo primario), `sobrefoto` (parallax + velo), `discreta` (filetes) | |
| `testimonios` | `citas` (2 col, cita grande sin comillas decorativas), `retratos` (3 col, foto redonda) | cita máximo 3 líneas |
| `carrusel` | `ancho` (slide 78vw), `tarjetas` (3 visibles en desktop) | POC con scroll-snap nativo; Fase 2 monta Embla sobre el mismo marcado |

Construidas en código: todas las variantes usadas por las 3 plantillas implementadas. El resto están especificadas aquí y las monta el agente de Renderer en Fase 2 sobre `_kit/bloques.jsx`.

### Reglas transversales de composición

1. **Máximo 1 rótulo de sección por cada 3 secciones** de la página. El rótulo (`Rotulo`) es la etiqueta pequeña en versalitas sobre el titular. Poner uno encima de cada sección es lo que hace que un sitio se vea generado.
2. **Máximo 2 secciones consecutivas** con el patrón texto+imagen partido. La tercera obliga a cambiar de familia de layout.
3. **Ninguna familia de layout se repite** dentro de una misma plantilla. Una plantilla de 6 secciones usa 6 composiciones distintas.
4. **Un solo CTA primario por intención** en toda la página. Si la nav dice "Agendar visita", el hero y el CTA final dicen "Agendar visita", no "Contáctanos" ni "Escríbenos".
5. **La rejilla tiene exactamente tantas celdas como contenido haya.** 3 items, 3 celdas. Nunca una celda vacía de relleno.

---

## 4. Las 10 plantillas

Cada una pasó por `design-taste-frontend`: lectura del encargo, dials razonados, punto de vista propio declarado, y pre-flight contra los tells (cero em-dash, sin eyebrows de numeración, sin claves de scroll, sin pastillas sobre las fotos, sin franjas de ciudad y hora, sin capturas falsas hechas con divs, sin nombres genéricos ni cifras de precisión inventada).

---

### 01 · Home "Umbral" — construida

`src/templates/HomeUmbral.jsx` · variance 6 · motion 5 · density 3

**Por qué esta dirección.** Casi todo sitio de colegio abre con foto aérea del campus a pantalla completa y un lema encima. Eso no distingue a nadie: todos los campus se ven igual desde un dron. Umbral entra por la palabra. Titular a la izquierda, una sola foto **vertical** a la derecha en proporción de retrato, como una foto de anuario y no como banner de agencia de viajes. La página se lee de arriba a abajo con ritmo de folleto impreso, que es el material con el que un colegio ya sabe comunicar. Es la plantilla por defecto de la galería porque es la que aguanta cualquier hex de marca y cualquier calidad de foto: el peso lo llevan la tipografía y el filete.

| Orden | Bloque | Variante | Animación | `config_estilo` |
|---|---|---|---|---|
| 1 | `hero` | dividido | `slide-up` + `slide-left` en la foto | contenido / md / lg / blanco |
| 2 | `texto_imagen` | filete | `scroll-reveal` + `zoom-on-scroll` | contenido / lg / lg / gris |
| 3 | `cards` | desnudas, 3 col | `stagger` + `hover-glow` | contenido / lg / lg / blanco |
| 4 | `carrusel` | ancho | `slide-left` por slide | completo / lg / lg / gris |
| 5 | `testimonios` | citas, 2 col | `stagger` | contenido / lg / lg / blanco |
| 6 | `cta` | banda | `slide-up` | contenido / lg / lg / primario |

Familias de layout: split de hero, split texto+imagen, rejilla sin caja con filetes, pista horizontal, dos columnas de cita, banda a sangre. Seis secciones, seis familias. Un solo rótulo (sobre `cards`).

---

### 02 · Home "Patio" — construida

`src/templates/HomePatio.jsx` · variance 7 · motion 7 · density 3

**Por qué esta dirección.** Para el colegio cuyo argumento de venta **es el lugar**: campus grande, cancha techada, huerto, laboratorios. Aquí la foto no ilustra el texto, la foto **es** el texto. Toda la plantilla está construida para que el visitante haga un recorrido y no una lectura.

Regla dura de esta plantilla: **cero bloques de texto+imagen partido**. Si la plantilla se justifica por las fotos, meter columnas de párrafo al lado de la foto la convierte en cualquier otro sitio institucional. El texto vive corto, en pies de foto y tarjetas.

| Orden | Bloque | Variante | Animación | `config_estilo` |
|---|---|---|---|---|
| 1 | `hero` | inmersivo, overlay oscuro, `100dvh` | `parallax` + `slide-up` | completo / sm / sm / transparente |
| 2 | `cards` | retrato, 3 col | `stagger` + `zoom-on-scroll` + `hover-lift` | contenido / lg / lg / blanco |
| 3 | `carrusel` | ancho | `slide-left` por slide | completo / lg / lg / gris |
| 4 | `galeria` | mosaico | `stagger` | contenido / lg / lg / blanco |
| 5 | `cta` | sobrefoto | `parallax` + `slide-up` | completo / lg / lg / transparente |

La nav arranca transparente sobre el hero y se solidifica al salir de él (fondo `color-mix` + `backdrop-filter`), detectado con centinela de `IntersectionObserver`. Nunca texto blanco sobre foto sin velo: el hero usa `--marca-profundo` en degradado y los botones la variante `velo`.

---

### 03 · Home "Pizarra" — especificada

variance 5 · motion 4 · density 4

**Por qué esta dirección.** El colegio académico que no tiene campus fotogénico y cuyo argumento son los resultados, el claustro y el método. Forzarle fotos de instalaciones lo hace parecer lo que no es. Pizarra abre con hero **editorial sin imagen**: el titular como cartel, ocupando el ancho de lectura, y debajo dos columnas de argumento. La primera foto aparece recién en la tercera sección, y es del aula, no del edificio.

| Orden | Bloque | Variante | Animación | `config_estilo` |
|---|---|---|---|---|
| 1 | `hero` | editorial (sin imagen de fondo) | `slide-up` | contenido / lg / sm / blanco |
| 2 | `cards` | desnudas, **2 col** | `stagger` | contenido / md / lg / blanco |
| 3 | `texto_imagen` | filete, imagen izquierda | `slide-right` | contenido / lg / lg / gris |
| 4 | `testimonios` | retratos, 3 col | `stagger` | contenido / lg / lg / blanco |
| 5 | `cta` | discreta | `scroll-reveal` | contenido / md / md / blanco |

Cards a 2 columnas y no a 3: cuando el argumento es denso, tres columnas obligan a recortar el texto hasta volverlo eslogan.

---

### 04 · Nosotros "Cronología" — especificada

variance 6 · motion 5 · density 4

**Por qué esta dirección.** La página de "Nosotros" de un colegio suele ser un muro de párrafos sobre misión, visión y valores que nadie lee. La historia sí se lee, si se puede recorrer. Cronología convierte los 50 años en una línea vertical de hitos: filete de marca a la izquierda, año en `--fuente-mono`, hito a la derecha. La misión y la visión no desaparecen, se disuelven dentro de los hitos donde efectivamente ocurrieron.

| Orden | Bloque | Variante | Animación | `config_estilo` |
|---|---|---|---|---|
| 1 | `hero` | editorial | `fade-in` | contenido / lg / sm / blanco |
| 2 | `texto_imagen` | solapado (foto rebasa el borde de sección) | `slide-right` | contenido / lg / lg / gris |
| 3 | `cards` | hito, 1 col | `stagger` | contenido / lg / lg / blanco |
| 4 | `galeria` | rejilla | `stagger` | contenido / md / lg / gris |
| 5 | `cta` | banda | `slide-up` | contenido / lg / lg / primario |

La variante `solapado` es el único lugar del sistema donde un elemento rompe la caja de sección (`margin-block: -2.5rem`). Está permitido una vez por página y solo aquí, porque el gesto narra "esto viene de antes".

---

### 05 · Admisiones "Ruta" — especificada

variance 5 · motion 5 · density 5

**Por qué esta dirección.** Esta es la página que convierte. Todo lo demás sobra. La pregunta que trae quien llega es una sola: qué tengo que hacer y cuándo. Ruta responde eso en la primera pantalla y repite el mismo CTA, con la misma etiqueta, hasta el final. Los pasos se numeran por su **contenido** ("Solicitar cita", "Entrevista familiar", "Prueba diagnóstica", "Respuesta"), nunca con etiquetas decorativas tipo "Paso 1 / Fase 02".

| Orden | Bloque | Variante | Animación | `config_estilo` |
|---|---|---|---|---|
| 1 | `hero` | dividido | `slide-up` | contenido / md / md / blanco |
| 2 | `cards` | pasos, 4 col | `stagger` | contenido / lg / lg / gris |
| 3 | `texto_imagen` | filete (aranceles y documentos) | `scroll-reveal` | contenido / lg / lg / blanco |
| 4 | `testimonios` | citas, 2 col | `stagger` | contenido / lg / lg / gris |
| 5 | `cta` | sobrefoto | `parallax` + `slide-up` | completo / lg / lg / transparente |

Densidad 5, la más alta de las plantillas de conversión: aquí las fechas, los montos y los requisitos son el contenido, no el adorno. Cifras en `--fuente-mono`.

---

### 06 · Contacto "Recepción" — especificada

variance 4 · motion 3 · density 5

**Por qué esta dirección.** El error clásico de la página de contacto es abrir con una foto grande del edificio y empujar el formulario bajo el pliegue. Quien entra a Contacto ya decidió contactar. Recepción pone teléfono, correo y horario de atención en la primera pantalla, en tres bloques de contacto tocables (`tel:` y `mailto:` reales), y el formulario inmediatamente después. La foto del edificio va **al fondo**, con función de referencia de llegada, no de portada.

| Orden | Bloque | Variante | Animación | `config_estilo` |
|---|---|---|---|---|
| 1 | `hero` | editorial (titular corto, sin foto) | `fade-in` | contenido / md / sm / blanco |
| 2 | `cards` | contacto, 3 col | `stagger` | contenido / sm / md / blanco |
| 3 | `texto_imagen` | formulario | `scroll-reveal` | contenido / md / lg / gris |
| 4 | `galeria` | rejilla, 3 col (fachada y accesos) | `fade-in` | contenido / md / md / blanco |

Motion bajado a 3: nada se mueve mientras alguien escribe. El formulario cumple etiqueta arriba del campo, texto de ayuda en el marcado, error debajo del campo, y nunca placeholder haciendo de etiqueta. Estados de carga, éxito y error definidos, con `aria-live` en el mensaje de resultado.

---

### 07 · Artículo "Lectura" — construida

`src/templates/ArticuloLectura.jsx` · variance 4 · motion 3 · density 3

**Por qué esta dirección.** Un artículo de colegio compite con el teléfono en la mano de alguien que está haciendo una cola. Todo lo que no sea el texto estorba. Es la única plantilla que baja motion a 3, quita la foto del encabezado hasta **después** del titular (para que lo primero que carga sea texto y el LCP sea barato) y usa el typeset editorial en el cuerpo.

La única animación no trivial es la barra de progreso de lectura, y está motivada: en un texto largo sin scrollbar visible en mobile, saber cuánto falta reduce el abandono.

| Orden | Bloque | Variante | Animación | `config_estilo` |
|---|---|---|---|---|
| 0 | chrome | barra de progreso | `scaleX` ligado a scroll, spring 120/30 | fija bajo la nav |
| 1 | `hero` | editorial (categoría, titular, resumen, firma) | `fade-in` | contenido / md / sm / blanco |
| 2 | imagen destacada 16:9 | | `fade-in`, `fetchPriority=high` | contenido / sm / md / blanco |
| 3 | cuerpo Tiptap, `--ancho-lectura` | | sin animación | contenido / sm / lg / blanco |
| 4 | `cta` | discreta (boletín) | `scroll-reveal` | contenido / md / md / blanco |
| 5 | `cards` | contenidas, 3 col | `stagger` + `hover-lift` | contenido / lg / lg / gris |

El cuerpo **no** se anima por párrafos. Revelar texto por scroll en un artículo largo es hostil: obliga a esperar para leer. Cita del cuerpo con filete de marca a la izquierda, sin comillas decorativas ni cursiva.

---

### 08 · Noticias "Boletín" — especificada

variance 6 · motion 4 · density 5

**Por qué esta dirección.** Un colegio publica poco: seis a doce notas al año. Una rejilla de tarjetas iguales con doce entradas se ve vacía y despersonalizada, y además miente sobre el ritmo de publicación. Boletín trata el índice como portada de periódico: una nota destacada a doble ancho arriba y el resto en lista con filetes, fecha en mono a la izquierda y titular a la derecha. Con seis notas se ve intencional; con sesenta también.

| Orden | Bloque | Variante | Animación | `config_estilo` |
|---|---|---|---|---|
| 1 | `hero` | editorial | `fade-in` | contenido / md / sm / blanco |
| 2 | `cards` | destacada, 1 col | `slide-up` | contenido / sm / md / blanco |
| 3 | `cards` | lista, 1 col | `stagger` | contenido / sm / lg / blanco |
| 4 | `cta` | discreta (suscripción) | `scroll-reveal` | contenido / md / md / blanco |

Excepción documentada a la regla 3 (no repetir familia de layout): `cards` aparece dos veces, pero en variantes que no comparten composición (una portada a doble ancho contra una lista de filetes). Filtro por categoría como chips con `--radio-interactivo`, nunca como `<select>`.

---

### 09 · Eventos "Agenda" — especificada

variance 5 · motion 5 · density 6

**Por qué esta dirección.** En un calendario escolar el dato que se busca es **la fecha**, no el título del evento. Agenda invierte la jerarquía habitual: columna izquierda fija con día en grande y mes en versalitas (`--fuente-mono`), evento a la derecha. Se escanea con el pulgar en tres segundos. Debajo, un carrusel de lo ya ocurrido, que es donde viven las fotos y donde el colegio demuestra que el calendario se cumple.

| Orden | Bloque | Variante | Animación | `config_estilo` |
|---|---|---|---|---|
| 1 | `hero` | dividido | `slide-up` | contenido / md / md / blanco |
| 2 | `cards` | agenda, 1 col | `stagger` | contenido / md / lg / blanco |
| 3 | `carrusel` | tarjetas (3 visibles en desktop) | `slide-left` por slide | completo / lg / lg / gris |
| 4 | `cta` | banda | `slide-up` | contenido / lg / lg / primario |

Densidad 6, la más alta de la galería, y es correcto: es una tabla de datos disfrazada. Fechas formateadas con `date-fns` y locale `es`, tal como manda el proyecto. Estado vacío diseñado ("No hay eventos programados para este mes") y no una lista en blanco.

---

### 10 · Niveles "Escalera" — especificada

variance 7 · motion 6 · density 4

**Por qué esta dirección.** Preescolar, primaria y bachillerato son tres colegios distintos dentro del mismo campus, y meterlos en tres tarjetas iguales es lo que hace que un padre no entienda la diferencia. Escalera les da un tramo completo a cada uno, alternando el lado de la foto, con retrato vertical (3:4) por tramo. La alternancia se corta en el tercero: ahí entra el mosaico de galería, para no caer en el zigzag infinito.

| Orden | Bloque | Variante | Animación | `config_estilo` |
|---|---|---|---|---|
| 1 | `hero` | inmersivo | `parallax` | completo / sm / sm / transparente |
| 2 | `texto_imagen` | solapado, imagen derecha | `slide-right` | contenido / lg / md / blanco |
| 3 | `texto_imagen` | solapado, imagen izquierda | `slide-left` | contenido / md / md / blanco |
| 4 | `galeria` | mosaico | `stagger` | contenido / lg / lg / gris |
| 5 | `cta` | banda | `slide-up` | contenido / lg / lg / primario |

Exactamente 2 secciones consecutivas de texto+imagen partido, que es el tope del sistema. El tercer nivel se resuelve dentro del mosaico, con pies de foto.

---

## 5. Resumen de la galería

| # | Plantilla | Familia | Estado | Dials (V/M/D) |
|---|---|---|---|---|
| 01 | Home · Umbral | Home | construida | 6 / 5 / 3 |
| 02 | Home · Patio | Home | construida | 7 / 7 / 3 |
| 03 | Home · Pizarra | Home | especificada | 5 / 4 / 4 |
| 04 | Nosotros · Cronología | Institucional | especificada | 6 / 5 / 4 |
| 05 | Admisiones · Ruta | Conversión | especificada | 5 / 5 / 5 |
| 06 | Contacto · Recepción | Conversión | especificada | 4 / 3 / 5 |
| 07 | Artículo · Lectura | Editorial | construida | 4 / 3 / 3 |
| 08 | Noticias · Boletín | Editorial | especificada | 6 / 4 / 5 |
| 09 | Eventos · Agenda | Editorial | especificada | 5 / 5 / 6 |
| 10 | Niveles · Escalera | Institucional | especificada | 7 / 6 / 4 |

El catálogo en código está en `src/templates/index.js`, con la composición de bloques de cada plantilla lista para que el editor visual la siembre como `Seccion[]` al elegirla.

---

## 6. Cómo ver la galería

```bash
cd octopus-sitio
npm install
npm run dev
```

Ruta `/plantillas`. El visor incluye un selector de **paleta de colegio** con cuatro marcas de prueba deliberadamente hostiles entre sí (verde oscuro, azul marino, vinotinto, amarillo claro). Cambiar de paleta sin recargar es la prueba de que el sistema cumple su premisa: si una plantilla se rompe con la marca amarilla, la plantilla está mal, no la marca.

---

## 7. Estructura de archivos

```
octopus-sitio/
├── DESIGN_SYSTEM.md
└── src/
    ├── styles/tokens.css              # sistema base, puenteado a --color-* del scaffold
    └── templates/
        ├── index.js                   # catálogo de las 10 plantillas + composición de bloques
        ├── GaleriaPlantillas.jsx      # visor interno con selector de paleta
        ├── datosDemo.js               # contenido de demo con la forma exacta del contrato
        ├── HomeUmbral.jsx
        ├── HomePatio.jsx
        ├── ArticuloLectura.jsx
        └── _kit/
            ├── tema.js                # luminancia WCAG y aplicación de la marca
            ├── animaciones.js         # catálogo con timings exactos
            ├── primitivos.jsx         # Seccion, Revelar, Boton, Titular, parallax, zoom
            ├── bloques.jsx            # los 7 bloques del contrato con sus variantes
            └── chrome.jsx             # nav pública y pie
```

`_kit/` es lo que el agente de Renderer público (Fase 2) debe reutilizar: los bloques ya leen `contenido` con la forma del contrato y `config_estilo` con sus cuatro claves. Conectar la API real es cambiar el origen de los datos, no reescribir componentes.

---

## 8. Deuda técnica detectada (anotada, no implementada)

Se traslada a `NOTAS_TECNICAS.md` en el cierre de fase.

1. **Fuentes.** Geist y EB Garamond están declaradas en los tokens pero no auto-alojadas todavía. Hoy caen al stack del sistema. Falta agregar `@fontsource-variable/geist` y `@fontsource-variable/eb-garamond` con `font-display: swap` y precarga del display, o el CLS del primer titular será visible.
2. **Carrusel.** El POC usa scroll-snap nativo. Fase 2 debe montar `embla-carousel-react` conservando el mismo marcado, y añadir región `aria-roledescription="carousel"` con anuncio de slide activo.
3. **`config_estilo.fondo: 'primario'`.** Con marcas de luminancia media (por ejemplo un naranja) la banda de CTA queda en zona gris de contraste aun eligiendo bien el texto. Conviene que el admin muestre una advertencia de contraste al guardar el color, no que el sitio lo compense en silencio.
4. **Modo oscuro y color de marca.** Un primario muy oscuro (`#101820`) sobre papel oscuro pierde presencia. Falta una regla de aclarado automático del primario en modo oscuro vía `color-mix` con el papel, medida contra AA.
5. **Imágenes.** Las plantillas piden proporciones concretas (retrato 3:4 en hero dividido y cards de nivel, 16:10 en carrusel, 1:1 en la celda mayor del mosaico). El pipeline de `Media` genera anchos, no recortes. Sin arte de recorte guiado, las fotos verticales del colegio se van a ver mal encuadradas. Propuesta para v2: campo `punto_focal` en `Media` y `object-position` derivado.
6. **Barra de progreso de lectura.** Se calcula sobre el documento completo, no sobre el `<article>`. En artículos cortos con muchos relacionados la barra llega al 100% antes de terminar el texto.
