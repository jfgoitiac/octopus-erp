import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { CalendarDays } from 'lucide-react';
import SkeletonCard from '../SkeletonCard';
import MontoRef, { NotaTasaBcv } from '../MontoRef';

// Formatea fecha como "12 de mayo"
const formatFecha = (fechaStr) => {
  if (!fechaStr) return '—';
  try {
    return format(new Date(fechaStr), "d 'de' MMMM", { locale: es });
  } catch {
    return fechaStr;
  }
};

const WidgetProximosVencimientos = ({ resumen, loading, variosAlumnos = false }) => {
  if (loading) {
    return <SkeletonCard lines={2} />;
  }

  if (!resumen?.proximos_vencimientos?.length) return null;

  return (
    <section className="portal-card portal-card--soft p-5 h-full">
      <div className="flex items-center gap-2 mb-3">
        <CalendarDays size={16} className="text-[var(--portal-primary,#0fa3b1)]" />
        <h2 className="text-sm font-semibold text-gray-700">Próximos vencimientos</h2>
      </div>
      <div className="space-y-2">
        {resumen.proximos_vencimientos.map((m) => (
          <div key={m.id} className="flex items-center justify-between gap-3 py-2.5 border-b border-slate-100 last:border-0">
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-700">{m.mes_nombre} {m.anio}</p>
              {variosAlumnos && m.alumno_nombre && (
                <p className="text-xs text-gray-500 truncate">{m.alumno_nombre}</p>
              )}
              {m.fecha_vencimiento && (
                <p className="text-xs text-gray-400">Vence: {formatFecha(m.fecha_vencimiento)}</p>
              )}
            </div>
            <MontoRef usd={m.monto_usd} tasaBcv={resumen.tasa_bcv} className="flex-shrink-0" />
          </div>
        ))}
      </div>
      <NotaTasaBcv tasaBcv={resumen.tasa_bcv} className="mt-3" />
    </section>
  );
};

export default WidgetProximosVencimientos;
