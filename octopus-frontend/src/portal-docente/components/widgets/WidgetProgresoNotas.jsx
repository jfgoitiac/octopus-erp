import { Link } from 'react-router-dom';
import { ClipboardCheck } from 'lucide-react';
import { EmptyRow } from './shared';

const WidgetProgresoNotas = ({ progreso, lapsoActivo, className = '' }) => (
  <div className={`bg-[var(--surface)] rounded-2xl border border-[var(--border)] overflow-hidden ${className}`}>
    <div className="flex items-center justify-between px-4 pt-4 pb-2">
      <h2 className="text-sm font-semibold text-[var(--jet)]">Progreso de notas</h2>
      {lapsoActivo && (
        <span className="text-xs text-[var(--ash)]">{lapsoActivo.nombre}</span>
      )}
    </div>

    {!lapsoActivo ? (
      <EmptyRow icon={ClipboardCheck} text="No hay un lapso activo configurado." subtext="Contacta a la administración del colegio." />
    ) : progreso.length === 0 ? (
      <EmptyRow icon={ClipboardCheck} text="Todavía no tienes materias asignadas." />
    ) : (
      <div className="divide-y divide-[var(--border)]">
        {progreso.map(p => {
          const pct = p.total > 0 ? Math.round((p.cargadas / p.total) * 100) : 0;
          const completo = pct === 100;
          return (
            <Link
              key={p.materiaId}
              to={`/portal-docente/materias/${p.materiaId}`}
              className="flex items-center gap-3 px-4 py-3 hover:bg-[var(--green-light)]/40 transition-colors"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-[var(--jet)] truncate">{p.nombre}</p>
                <div role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`Notas cargadas de ${p.nombre}`} className="h-1.5 rounded-full bg-[var(--surface-sunken)] mt-1.5 overflow-hidden">
                  <div
                    className={`h-full rounded-full ${completo ? 'bg-[var(--green)]' : 'bg-[var(--docente-primary)]'}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium flex-shrink-0 ${completo ? 'bg-[var(--green-light)] text-[var(--green)]' : 'text-[var(--ash)]'}`}>
                {p.cargadas}/{p.total}
              </span>
            </Link>
          );
        })}
      </div>
    )}
  </div>
);

export default WidgetProgresoNotas;
