import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Clock, ArrowRight } from 'lucide-react';
import SkeletonCard from '../SkeletonCard';

// Formatea fecha con año: "12 de mayo 2025"
const formatFechaConAnio = (fechaStr) => {
  if (!fechaStr) return '—';
  try {
    return format(new Date(fechaStr), "d 'de' MMMM yyyy", { locale: es });
  } catch {
    return fechaStr;
  }
};

// Badge de estatus de pago
const EstatusBadge = ({ estatus }) => {
  const config = {
    completado: 'bg-green-100 text-green-700',
    anulado: 'bg-red-100 text-red-700',
    en_revision: 'bg-yellow-100 text-yellow-700',
  };
  const labels = {
    completado: 'Pagado',
    anulado: 'Anulado',
    en_revision: 'En revisión',
  };
  const cls = config[estatus] || 'bg-gray-100 text-gray-600';
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${cls}`}>
      {labels[estatus] || estatus}
    </span>
  );
};

const WidgetUltimosPagos = ({ ultimosPagos, loading }) => {
  if (loading) {
    return <SkeletonCard lines={3} />;
  }

  if (!ultimosPagos?.length) return null;

  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Clock size={16} className="text-[var(--portal-primary,#0fa3b1)]" />
          <h2 className="text-sm font-semibold text-gray-700">Últimos pagos</h2>
        </div>
        <Link
          to="/portal/historial"
          className="flex items-center gap-1 text-sm text-[var(--portal-primary,#0fa3b1)] py-2 px-1 -mx-1 min-h-[44px] hover:underline"
        >
          Ver todos <ArrowRight size={14} />
        </Link>
      </div>
      <div className="space-y-2">
        {ultimosPagos.slice(0, 3).map((pago) => (
          <div key={pago.id} className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0">
            <div>
              <p className="text-sm text-gray-700">{pago.concepto}</p>
              <p className="text-xs text-gray-400">{formatFechaConAnio(pago.fecha_pago)}</p>
            </div>
            <div className="text-right flex flex-col items-end gap-1">
              <p className="text-sm font-semibold text-gray-800">${Number(pago.monto_usd).toFixed(2)}</p>
              <EstatusBadge estatus={pago.estatus} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default WidgetUltimosPagos;
