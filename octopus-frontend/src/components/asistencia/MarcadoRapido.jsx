import { memo } from 'react';
import { ArrowRight } from 'lucide-react';
import { ESTADO, CONFIGS_ESTADO } from '../../constants/asistencia';
import AvatarAlumno from './AvatarAlumno';
import { vibrar } from './paseLista.utils';

const FilaRapida = memo(function FilaRapida({ registro, numero, onAlternar }) {
  const { alumno_id, alumno_nombre, alumno_foto, estado } = registro;
  const cfg = estado ? CONFIGS_ESTADO[estado] : null;
  const ausente = estado === ESTADO.AUSENTE;

  return (
    <li>
      <button
        type="button"
        aria-pressed={ausente}
        aria-label={`${alumno_nombre || 'Alumno'}: ${cfg ? cfg.label : 'sin marcar'}. Tocar para marcar ${ausente ? 'presente' : 'ausente'}`}
        onClick={() => onAlternar(alumno_id, ausente ? ESTADO.PRESENTE : ESTADO.AUSENTE)}
        className="flex min-h-14 w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-[transform,background-color,box-shadow] duration-150 active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pb)]/40"
        style={ausente
          ? { background: 'var(--red-light)', boxShadow: 'inset 0 0 0 1.5px var(--red)' }
          : { background: '#fff', boxShadow: 'inset 0 0 0 0.5px var(--border-md)' }}
      >
        <AvatarAlumno nombre={alumno_nombre} foto={alumno_foto} className="h-10 w-10 rounded-xl text-sm" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium" style={{ color: 'var(--jet)' }}>{alumno_nombre}</span>
          <span className="block text-[11px] tabular-nums" style={{ color: 'var(--ash)' }}>N.º {registro.numero_lista ?? numero}</span>
        </span>
        {cfg && (
          <span
            className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold"
            style={ausente
              ? { background: cfg.activeStyle.color, color: '#fff' }
              : { background: cfg.activeStyle.background, color: cfg.activeStyle.color }}
          >
            <cfg.Icon size={12} aria-hidden="true" /> {cfg.label}
          </span>
        )}
      </button>
    </li>
  );
});

/**
 * Modo rápido: todos quedan presentes y el docente solo toca a quienes
 * faltan. Un toque alterna Presente ↔ Ausente; justificados y observaciones
 * se ajustan después desde el resumen (abre la tarjeta del alumno).
 */
const MarcadoRapido = ({ registros, onMarcar, onListo }) => {
  const ausentes = registros.reduce((n, r) => n + (r.estado === ESTADO.AUSENTE ? 1 : 0), 0);
  const alternar = (id, estado) => { vibrar(); onMarcar(id, estado); };

  return (
    <section className="mx-auto w-full max-w-md space-y-3 anim-scale-in" aria-labelledby="pl-rapido-titulo">
      <div className="rounded-2xl bg-white p-4 sm:p-5" style={{ border: '0.5px solid var(--border-md)', boxShadow: '0 12px 32px -8px rgba(43,48,58,0.12)' }}>
        <h2 id="pl-rapido-titulo" className="text-lg font-semibold tracking-tight" style={{ color: 'var(--jet)' }}>
          Toca a quienes faltan
        </h2>
        <p className="mt-0.5 text-sm" style={{ color: 'var(--jet-mid)' }}>
          Todos quedaron presentes. Un toque marca ausente; otro lo devuelve.
        </p>
        <p className="mt-3 text-sm font-semibold tabular-nums" style={{ color: ausentes ? 'var(--red)' : '#15803d' }} aria-live="polite">
          {ausentes === 0 ? 'Sin ausentes' : `${ausentes} ausente${ausentes === 1 ? '' : 's'}`}
        </p>
      </div>

      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {registros.map((r, i) => (
          <FilaRapida key={r.alumno_id} registro={r} numero={i + 1} onAlternar={alternar} />
        ))}
      </ul>

      {/* Fija sobre la bottom nav en móvil para no tener que bajar hasta el final */}
      <div className="sticky bottom-16 z-20 pt-1 sm:bottom-4">
        <button
          type="button"
          onClick={onListo}
          className="flex min-h-14 w-full items-center justify-center gap-2 rounded-xl px-6 text-base font-semibold text-white transition-transform active:scale-[0.97] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pb)]/50 focus-visible:ring-offset-2"
          style={{ background: 'var(--docente-primary)', boxShadow: '0 10px 24px -10px rgba(15,163,177,0.7)' }}
        >
          Listo, ver resumen <ArrowRight size={18} aria-hidden="true" />
        </button>
      </div>
    </section>
  );
};

export default MarcadoRapido;
