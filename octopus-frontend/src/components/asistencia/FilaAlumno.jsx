import { memo } from 'react';
import { CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import { ESTADO } from '../../constants/asistencia';

const CONFIGS_ESTADO = {
  [ESTADO.PRESENTE]: {
    label:       'Presente',
    icon:        <CheckCircle size={14} />,
    activeStyle: { background: '#dcfce7', color: '#16a34a', border: '1.5px solid #16a34a' },
  },
  [ESTADO.AUSENTE]: {
    label:       'Ausente',
    icon:        <XCircle size={14} />,
    activeStyle: { background: 'var(--red-light)', color: 'var(--red)', border: '1.5px solid var(--red)' },
  },
  [ESTADO.JUSTIFICADO]: {
    label:       'Justificado',
    icon:        <AlertCircle size={14} />,
    activeStyle: { background: '#fef9c3', color: '#854d0e', border: '1.5px solid #ca8a04' },
  },
};

const IDLE_STYLE       = { border: '0.5px solid var(--border-md)', color: 'var(--ash)', background: 'var(--porcelain)' };
const FILA_STYLE       = { border: '0.5px solid var(--border-md)', background: 'var(--porcelain)' };
const OBSERV_STYLE     = { border: '0.5px solid var(--border-md)', background: 'var(--ash-light)', color: 'var(--jet)' };
const ESTADOS_BOTONES  = [ESTADO.PRESENTE, ESTADO.AUSENTE, ESTADO.JUSTIFICADO];

const FilaAlumno = memo(({ registro, onMarcar, onObservacion }) => {
  const { alumno_id, alumno_nombre, estado, observacion } = registro;

  return (
    <div className="rounded-xl overflow-hidden" style={FILA_STYLE}>
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
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                style={isActive ? cfg.activeStyle : IDLE_STYLE}
              >
                {cfg.icon}
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
            className="w-full px-3 py-1.5 rounded-lg text-xs outline-none"
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
