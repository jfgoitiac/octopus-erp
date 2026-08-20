import { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion, useScroll, useTransform } from 'framer-motion';
import {
  BREAKPOINT_PARALLAX,
  HIJO_STAGGER,
  PARALLAX_RANGO,
  VIEWPORT,
  VIEWPORT_ALTO,
  ZOOM_RANGO,
  gestos,
  variantes,
} from './animaciones';

/* ------------------------------------------------------------------
   Primitivos compartidos por todas las plantillas.
   Traducen `config_estilo` y `animacion` del contrato a marcado real.
   ------------------------------------------------------------------ */

export function useEsDesktop() {
  const [esDesktop, setEsDesktop] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(`(min-width: ${BREAKPOINT_PARALLAX}px)`);
    const sync = () => setEsDesktop(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);
  return esDesktop;
}

const FONDOS = {
  blanco: 'var(--papel)',
  gris: 'var(--papel-2)',
  primario: 'var(--marca-primario)',
  transparente: 'transparent',
};

const RITMO = { sm: 'var(--ritmo-sm)', md: 'var(--ritmo-md)', lg: 'var(--ritmo-lg)' };

/**
 * Contenedor de bloque. Mapea config_estilo:
 * { ancho, espaciado_top, espaciado_bottom, fondo }
 */
export function Seccion({
  ancho = 'contenido',
  espaciadoTop = 'md',
  espaciadoBottom = 'md',
  fondo = 'blanco',
  className = '',
  children,
  ...rest
}) {
  const sobreMarca = fondo === 'primario';
  return (
    <section
      {...rest}
      style={{
        background: FONDOS[fondo] ?? FONDOS.blanco,
        color: sobreMarca ? 'var(--marca-primario-texto)' : 'var(--tinta)',
        paddingTop: RITMO[espaciadoTop] ?? RITMO.md,
        paddingBottom: RITMO[espaciadoBottom] ?? RITMO.md,
        ...(rest.style || {}),
      }}
      className={className}
    >
      <div
        className="mx-auto w-full"
        style={{
          maxWidth: ancho === 'completo' ? '100%' : 'var(--ancho-contenido)',
          paddingInline: ancho === 'completo' ? 0 : 'var(--canal)',
        }}
      >
        {children}
      </div>
    </section>
  );
}

/**
 * Envuelve cualquier contenido con una animación del catálogo.
 * Si `animacion` es vacía o el usuario pide menos movimiento, renderiza
 * un div plano: sin motion values, sin coste.
 */
export function Revelar({ animacion = 'scroll-reveal', alto = false, as = 'div', className = '', style, children }) {
  const reducir = useReducedMotion();
  const v = variantes(animacion, reducir);
  const Comp = motion[as] || motion.div;

  if (!v) {
    const Plano = as;
    return (
      <Plano className={className} style={style}>
        {children}
      </Plano>
    );
  }

  return (
    <Comp
      className={className}
      style={style}
      variants={v}
      initial="oculto"
      whileInView="visible"
      viewport={alto ? VIEWPORT_ALTO : VIEWPORT}
    >
      {children}
    </Comp>
  );
}

/** Hijo directo de un `Revelar animacion="stagger"`. */
export function ItemStagger({ as = 'div', className = '', style, children, ...rest }) {
  const reducir = useReducedMotion();
  if (reducir) {
    const Plano = as;
    return (
      <Plano className={className} style={style}>
        {children}
      </Plano>
    );
  }
  const Comp = motion[as] || motion.div;
  return (
    <Comp className={className} style={style} variants={HIJO_STAGGER} {...rest}>
      {children}
    </Comp>
  );
}

/** Superficie con gesto hover-lift o hover-glow del catálogo. */
export function Tarjeta({ gesto = 'hover-lift', as = 'div', className = '', style, children, ...rest }) {
  const reducir = useReducedMotion();
  const Comp = motion[as] || motion.div;
  return (
    <Comp
      className={className}
      style={{ borderRadius: 'var(--radio-superficie)', ...style }}
      {...gestos(gesto, reducir)}
      {...rest}
    >
      {children}
    </Comp>
  );
}

/**
 * Imagen de fondo con parallax. Solo desktop y solo si no hay reduced-motion;
 * en cualquier otro caso es un <img> quieto con object-fit.
 */
export function FondoParallax({ src, alt = '', overlay = 'oscuro', prioridad = false }) {
  const ref = useRef(null);
  const reducir = useReducedMotion();
  const esDesktop = useEsDesktop();
  const activo = esDesktop && !reducir;

  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] });
  const y = useTransform(scrollYProgress, [0, 1], PARALLAX_RANGO);

  const velos = {
    oscuro:
      'linear-gradient(to top, color-mix(in oklab, var(--marca-profundo) 88%, transparent) 0%, color-mix(in oklab, var(--marca-profundo) 42%, transparent) 55%, color-mix(in oklab, var(--marca-profundo) 18%, transparent) 100%)',
    claro:
      'linear-gradient(to top, rgb(251 250 248 / 0.94) 0%, rgb(251 250 248 / 0.62) 55%, rgb(251 250 248 / 0.3) 100%)',
    ninguno: 'none',
  };

  return (
    <div ref={ref} className="absolute inset-0 overflow-hidden" style={{ background: 'var(--papel-3)' }}>
      {src && (
        <motion.img
          src={src}
          alt={alt}
          loading={prioridad ? 'eager' : 'lazy'}
          fetchPriority={prioridad ? 'high' : 'auto'}
          style={activo ? { y, scale: 1.16 } : { scale: 1 }}
          className="h-full w-full object-cover"
        />
      )}
      {overlay !== 'ninguno' && (
        <div className="absolute inset-0" style={{ background: velos[overlay] }} aria-hidden="true" />
      )}
    </div>
  );
}

/** Imagen que arranca ampliada y se asienta a escala 1 al entrar. */
export function ImagenZoom({ src, alt = '', className = '', ratio = '4 / 3' }) {
  const ref = useRef(null);
  const reducir = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'center center'] });
  const scale = useTransform(scrollYProgress, [0, 1], ZOOM_RANGO);

  return (
    <div
      ref={ref}
      className={`overflow-hidden ${className}`}
      style={{ borderRadius: 'var(--radio-superficie)', aspectRatio: ratio, background: 'var(--papel-3)' }}
    >
      {src && (
        <motion.img
          src={src}
          alt={alt}
          loading="lazy"
          style={reducir ? undefined : { scale }}
          className="h-full w-full object-cover"
        />
      )}
    </div>
  );
}

/* ---------------------------- Tipografía ---------------------------- */

export function Titular({ nivel = 2, escala, className = '', style, children }) {
  const H = `h${nivel}`;
  const porDefecto = { 1: 'var(--paso-6)', 2: 'var(--paso-5)', 3: 'var(--paso-3)' };
  return (
    <H
      className={className}
      style={{
        fontFamily: 'var(--fuente-display)',
        fontSize: `clamp(var(--paso-4), 4.2vw, ${escala || porDefecto[nivel] || 'var(--paso-4)'})`,
        lineHeight: 1.08,
        letterSpacing: '-0.022em',
        fontWeight: 600,
        margin: 0,
        textWrap: 'balance',
        ...style,
      }}
    >
      {children}
    </H>
  );
}

export function Lead({ className = '', style, children }) {
  return (
    <p
      className={className}
      style={{
        fontSize: 'clamp(var(--paso-1), 1.6vw, var(--paso-2))',
        lineHeight: 1.5,
        color: 'var(--tinta-700)',
        maxWidth: '46ch',
        textWrap: 'pretty',
        margin: 0,
        ...style,
      }}
    >
      {children}
    </p>
  );
}

/**
 * Etiqueta superior de sección. Racionada a propósito: el sistema permite
 * como máximo 1 por cada 3 secciones de una página (ver DESIGN_SYSTEM.md).
 * La marca entra aquí como un filete corto, no como texto de color.
 */
export function Rotulo({ children, sobreMarca = false }) {
  return (
    <span
      className="inline-flex items-center gap-3"
      style={{
        fontSize: 'var(--paso--2)',
        letterSpacing: '0.14em',
        textTransform: 'uppercase',
        fontWeight: 600,
        color: sobreMarca ? 'inherit' : 'var(--tinta-500)',
      }}
    >
      <span
        aria-hidden="true"
        style={{
          display: 'block',
          width: '2rem',
          height: '2px',
          background: sobreMarca ? 'currentColor' : 'var(--marca-primario)',
        }}
      />
      {children}
    </span>
  );
}

/* ------------------------------ Botones ------------------------------ */

export function Boton({ variante = 'solido', href = '#', className = '', children, ...rest }) {
  const reducir = useReducedMotion();

  const base = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.5rem',
    whiteSpace: 'nowrap',
    borderRadius: 'var(--radio-interactivo)',
    padding: '0.875rem 1.6rem',
    fontSize: 'var(--paso--1)',
    fontWeight: 600,
    letterSpacing: '0.01em',
    textDecoration: 'none',
    border: '1px solid transparent',
    cursor: 'pointer',
    transition: `background-color var(--dur-media) var(--curva-estandar), color var(--dur-media) var(--curva-estandar), border-color var(--dur-media) var(--curva-estandar)`,
  };

  const estilos = {
    // Único relleno de marca de la página. El contraste del texto lo resuelve
    // aplicarTemaColegio() por luminancia, no una suposición.
    solido: {
      background: 'var(--marca-primario)',
      color: 'var(--marca-primario-texto)',
    },
    contorno: {
      background: 'transparent',
      color: 'var(--tinta)',
      borderColor: 'var(--linea-fuerte)',
    },
    // Sobre foto: nunca texto suelto sin fondo. Vidrio con borde propio.
    velo: {
      background: 'rgb(255 255 255 / 0.14)',
      color: '#fbfaf8',
      borderColor: 'rgb(255 255 255 / 0.38)',
      backdropFilter: 'blur(10px) saturate(140%)',
      WebkitBackdropFilter: 'blur(10px) saturate(140%)',
    },
    texto: {
      background: 'transparent',
      color: 'var(--tinta)',
      padding: '0.5rem 0',
      borderBottom: '1px solid var(--marca-primario)',
      borderRadius: 0,
    },
  };

  return (
    <motion.a
      href={href}
      className={className}
      style={{ ...base, ...(estilos[variante] || estilos.solido) }}
      whileHover={reducir ? undefined : { y: -2, transition: { type: 'spring', stiffness: 340, damping: 24 } }}
      whileTap={reducir ? undefined : { y: 0, scale: 0.98 }}
      {...rest}
    >
      {children}
    </motion.a>
  );
}

/** Filete de separación. Sustituye a la tarjeta cuando no hay jerarquía real. */
export function Filete({ style }) {
  return <hr style={{ border: 0, borderTop: '1px solid var(--linea)', margin: 0, ...style }} />;
}
