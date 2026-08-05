import { Link } from 'react-router-dom';
import { ClipboardCheck } from 'lucide-react';
import { EmptyRow } from './shared';

const WidgetProgresoNotas = ({ progreso, lapsoActivo, className = '' }) => (
  <div className={`bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden ${className}`}>
    <div className="flex items-center justify-between px-4 pt-4 pb-2">
      <h2 className="text-sm font-semibold text-gray-900">Progreso de notas</h2>
      {lapsoActivo && (
        <span className="text-xs text-gray-400">{lapsoActivo.nombre}</span>
      )}
    </div>

    {!lapsoActivo ? (
      <EmptyRow icon={ClipboardCheck} text="No hay un lapso activo configurado." subtext="Contacta a la administración del colegio." />
    ) : progreso.length === 0 ? (
      <EmptyRow icon={ClipboardCheck} text="Todavía no tienes materias asignadas." />
    ) : (
      <div className="divide-y divide-gray-50">
        {progreso.map(p => {
          const pct = p.total > 0 ? Math.round((p.cargadas / p.total) * 100) : 0;
          const completo = pct === 100;
          return (
            <Link
              key={p.materiaId}
              to={`/portal-docente/materias/${p.materiaId}`}
              className="flex items-center gap-3 px-4 py-3 hover:bg-emerald-50/40 transition-colors"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-gray-900 truncate">{p.nombre}</p>
                <div className="h-1.5 rounded-full bg-gray-100 mt-1.5 overflow-hidden">
                  <div
                    className={`h-full rounded-full ${completo ? 'bg-emerald-500' : 'bg-emerald-400'}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium flex-shrink-0 ${completo ? 'bg-emerald-50 text-emerald-700' : 'text-gray-400'}`}>
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
