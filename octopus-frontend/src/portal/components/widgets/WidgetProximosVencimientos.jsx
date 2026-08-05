import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { CalendarDays } from 'lucide-react';
import SkeletonCard from '../SkeletonCard';

// Formatea fecha como "12 de mayo"
const formatFecha = (fechaStr) => {
  if (!fechaStr) return '—';
  try {
    return format(new Date(fechaStr), "d 'de' MMMM", { locale: es });
  } catch {
    return fechaStr;
  }
};

const WidgetProximosVencimientos = ({ resumen, loading }) => {
  if (loading) {
    return <SkeletonCard lines={2} />;
  }

  if (!resumen?.proximos_vencimientos?.length) return null;

  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
      <div className="flex items-center gap-2 mb-3">
        <CalendarDays size={16} className="text-[var(--portal-primary,#0fa3b1)]" />
        <h2 className="text-sm font-semibold text-gray-700">Próximos vencimientos</h2>
      </div>
      <div className="space-y-2">
        {resumen.proximos_vencimientos.map((m) => (
          <div key={m.id} className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0">
            <div>
              <p className="text-sm font-medium text-gray-700">{m.mes_nombre} {m.anio}</p>
              {m.fecha_vencimiento && (
                <p className="text-xs text-gray-400">Vence: {formatFecha(m.fecha_vencimiento)}</p>
              )}
            </div>
            <p className="text-sm font-semibold text-gray-800">${Number(m.monto_usd).toFixed(2)}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

export default WidgetProximosVencimientos;
