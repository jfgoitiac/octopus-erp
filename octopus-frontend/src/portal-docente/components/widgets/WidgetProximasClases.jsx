import { Link } from 'react-router-dom';
import { CalendarClock, MapPin, ClipboardCheck } from 'lucide-react';
import { EmptyRow } from './shared';

const formatHora = (horaStr) => (horaStr ? horaStr.slice(0, 5) : '');

const WidgetProximasClases = ({ proximasClases, className = '' }) => (
  <div className={`bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden h-full flex flex-col ${className}`}>
    <div className="px-4 pt-4 pb-2">
      <h2 className="text-sm font-semibold text-gray-900">Próximas clases</h2>
    </div>

    {proximasClases.length === 0 ? (
      <EmptyRow icon={CalendarClock} text="No tienes clases programadas en tu horario." />
    ) : (
      <div className="divide-y divide-gray-50">
        {proximasClases.map(h => (
          <div key={h.id} className="flex items-center gap-3 px-4 py-3">
            <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 bg-[var(--docente-primary)]/10 text-[var(--docente-primary)]">
              <CalendarClock size={16} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-gray-900 truncate">{h.materia?.nombre}</p>
              <p className="text-xs text-gray-400 truncate capitalize">
                {h.dia_semana_label} · {formatHora(h.hora_inicio)}–{formatHora(h.hora_fin)}
              </p>
            </div>
            {h.aula && (
              <span className="flex items-center gap-1 text-[10px] font-medium text-gray-400 flex-shrink-0">
                <MapPin size={12} /> {h.aula}
              </span>
            )}
            {h.materia?.id && (
              <Link
                to={`/portal-docente/materias/${h.materia.id}?tab=asistencia`}
                aria-label="Marcar asistencia"
                title="Marcar asistencia"
                className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-[var(--docente-primary)] hover:bg-[var(--docente-primary)]/10 transition-colors"
              >
                <ClipboardCheck size={16} />
              </Link>
            )}
          </div>
        ))}
      </div>
    )}
  </div>
);

export default WidgetProximasClases;
