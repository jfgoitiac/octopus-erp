import { CalendarDays } from 'lucide-react';
import SkeletonCard from '../SkeletonCard';
import MontoRef from '../MontoRef';
import { fmtFecha } from '../../utils/fechas';
import { ESTATUS_COMPROBANTE } from '../../utils/estados';
import EstadoBadge from '../EstadoBadge';

// Mensualidades que aún no vencen (hasta 2 por hijo). Se pueden pagar por
// adelantado desde aquí mismo.
const WidgetProximosVencimientos = ({ resumen, loading, variosAlumnos = false, comprobantePorMensualidad = {}, onPagar }) => {
  if (loading) {
    return <SkeletonCard lines={2} />;
  }

  const vencimientos = resumen?.proximos_vencimientos || [];
  if (!vencimientos.length) return null;

  return (
    <section className="portal-card portal-card--soft p-4 sm:p-5" aria-labelledby="proximos-vencimientos">
      <div className="flex items-center gap-2 mb-2">
        <CalendarDays size={16} className="text-[var(--portal-primary)]" aria-hidden="true" />
        <h3 id="proximos-vencimientos" className="text-sm font-semibold text-[var(--jet)]">Próximos vencimientos</h3>
      </div>
      <ul className="divide-y divide-[var(--border)]">
        {vencimientos.map((m) => {
          const enRevision = comprobantePorMensualidad[m.id]?.estatus === 'pendiente';
          return (
            <li key={m.id} className="flex items-center justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <p className="text-sm font-medium text-[var(--jet)]">{m.mes_nombre} {m.anio}</p>
                {variosAlumnos && m.alumno_nombre && (
                  <p className="text-xs text-[var(--jet-mid)] truncate">{m.alumno_nombre}</p>
                )}
                {m.fecha_vencimiento && (
                  <p className="text-xs text-[var(--ash)]">Vence el {fmtFecha(m.fecha_vencimiento, "d 'de' MMMM")}</p>
                )}
              </div>
              <div className="flex flex-col items-end gap-1 flex-shrink-0">
                <MontoRef usd={m.monto_total ?? m.monto_usd} tasaBcv={resumen.tasa_bcv} />
                {enRevision ? (
                  <EstadoBadge estado={ESTATUS_COMPROBANTE.pendiente} />
                ) : onPagar && (
                  <button type="button" onClick={() => onPagar(m)} className="text-xs font-semibold text-[var(--portal-primary)] hover:underline min-h-[44px] sm:min-h-[32px] px-1">
                    Pagar por adelantado
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
};

export default WidgetProximosVencimientos;
