import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { AlertTriangle } from 'lucide-react';
import { Avatar, SectionCard, EmptyRow } from './shared';

const formatFechaCorta = (fechaStr) => {
  try {
    return format(new Date(fechaStr), 'd MMM', { locale: es });
  } catch {
    return fechaStr;
  }
};

// Mismos colores de severidad que DocenteIncidentes.jsx (leve/moderado/grave)
const SEVERIDAD_PILL = {
  L: { label: 'Leve', className: 'bg-[var(--yellow-light)] text-[var(--yellow)]' },
  M: { label: 'Moderado', className: 'bg-[var(--yellow-light)] text-[var(--yellow)]' },
  G: { label: 'Grave', className: 'bg-[var(--red-light)] text-[var(--red)]' },
};

const severidadPill = (val) => SEVERIDAD_PILL[val] || SEVERIDAD_PILL.L;

const WidgetIncidentes = ({ incidentes, className = '' }) => (
  <SectionCard title="Incidentes recientes" to="/portal-docente/incidentes" className={className}>
    {incidentes.length === 0 ? (
      <EmptyRow icon={AlertTriangle} text="No hay incidentes registrados." subtext="Cuando registres uno, aparecerá en este listado." />
    ) : (
      incidentes.slice(0, 3).map(inc => {
        const pill = severidadPill(inc.severidad);
        return (
          <Link
            key={inc.id}
            to="/portal-docente/incidentes"
            className="flex items-center gap-3 px-4 py-3 hover:bg-[var(--red-light)]/40 transition-colors"
          >
            <Avatar nombre={inc.alumno_nombre} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-[var(--jet)] truncate">{inc.alumno_nombre}</p>
              <p className="text-xs text-[var(--ash)] truncate">{inc.descripcion}</p>
            </div>
            <div className="flex flex-col items-end gap-1 flex-shrink-0">
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${pill.className}`}>
                {inc.severidad_label || pill.label}
              </span>
              <span className="text-[10px] font-medium text-[var(--ash)]">
                {formatFechaCorta(inc.fecha)}
              </span>
            </div>
          </Link>
        );
      })
    )}
  </SectionCard>
);

export default WidgetIncidentes;
