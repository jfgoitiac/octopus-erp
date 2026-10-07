import { memo } from 'react';
import { CONFIGS_ESTADO } from '../../constants/asistencia';

/**
 * Progreso del pase de lista: un segmento por alumno, coloreado según su
 * estado. Cada segmento es un botón que lleva a esa tarjeta (el área táctil
 * es más alta que la barra visible).
 */
const BarraProgresoLista = memo(function BarraProgresoLista({ registros, indice, onIr }) {
  const total = registros.length;
  const marcados = registros.reduce((n, r) => n + (r.estado ? 1 : 0), 0);

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

      <div className={`flex ${total > 40 ? 'gap-px' : 'gap-[3px]'}`} role="group" aria-label="Ir a un alumno">
        {registros.map((r, i) => {
          const cfg = r.estado ? CONFIGS_ESTADO[r.estado] : null;
          const actual = i === indice;
          const color = cfg ? cfg.activeStyle.color : actual ? 'var(--pb)' : 'var(--border-md)';
          return (
            <button
              key={r.alumno_id}
              type="button"
              onClick={() => onIr(i)}
              aria-current={actual ? 'step' : undefined}
              aria-label={`Alumno ${i + 1}: ${r.alumno_nombre || 'sin nombre'}${cfg ? `, ${cfg.label}` : ', sin marcar'}`}
              className="group -my-2 min-w-0 flex-1 py-2 focus:outline-none"
            >
              <span
                className="block h-1.5 rounded-full transition-[background-color,transform] duration-300 ease-out group-hover:scale-y-150 group-focus-visible:ring-2 group-focus-visible:ring-[var(--pb)]/50"
                style={{ background: color, transform: actual ? 'scaleY(1.65)' : undefined }}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
});

export default BarraProgresoLista;
