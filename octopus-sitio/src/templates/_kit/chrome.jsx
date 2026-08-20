import { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Menu, X, Phone, Mail, MapPin } from 'lucide-react';
import { Boton } from './primitivos';

/* ==================================================================
   Chrome del sitio público: navegación y pie.
   No son bloques del contrato; son el marco fijo de toda plantilla.
   Se alimentan de Menu/ItemMenu y ConfiguracionSitio.
   ================================================================== */

/**
 * Nav de una sola línea, alto 68px (mobile) / 76px (desktop).
 * `tono='sobre-foto'` la vuelve transparente sobre un hero inmersivo y
 * se solidifica al hacer scroll para no perder legibilidad.
 */
export function NavPublica({ colegio, items = [], cta, tono = 'solido' }) {
  const [abierto, setAbierto] = useState(false);
  const [desplazado, setDesplazado] = useState(false);
  const reducir = useReducedMotion();

  useEffect(() => {
    // Centinela con IntersectionObserver en lugar de escuchar scroll.
    const centinela = document.createElement('div');
    centinela.style.cssText = 'position:absolute;top:0;height:80px;width:1px;pointer-events:none';
    document.body.appendChild(centinela);
    const io = new IntersectionObserver(([e]) => setDesplazado(!e.isIntersecting), { threshold: 0 });
    io.observe(centinela);
    return () => {
      io.disconnect();
      centinela.remove();
    };
  }, []);

  useEffect(() => {
    document.body.style.overflow = abierto ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [abierto]);

  const transparente = tono === 'sobre-foto' && !desplazado && !abierto;

  return (
    <>
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 'var(--z-nav)',
          background: transparente ? 'transparent' : 'color-mix(in oklab, var(--papel) 88%, transparent)',
          backdropFilter: transparente ? 'none' : 'blur(14px) saturate(150%)',
          WebkitBackdropFilter: transparente ? 'none' : 'blur(14px) saturate(150%)',
          borderBottom: transparente ? '1px solid transparent' : '1px solid var(--linea)',
          color: transparente ? '#fbfaf8' : 'var(--tinta)',
          transition: 'background-color var(--dur-media) var(--curva-estandar), border-color var(--dur-media) var(--curva-estandar), color var(--dur-media) var(--curva-estandar)',
        }}
      >
        <div
          className="mx-auto flex items-center justify-between gap-6"
          style={{
            maxWidth: 'var(--ancho-contenido)',
            paddingInline: 'var(--canal)',
            height: 'clamp(68px, 7vw, 76px)',
          }}
        >
          <a
            href="/"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.7rem',
              textDecoration: 'none',
              color: 'inherit',
              fontFamily: 'var(--fuente-display)',
              fontWeight: 600,
              fontSize: 'var(--paso-0)',
              letterSpacing: '-0.015em',
              whiteSpace: 'nowrap',
            }}
          >
            <span
              aria-hidden="true"
              style={{
                width: 30,
                height: 30,
                borderRadius: '999px',
                display: 'grid',
                placeItems: 'center',
                background: transparente ? 'rgb(255 255 255 / 0.18)' : 'var(--marca-primario)',
                color: transparente ? '#fbfaf8' : 'var(--marca-primario-texto)',
                fontSize: 13,
                fontWeight: 700,
                border: transparente ? '1px solid rgb(255 255 255 / 0.4)' : 'none',
              }}
            >
              {colegio.sigla}
            </span>
            {colegio.nombre}
          </a>

          <nav className="hidden items-center gap-7 lg:flex">
            {items.map((it) => (
              <a
                key={it.etiqueta}
                href={it.url}
                style={{
                  fontSize: 'var(--paso--1)',
                  fontWeight: 500,
                  color: 'inherit',
                  opacity: 0.82,
                  textDecoration: 'none',
                  whiteSpace: 'nowrap',
                }}
              >
                {it.etiqueta}
              </a>
            ))}
          </nav>

          <div className="hidden lg:block">
            <Boton
              href={cta.url}
              variante={transparente ? 'velo' : 'solido'}
              style={{ padding: '0.7rem 1.25rem' }}
            >
              {cta.etiqueta}
            </Boton>
          </div>

          <button
            type="button"
            className="lg:hidden"
            aria-label={abierto ? 'Cerrar menú' : 'Abrir menú'}
            aria-expanded={abierto}
            onClick={() => setAbierto((v) => !v)}
            style={{ background: 'none', border: 0, color: 'inherit', cursor: 'pointer', padding: 8, margin: -8 }}
          >
            {abierto ? <X size={22} strokeWidth={1.8} /> : <Menu size={22} strokeWidth={1.8} />}
          </button>
        </div>
      </header>

      {abierto && (
        <motion.div
          className="fixed inset-0 lg:hidden"
          style={{ zIndex: 'var(--z-overlay)', background: 'var(--papel)', paddingTop: 76 }}
          initial={reducir ? false : { opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
        >
          <nav className="flex flex-col" style={{ paddingInline: 'var(--canal)' }}>
            {items.map((it) => (
              <a
                key={it.etiqueta}
                href={it.url}
                onClick={() => setAbierto(false)}
                style={{
                  padding: '1.15rem 0',
                  borderBottom: '1px solid var(--linea)',
                  fontFamily: 'var(--fuente-display)',
                  fontSize: 'var(--paso-3)',
                  fontWeight: 500,
                  letterSpacing: '-0.02em',
                  color: 'var(--tinta)',
                  textDecoration: 'none',
                }}
              >
                {it.etiqueta}
              </a>
            ))}
            <div className="mt-8">
              <Boton href={cta.url} style={{ width: '100%' }}>
                {cta.etiqueta}
              </Boton>
            </div>
          </nav>
        </motion.div>
      )}
    </>
  );
}

export function FooterPublico({ colegio, columnas = [] }) {
  return (
    <footer style={{ background: 'var(--papel-2)', borderTop: '1px solid var(--linea)' }}>
      <div
        className="mx-auto grid gap-10 py-16 sm:grid-cols-2 lg:grid-cols-[1.5fr_1fr_1fr]"
        style={{ maxWidth: 'var(--ancho-contenido)', paddingInline: 'var(--canal)' }}
      >
        <div>
          <p
            style={{
              fontFamily: 'var(--fuente-display)',
              fontSize: 'var(--paso-2)',
              fontWeight: 600,
              letterSpacing: '-0.02em',
              margin: 0,
            }}
          >
            {colegio.nombre}
          </p>
          <p style={{ marginTop: '0.75rem', color: 'var(--tinta-500)', maxWidth: '32ch', fontSize: 'var(--paso--1)' }}>
            {colegio.lema}
          </p>
          <ul style={{ listStyle: 'none', padding: 0, margin: '1.75rem 0 0', display: 'grid', gap: '0.7rem' }}>
            {[
              { Icono: MapPin, texto: colegio.direccion },
              { Icono: Phone, texto: colegio.telefono },
              { Icono: Mail, texto: colegio.email },
            ].map(({ Icono, texto }) => (
              <li
                key={texto}
                style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', fontSize: 'var(--paso--1)', color: 'var(--tinta-700)' }}
              >
                <Icono size={15} strokeWidth={1.6} style={{ color: 'var(--marca-primario)', flexShrink: 0 }} />
                {texto}
              </li>
            ))}
          </ul>
        </div>

        {columnas.map((col) => (
          <div key={col.titulo}>
            <p
              style={{
                fontSize: 'var(--paso--2)',
                textTransform: 'uppercase',
                letterSpacing: '0.12em',
                fontWeight: 600,
                color: 'var(--tinta-400)',
                margin: 0,
              }}
            >
              {col.titulo}
            </p>
            <ul style={{ listStyle: 'none', padding: 0, margin: '1rem 0 0', display: 'grid', gap: '0.65rem' }}>
              {col.items.map((it) => (
                <li key={it}>
                  <a href="#" style={{ fontSize: 'var(--paso--1)', color: 'var(--tinta-700)', textDecoration: 'none' }}>
                    {it}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div style={{ borderTop: '1px solid var(--linea)' }}>
        <div
          className="mx-auto py-6"
          style={{ maxWidth: 'var(--ancho-contenido)', paddingInline: 'var(--canal)' }}
        >
          <p style={{ margin: 0, fontSize: 'var(--paso--2)', color: 'var(--tinta-400)' }}>
            {`${colegio.nombre}. ${new Date().getFullYear()}. Todos los derechos reservados.`}
          </p>
        </div>
      </div>
    </footer>
  );
}
