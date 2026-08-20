/**
 * Catálogo de animaciones del sitio institucional.
 *
 * Corresponde 1:1 con el enum `Seccion.animacion` del contrato de API:
 *   fade-in | slide-up | slide-left | slide-right | scroll-reveal |
 *   stagger | parallax | hover-lift | hover-glow | zoom-on-scroll | ''
 *
 * Reglas del catálogo:
 * 1. Solo se animan `transform` y `opacity`.
 * 2. Toda entrada usa la curva de salida (0.16, 1, 0.3, 1): arranca rápido y
 *    frena largo. Es la única curva de entrada del sitio, así que dos bloques
 *    distintos animados por dos editores distintos se siguen sintiendo iguales.
 * 3. `viewport.once: true` siempre. Un bloque que reaparece al hacer scroll
 *    hacia arriba se siente roto, no vivo.
 * 4. `prefers-reduced-motion` colapsa todo a estado final instantáneo. Se
 *    resuelve con `variantes(animacion, reducir)`: si reducir es true, se
 *    devuelve `null` y el componente renderiza un div normal.
 */

export const CURVA_SALIDA = [0.16, 1, 0.3, 1];
export const CURVA_ESTANDAR = [0.4, 0, 0.2, 1];

export const DUR = {
  rapida: 0.18,
  media: 0.32,
  entrada: 0.6,
  larga: 0.8,
};

export const RESORTE_SUAVE = { type: 'spring', stiffness: 320, damping: 26, mass: 0.6 };

export const VIEWPORT = { once: true, amount: 0.25 };
/** Bloques altos (hero, galería a pantalla) necesitan un umbral menor. */
export const VIEWPORT_ALTO = { once: true, amount: 0.12 };

const T_ENTRADA = { duration: DUR.entrada, ease: CURVA_SALIDA };

export const CATALOGO = {
  'fade-in': {
    oculto: { opacity: 0 },
    visible: { opacity: 1, transition: { duration: 0.5, ease: CURVA_SALIDA } },
  },
  'slide-up': {
    oculto: { opacity: 0, y: 24 },
    visible: { opacity: 1, y: 0, transition: T_ENTRADA },
  },
  'slide-left': {
    // entra desde la derecha hacia la izquierda
    oculto: { opacity: 0, x: 32 },
    visible: { opacity: 1, x: 0, transition: T_ENTRADA },
  },
  'slide-right': {
    oculto: { opacity: 0, x: -32 },
    visible: { opacity: 1, x: 0, transition: T_ENTRADA },
  },
  'scroll-reveal': {
    oculto: { opacity: 0, y: 32 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.7, ease: CURVA_SALIDA } },
  },
  stagger: {
    oculto: {},
    visible: { transition: { staggerChildren: 0.07, delayChildren: 0.05 } },
  },
};

/** Hijo de un contenedor `stagger`. */
export const HIJO_STAGGER = {
  oculto: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: CURVA_SALIDA } },
};

/** Gestos. No son variantes de entrada, se aplican con whileHover/whileTap. */
export const GESTOS = {
  'hover-lift': {
    whileHover: { y: -4, transition: RESORTE_SUAVE },
    whileTap: { y: -1, scale: 0.985, transition: { duration: DUR.rapida } },
  },
  'hover-glow': {
    whileHover: {
      boxShadow: '0 10px 30px var(--marca-sombra)',
      transition: { duration: DUR.media, ease: CURVA_ESTANDAR },
    },
    whileTap: { scale: 0.985, transition: { duration: DUR.rapida } },
  },
};

/**
 * Devuelve las variantes de una animación del catálogo, o null si hay que
 * renderizar estático (reduced-motion, o animación vacía / desconocida).
 */
export function variantes(animacion, reducir) {
  if (reducir) return null;
  return CATALOGO[animacion] || null;
}

/** Props de gesto seguras, ya filtradas por reduced-motion. */
export function gestos(animacion, reducir) {
  if (reducir) return {};
  return GESTOS[animacion] || {};
}

/**
 * Rangos de parallax y zoom-on-scroll. Ambos son SOLO desktop:
 * en mobile el scroll ya es la interacción principal y competir con ella
 * produce jank en gama media, que es el grueso del parque de un colegio.
 */
export const PARALLAX_RANGO = ['-8%', '8%'];
export const ZOOM_RANGO = [1.12, 1];
export const BREAKPOINT_PARALLAX = 1024;
