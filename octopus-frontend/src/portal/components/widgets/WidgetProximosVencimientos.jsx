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
    <section className="portal-card p-5 sm:p-6" aria-labelledby="proximos-vencimientos">
      <h3 id="proximos-vencimientos" className="portal-section-title text-lg sm:text-xl mb-3">Próximos vencimientos</h3>
      <ul className="divide-y divide-[var(--portal-line)]">
        {vencimientos.map((m) => {
          const enRevision = comprobantePorMensualidad[m.id]?.estatus === 'pendiente';
          return (
            <li key={m.id} className="flex items-center gap-3 py-3.5 first:pt-0 last:pb-0 sm:gap-4">
              {m.fecha_vencimiento && (
                <div className="portal-date" aria-hidden="true">
                  <strong>{fmtFecha(m.fecha_vencimiento, 'd')}</strong>
                  <span>{fmtFecha(m.fecha_vencimiento, 'MMM')}</span>
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-[var(--portal-ink)] sm:text-base">{m.mes_nombre} {m.anio}</p>
                {variosAlumnos && m.alumno_nombre && (
                  <p className="text-xs text-[var(--portal-ink)] truncate">{m.alumno_nombre}</p>
                )}
                {m.fecha_vencimiento && (
                  <p className="text-xs text-[var(--portal-muted)]">Vence el {fmtFecha(m.fecha_vencimiento, "d 'de' MMMM")}</p>
                )}
              </div>
              <div className="flex flex-col items-end gap-1 flex-shrink-0">
                <MontoRef usd={m.monto_total ?? m.monto_usd} tasaBcv={resumen.tasa_bcv} />
                {enRevision ? (
                  <EstadoBadge estado={ESTATUS_COMPROBANTE.pendiente} />
                ) : onPagar && (
                  <button type="button" onClick={() => onPagar(m)} className="text-xs font-semibold text-[var(--portal-tint-ink)] hover:underline underline-offset-4 min-h-[44px] sm:min-h-[32px] px-1">
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
