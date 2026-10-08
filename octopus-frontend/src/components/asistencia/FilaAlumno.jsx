import { memo, useCallback, useRef } from 'react';
import { ESTADO, CONFIGS_ESTADO, TECLA_A_ESTADO } from '../../constants/asistencia';

// El estado idle usa clases (no `style` inline) a propósito: así :hover y
// :focus-visible pueden sobrescribir color/fondo — un `style` inline siempre
// gana sobre cualquier variante de Tailwind, dejando el hover sin efecto.
const IDLE_CLASSES     = 'border-[0.5px] border-[var(--border-md)] bg-[var(--porcelain)] text-[var(--ash)] hover:bg-[var(--ash-light)] hover:text-[var(--jet)] hover:border-[var(--ash)]';
const FILA_STYLE       = { border: '0.5px solid var(--border-md)', background: 'var(--porcelain)' };
const OBSERV_STYLE     = { border: '0.5px solid var(--border-md)', background: 'var(--ash-light)', color: 'var(--jet)' };
const ESTADOS_BOTONES  = [ESTADO.PRESENTE, ESTADO.AUSENTE, ESTADO.JUSTIFICADO, ESTADO.RETARDADO];

const FilaAlumno = memo(({ registro, onMarcar, onObservacion }) => {
  const { alumno_id, alumno_nombre, estado, observacion } = registro;
  const filaRef = useRef(null);

  const handleKeyDown = useCallback((e) => {
    const nuevoEstado = TECLA_A_ESTADO[e.key.toLowerCase()];
    if (!nuevoEstado || e.target !== e.currentTarget) return;
    e.preventDefault();
    onMarcar(alumno_id, nuevoEstado);
    filaRef.current?.nextElementSibling?.focus();
  }, [alumno_id, onMarcar]);

  return (
    <div
      ref={filaRef}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      className="rounded-xl overflow-hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pb)]/40 focus-visible:ring-offset-1"
      style={FILA_STYLE}
    >
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 px-4 py-3">
        <div className="flex items-center gap-3">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold uppercase flex-shrink-0"
            style={{ background: 'var(--pb-light)', color: 'var(--pb)' }}
          >
            {(alumno_nombre || '?').charAt(0)}
          </div>
          <p className="text-sm font-medium" style={{ color: 'var(--jet)' }}>{alumno_nombre}</p>
        </div>

        <div className="flex gap-2 flex-wrap">
          {ESTADOS_BOTONES.map((e) => {
            const cfg      = CONFIGS_ESTADO[e];
            const isActive = estado === e;
            return (
              <button
                key={e}
                aria-label={cfg.label}
                aria-pressed={isActive}
                onClick={() => onMarcar(alumno_id, isActive ? ESTADO.SIN_MARCAR : e)}
                className={`flex items-center justify-center gap-1.5 px-3 min-h-[44px] sm:min-h-0 sm:py-1.5 rounded-lg text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pb)]/40 focus-visible:ring-offset-1 ${!isActive ? IDLE_CLASSES : ''}`}
                style={isActive ? cfg.activeStyle : undefined}
              >
                <cfg.Icon size={14} />
                <span className="hidden sm:inline">{cfg.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {(estado === ESTADO.AUSENTE || estado === ESTADO.JUSTIFICADO) && (
        <div className="px-4 pb-3">
          <input
            type="text"
            placeholder="Observación (opcional)..."
            aria-label={`Observación para ${alumno_nombre || 'alumno'}`}
            className="w-full px-3 py-2 min-h-[44px] sm:min-h-0 sm:py-1.5 rounded-lg text-xs outline-none focus-visible:ring-2 focus-visible:ring-[var(--pb)]/40"
            style={OBSERV_STYLE}
            value={observacion || ''}
            onChange={e => onObservacion(alumno_id, e.target.value)}
          />
        </div>
      )}
    </div>
  );
});

FilaAlumno.displayName = 'FilaAlumno';

export default FilaAlumno;
