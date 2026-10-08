import { memo, useRef, useState } from 'react';
import { CONFIGS_ESTADO } from '../../constants/asistencia';

/**
 * Progreso del pase de lista: un segmento por alumno, coloreado según su
 * estado. Funciona como slider: tocar o arrastrar el dedo sobre la barra
 * muestra el nombre bajo el dedo y al soltar lleva a esa tarjeta. Así sirve
 * igual con 10 que con 45 alumnos, aunque cada segmento mida pocos px.
 * Con teclado: flechas, Inicio/Fin y RePág/AvPág (de a 5).
 */
const BarraProgresoLista = memo(function BarraProgresoLista({ registros, indice, onIr }) {
  const pistaRef = useRef(null);
  const [arrastre, setArrastre] = useState(null);   // índice bajo el dedo mientras se arrastra

  const total = registros.length;
  const marcados = registros.reduce((n, r) => n + (r.estado ? 1 : 0), 0);
  const actual = registros[indice];

  const indiceEn = (clientX) => {
    const rect = pistaRef.current.getBoundingClientRect();
    const x = Math.min(Math.max(clientX - rect.left, 0), rect.width - 0.01);
    return Math.min(Math.max(Math.floor((x / (rect.width || 1)) * total), 0), total - 1);
  };

  const onPointerDown = (e) => {
    if (!e.isPrimary || (e.pointerType === 'mouse' && e.button !== 0)) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setArrastre(indiceEn(e.clientX));
  };
  const onPointerMove = (e) => {
    if (arrastre === null) return;
    const idx = indiceEn(e.clientX);
    if (idx !== arrastre) setArrastre(idx);
  };
  const onPointerUp = (e) => {
    if (arrastre === null) return;
    const idx = indiceEn(e.clientX);
    setArrastre(null);
    onIr(idx);
  };

  const onKeyDown = (e) => {
    const destinos = {
      ArrowRight: indice + 1, ArrowUp: indice + 1,
      ArrowLeft: indice - 1, ArrowDown: indice - 1,
      PageUp: indice + 5, PageDown: indice - 5,
      Home: 0, End: total - 1,
    };
    if (!(e.key in destinos)) return;
    e.preventDefault();
    onIr(Math.min(Math.max(destinos[e.key], 0), total - 1));
  };

  const resaltado = arrastre ?? indice;
  const alumnoArrastre = arrastre !== null ? registros[arrastre] : null;
  const pct = arrastre !== null ? ((arrastre + 0.5) / total) * 100 : 0;

  return (
    <div className="min-w-0">
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <p className="text-sm font-semibold tabular-nums" style={{ color: 'var(--jet)' }}>
          {indice + 1} <span className="font-normal" style={{ color: 'var(--ash)' }}>de {total}</span>
        </p>
        <p className="text-xs tabular-nums" style={{ color: 'var(--ash)' }}>
          {marcados} marcado{marcados === 1 ? '' : 's'}
        </p>
      </div>

      <div
        ref={pistaRef}
        role="slider"
        tabIndex={0}
        aria-label="Ir a un alumno"
        aria-valuemin={1}
        aria-valuemax={total}
        aria-valuenow={indice + 1}
        aria-valuetext={`Alumno ${indice + 1} de ${total}: ${actual?.alumno_nombre || 'sin nombre'}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => setArrastre(null)}
        onKeyDown={onKeyDown}
        className="relative -my-2 cursor-pointer touch-none select-none rounded-lg py-2.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pb)]/40"
      >
        <div className={`flex ${total > 40 ? 'gap-px' : 'gap-[3px]'}`} aria-hidden="true">
          {registros.map((r, i) => {
            const cfg = r.estado ? CONFIGS_ESTADO[r.estado] : null;
            const color = cfg ? cfg.activeStyle.color : i === indice ? 'var(--pb)' : 'var(--border-md)';
            return (
              <span
                key={r.alumno_id}
                className="block h-1.5 min-w-0 flex-1 rounded-full transition-[background-color,transform] duration-300 ease-out"
                style={{ background: color, transform: i === resaltado ? 'scaleY(1.9)' : undefined }}
              />
            );
          })}
        </div>

        {/* Globo con el alumno bajo el dedo. left y translateX usan el mismo %:
            en los extremos el globo queda alineado al borde y no se sale. */}
        {alumnoArrastre && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute bottom-full z-30 mb-1 max-w-[80%] truncate rounded-lg px-2.5 py-1.5 text-xs font-semibold text-white shadow-lg"
            style={{ left: `${pct}%`, transform: `translateX(-${pct}%)`, background: 'var(--jet)' }}
          >
            {alumnoArrastre.numero_lista ?? arrastre + 1}. {alumnoArrastre.alumno_nombre}
            {alumnoArrastre.estado && <span className="font-normal opacity-80"> · {CONFIGS_ESTADO[alumnoArrastre.estado].label}</span>}
          </div>
        )}
      </div>
    </div>
  );
});

export default BarraProgresoLista;
