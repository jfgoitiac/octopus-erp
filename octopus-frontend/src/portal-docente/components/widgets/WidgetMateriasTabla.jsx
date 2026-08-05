import { Link } from 'react-router-dom';
import { BookOpen, ChevronRight, GraduationCap } from 'lucide-react';
import { EmptyRow } from './shared';

function claseBadgeAprobados(pct) {
  if (pct >= 70) return 'bg-emerald-50 text-emerald-700';
  if (pct >= 40) return 'bg-amber-50 text-amber-700';
  return 'bg-red-50 text-red-700';
}

const WidgetMateriasTabla = ({ materias, className = '' }) => (
  <div className={`bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden h-full flex flex-col ${className}`}>
    <div className="flex items-center justify-between px-4 pt-4 pb-2">
      <h2 className="text-sm font-semibold text-gray-900">Mis materias</h2>
      <Link to="/portal-docente/materias" className="flex items-center gap-0.5 text-xs font-medium text-[var(--docente-primary)] hover:text-[var(--docente-primary-dark)] transition-colors">
        Ver todas <ChevronRight size={14} />
      </Link>
    </div>

    {materias.length === 0 ? (
      <EmptyRow icon={GraduationCap} text="Todavía no tienes materias asignadas." />
    ) : (
      <div className="divide-y divide-gray-50">
        {/* Encabezado de tabla — solo visible desde md */}
        <div className="hidden md:grid grid-cols-[1fr_auto_auto_auto] gap-4 px-4 py-2 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
          <span>Materia</span>
          <span>Sección</span>
          <span>Alumnos</span>
          <span></span>
        </div>
        {materias.map(m => (
          <Link
            key={m.id}
            to={`/portal-docente/materias/${m.id}`}
            className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors md:grid md:grid-cols-[1fr_auto_auto_auto] md:gap-4 md:items-center"
          >
            <div className="flex items-center gap-3 min-w-0 flex-1 md:contents">
              <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 bg-[var(--docente-primary)]/10 text-[var(--docente-primary)]">
                <BookOpen size={16} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">{m.nombre}</p>
                  {m.porcentaje_aprobados != null && (
                    <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium flex-shrink-0 ${claseBadgeAprobados(m.porcentaje_aprobados)}`}>
                      {m.porcentaje_aprobados}%
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-400 truncate md:hidden">
                  {m.grado_seccion}{m.codigo ? ` · ${m.codigo}` : ''}
                </p>
              </div>
              <span className="hidden md:block text-sm text-gray-500">{m.grado_seccion}</span>
              <span className="hidden md:block text-sm text-gray-500">{m.cantidad_alumnos ?? '—'}</span>
            </div>
            <ChevronRight size={16} className="text-gray-300 flex-shrink-0" />
          </Link>
        ))}
      </div>
    )}
  </div>
);

export default WidgetMateriasTabla;
