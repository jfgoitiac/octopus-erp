import { Link } from 'react-router-dom';
import { Clock, ArrowRight } from 'lucide-react';
import SkeletonCard from '../SkeletonCard';
import { fmtMonto } from '../../utils/montos';
import { fmtFecha } from '../../utils/fechas';
import { ESTATUS_PAGO } from '../../utils/estados';
import EstadoBadge from '../EstadoBadge';

const WidgetUltimosPagos = ({ ultimosPagos, loading }) => {
  if (loading) {
    return <SkeletonCard lines={3} />;
  }

  if (!ultimosPagos?.length) return null;

  return (
    <section className="portal-card portal-card--soft p-4 sm:p-5" aria-labelledby="ultimos-pagos">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <Clock size={16} className="text-[var(--portal-primary)]" aria-hidden="true" />
          <h3 id="ultimos-pagos" className="text-sm font-semibold text-[var(--jet)]">Últimos pagos</h3>
        </div>
        <Link
          to="/portal/historial"
          className="flex items-center gap-1 text-sm text-[var(--portal-primary)] px-1 min-h-[44px] hover:underline"
        >
          Ver todos <ArrowRight size={14} aria-hidden="true" />
        </Link>
      </div>
      <ul className="divide-y divide-[var(--border)]">
        {ultimosPagos.slice(0, 3).map((pago) => (
          <li key={pago.id} className="flex items-center justify-between gap-3 py-2.5">
            <div className="min-w-0">
              <p className="text-sm text-[var(--jet)] line-clamp-2">{pago.concepto}</p>
              <p className="text-xs text-[var(--ash)]">{fmtFecha(pago.fecha_pago, "d 'de' MMMM yyyy")}</p>
            </div>
            <div className="text-right flex flex-col items-end gap-1 flex-shrink-0">
              <p className="text-sm font-semibold text-[var(--jet)] whitespace-nowrap">REF. {fmtMonto(pago.monto_usd)}</p>
              <EstadoBadge estado={ESTATUS_PAGO[pago.estatus]} fallback={pago.estatus} />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
};

export default WidgetUltimosPagos;
