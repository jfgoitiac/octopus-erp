import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
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
    <section className="portal-card p-5 sm:p-6" aria-labelledby="ultimos-pagos">
      <div className="flex items-center justify-between mb-1">
        <h3 id="ultimos-pagos" className="portal-section-title text-lg sm:text-xl">Últimos pagos</h3>
        <Link
          to="/portal/historial"
          className="flex items-center gap-1 text-sm font-medium text-[var(--portal-tint-ink)] px-1 min-h-[44px] hover:underline underline-offset-4"
        >
          Ver todos <ArrowRight size={14} aria-hidden="true" />
        </Link>
      </div>
      <ul className="divide-y divide-[var(--portal-line)]">
        {ultimosPagos.slice(0, 3).map((pago) => (
          <li key={pago.id} className="flex items-center justify-between gap-3 py-3.5 last:pb-0">
            <div className="min-w-0">
              <p className="text-sm font-medium text-[var(--portal-ink)] line-clamp-2">{pago.concepto}</p>
              <p className="text-xs text-[var(--portal-muted)]">{fmtFecha(pago.fecha_pago, "d 'de' MMMM yyyy")}</p>
            </div>
            <div className="text-right flex flex-col items-end gap-1 flex-shrink-0">
              <p className="portal-amount text-sm font-semibold whitespace-nowrap">REF. {fmtMonto(pago.monto_usd)}</p>
              <EstadoBadge estado={ESTATUS_PAGO[pago.estatus]} fallback={pago.estatus} />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
};

export default WidgetUltimosPagos;
