import { motion, useReducedMotion, useScroll, useSpring } from 'framer-motion';
import { BloqueCards, BloqueCta } from './_kit/bloques';
import { FooterPublico, NavPublica } from './_kit/chrome';
import { Lead, Revelar, Seccion, Titular } from './_kit/primitivos';
import {
  ARTICULO,
  ARTICULOS_RELACIONADOS,
  COLEGIO,
  COLUMNAS_FOOTER,
  CTA_BOLETIN,
  CTA_NAV,
  MENU_PRINCIPAL,
} from './datosDemo';

/**
 * PLANTILLA 07 · Artículo "Lectura"
 *
 * Dials: VARIANCE 4 · MOTION 3 · DENSITY 3
 *
 * Punto de vista
 * Un artículo de colegio compite con el teléfono en la mano de alguien que
 * está en una cola. Todo lo que no sea el texto estorba. Por eso esta es la
 * única plantilla de la galería que baja el dial de movimiento a 3, quita
 * la foto del encabezado hasta después del titular y usa el typeset
 * editorial (EB Garamond) en el cuerpo.
 *
 * La serif está justificada aquí y solo aquí: es lectura larga, con
 * párrafos reales, en un contexto de publicación. En el resto de la
 * galería el cuerpo es sans. Los titulares siguen siendo sans display,
 * porque son la voz del colegio y esa voz es la misma en todo el sitio.
 *
 * La única animación no trivial es la barra de progreso de lectura, y está
 * motivada: en un texto largo sin scrollbar visible en mobile, decirle a
 * quien lee cuánto falta reduce el abandono. No hay parallax, no hay zoom,
 * no hay stagger en el cuerpo.
 *
 * Composición de bloques
 *   (chrome)      barra de progreso de lectura      · scaleX ligada a scroll
 *   hero          variante editorial                · fade-in
 *   imagen destacada a ancho de contenido           · fade-in
 *   cuerpo (Tiptap sanitizado, ancho de lectura)    · sin animación
 *   cta           variante discreta                 · scroll-reveal
 *   cards         variante contenidas (3)           · stagger + hover-lift
 */
export default function ArticuloLectura() {
  const reducir = useReducedMotion();
  const { scrollYProgress } = useScroll();
  const progreso = useSpring(scrollYProgress, { stiffness: 120, damping: 30, restDelta: 0.001 });

  const fecha = new Date(ARTICULO.publicado_en).toLocaleDateString('es-VE', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return (
    <>
      <NavPublica colegio={COLEGIO} items={MENU_PRINCIPAL} cta={CTA_NAV} />

      {!reducir && (
        <motion.div
          aria-hidden="true"
          style={{
            position: 'fixed',
            top: 'clamp(68px, 7vw, 76px)',
            left: 0,
            right: 0,
            height: 2,
            transformOrigin: '0%',
            background: 'var(--marca-primario)',
            scaleX: progreso,
            zIndex: 'var(--z-nav)',
          }}
        />
      )}

      <main>
        <article>
          <Seccion espaciadoTop="md" espaciadoBottom="sm">
            <div style={{ maxWidth: '58rem' }}>
              <Revelar animacion="fade-in">
                <p
                  style={{
                    margin: 0,
                    fontSize: 'var(--paso--1)',
                    fontWeight: 600,
                    color: 'var(--marca-primario)',
                  }}
                >
                  {ARTICULO.categoria.nombre}
                </p>
                <Titular nivel={1} escala="var(--paso-6)" style={{ marginTop: '1rem', maxWidth: '20ch', fontWeight: 500 }}>
                  {ARTICULO.titulo}
                </Titular>
                <Lead style={{ marginTop: '1.5rem', maxWidth: '54ch' }}>{ARTICULO.resumen}</Lead>
                <p
                  style={{
                    marginTop: '2rem',
                    paddingTop: '1.25rem',
                    borderTop: '1px solid var(--linea)',
                    fontSize: 'var(--paso--1)',
                    color: 'var(--tinta-500)',
                  }}
                >
                  {`${ARTICULO.autor} · ${fecha} · ${ARTICULO.lectura_min} min de lectura`}
                </p>
              </Revelar>
            </div>
          </Seccion>

          <Seccion espaciadoTop="sm" espaciadoBottom="md">
            <Revelar animacion="fade-in">
              <figure style={{ margin: 0 }}>
                <div
                  className="overflow-hidden"
                  style={{ borderRadius: 'var(--radio-superficie)', aspectRatio: '16 / 9', background: 'var(--papel-3)' }}
                >
                  <img
                    src={ARTICULO.imagen_destacada.lg}
                    alt={ARTICULO.imagen_destacada.alt_text}
                    fetchPriority="high"
                    className="h-full w-full object-cover"
                  />
                </div>
              </figure>
            </Revelar>
          </Seccion>

          <Seccion espaciadoTop="sm" espaciadoBottom="lg">
            {/* Cuerpo Tiptap. En producción llega ya sanitizado por el backend. */}
            <div
              className="cuerpo-articulo"
              style={{ maxWidth: 'var(--ancho-lectura)' }}
              dangerouslySetInnerHTML={{ __html: ARTICULO.cuerpo }}
            />
          </Seccion>
        </article>

        <BloqueCta contenido={CTA_BOLETIN} variante="discreta" />

        <BloqueCards contenido={ARTICULOS_RELACIONADOS} variante="contenidas" fondo="gris" />
      </main>

      <FooterPublico colegio={COLEGIO} columnas={COLUMNAS_FOOTER} />

      <style>{`
        .cuerpo-articulo {
          font-family: var(--fuente-editorial);
          font-size: clamp(1.125rem, 1.6vw, 1.25rem);
          line-height: 1.72;
          color: var(--tinta-700);
        }
        .cuerpo-articulo > * + * { margin-top: 1.4em; }
        .cuerpo-articulo .lead {
          font-size: clamp(1.25rem, 2vw, 1.5rem);
          line-height: 1.55;
          color: var(--tinta);
        }
        .cuerpo-articulo h2 {
          font-family: var(--fuente-display);
          font-size: clamp(1.5rem, 2.6vw, 1.875rem);
          line-height: 1.2;
          letter-spacing: -0.02em;
          font-weight: 600;
          color: var(--tinta);
          margin-top: 2.6em;
          margin-bottom: -0.4em;
        }
        .cuerpo-articulo blockquote {
          margin: 2.4em 0;
          padding-left: 1.5rem;
          border-left: 3px solid var(--marca-primario);
          font-size: clamp(1.25rem, 2.2vw, 1.5rem);
          line-height: 1.45;
          color: var(--tinta);
          font-style: normal;
        }
        .cuerpo-articulo a {
          color: var(--tinta);
          text-decoration-color: var(--marca-primario);
          text-underline-offset: 3px;
        }
        .cuerpo-articulo img {
          border-radius: var(--radio-superficie);
          margin-block: 2.4em;
        }
      `}</style>
    </>
  );
}
