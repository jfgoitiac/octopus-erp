import { Suspense, useEffect, useState } from 'react';
import { PLANTILLAS, plantillaPorId } from './index';
import { PALETAS_DEMO, aplicarTemaColegio } from './_kit/tema';

/**
 * Visor de la galería de plantillas. Herramienta interna de diseño, no una
 * página del sitio público: sirve para revisar cada plantilla y, sobre todo,
 * para verificar la premisa del sistema, que es que la misma plantilla
 * aguanta cualquier color de marca que cargue el colegio en
 * ConfiguracionSitio. Por eso el selector de paletas está siempre visible.
 *
 * Montado en /plantillas (ver App.jsx).
 */
export default function GaleriaPlantillas() {
  const [activa, setActiva] = useState(null);
  const [paleta, setPaleta] = useState(0);

  useEffect(() => {
    aplicarTemaColegio(PALETAS_DEMO[paleta]);
  }, [paleta]);

  const plantilla = activa ? plantillaPorId(activa) : null;
  const Componente = plantilla?.componente;

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--papel)' }}>
      <div
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 90,
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: '0.75rem',
          padding: '0.75rem 1.25rem',
          background: 'var(--tinta)',
          color: 'var(--papel)',
          fontSize: 'var(--paso--1)',
        }}
      >
        <select
          value={activa || ''}
          onChange={(e) => setActiva(e.target.value || null)}
          aria-label="Plantilla"
          style={campo}
        >
          <option value="">Índice de plantillas</option>
          {PLANTILLAS.filter((p) => p.implementada).map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre}
            </option>
          ))}
        </select>

        <select value={paleta} onChange={(e) => setPaleta(Number(e.target.value))} aria-label="Paleta del colegio" style={campo}>
          {PALETAS_DEMO.map((p, i) => (
            <option key={p.nombre} value={i}>
              {`Marca: ${p.nombre}`}
            </option>
          ))}
        </select>

        <span style={{ opacity: 0.6 }}>
          {plantilla
            ? `variance ${plantilla.dials.variance} · motion ${plantilla.dials.motion} · density ${plantilla.dials.density}`
            : `${PLANTILLAS.length} plantillas`}
        </span>
      </div>

      {plantilla && Componente ? (
        <Suspense fallback={<Cargando />}>
          <Componente />
        </Suspense>
      ) : (
        <Indice onAbrir={setActiva} />
      )}
    </div>
  );
}

const campo = {
  background: 'transparent',
  color: 'inherit',
  border: '1px solid rgb(255 255 255 / 0.28)',
  borderRadius: 'var(--radio-campo)',
  padding: '0.4rem 0.7rem',
  font: 'inherit',
};

function Cargando() {
  return (
    <div style={{ display: 'grid', gap: '1rem', padding: '4rem 1.25rem', maxWidth: 'var(--ancho-contenido)', margin: '0 auto' }}>
      {[70, 45, 100].map((w, i) => (
        <div
          key={i}
          style={{ height: 28, width: `${w}%`, background: 'var(--papel-3)', borderRadius: 'var(--radio-campo)' }}
        />
      ))}
    </div>
  );
}

function Indice({ onAbrir }) {
  return (
    <div style={{ maxWidth: 'var(--ancho-contenido)', margin: '0 auto', padding: '4rem var(--canal)' }}>
      <h1
        style={{
          fontFamily: 'var(--fuente-display)',
          fontSize: 'clamp(2rem, 5vw, 3rem)',
          letterSpacing: '-0.025em',
          lineHeight: 1.1,
          fontWeight: 600,
          margin: 0,
          maxWidth: '18ch',
        }}
      >
        Galería de plantillas del sitio institucional
      </h1>
      <p style={{ marginTop: '1rem', color: 'var(--tinta-500)', maxWidth: '58ch' }}>
        Cada plantilla es una combinación de bloques del contrato, sus variantes visuales y su catálogo de animación.
        La justificación de diseño de cada una está en DESIGN_SYSTEM.md.
      </p>

      <ul style={{ listStyle: 'none', padding: 0, margin: '3rem 0 0' }}>
        {PLANTILLAS.map((p) => (
          <li key={p.id} style={{ borderTop: '1px solid var(--linea)' }}>
            <button
              type="button"
              disabled={!p.implementada}
              onClick={() => onAbrir(p.id)}
              style={{
                width: '100%',
                textAlign: 'left',
                background: 'none',
                border: 0,
                padding: '1.5rem 0',
                cursor: p.implementada ? 'pointer' : 'default',
                color: 'inherit',
                font: 'inherit',
                display: 'grid',
                gap: '0.4rem',
                opacity: p.implementada ? 1 : 0.55,
              }}
            >
              <span style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '0.75rem' }}>
                <span
                  style={{
                    fontFamily: 'var(--fuente-display)',
                    fontSize: 'var(--paso-2)',
                    fontWeight: 600,
                    letterSpacing: '-0.02em',
                  }}
                >
                  {p.nombre}
                </span>
                <span style={{ fontSize: 'var(--paso--2)', color: 'var(--tinta-400)' }}>
                  {p.implementada ? 'construida' : 'especificada'}
                </span>
              </span>
              <span style={{ color: 'var(--tinta-500)', fontSize: 'var(--paso--1)', maxWidth: '62ch' }}>{p.resumen}</span>
              <span style={{ fontSize: 'var(--paso--2)', color: 'var(--tinta-400)' }}>
                {p.bloques.map((b) => b.tipo).join(' / ')}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
