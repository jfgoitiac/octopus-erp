import { Upload } from 'lucide-react';
import { fmtFecha } from '../../utils/fechas';
import { ESTATUS_COMPROBANTE } from '../../utils/estados';
import EstadoBadge from '../EstadoBadge';

// Últimos comprobantes enviados desde el portal y su estado de revisión,
// con el motivo cuando el colegio rechaza uno. Sin comprobantes no se pinta.
//
// `puedeResubir(c)` decide si un rechazado admite un comprobante nuevo (la
// mensualidad sigue pendiente y ese rechazo es su último envío); en ese caso
// se ofrece "Subir nuevo comprobante", que llama `onSubirNuevo(c.mensualidad)`.
const WidgetMisComprobantes = ({
  comprobantes = [], variosAlumnos = false, limite = 4, onSubirNuevo = null, puedeResubir = () => false,
}) => {
  if (!comprobantes.length) return null;

  return (
    <section className="portal-card p-5 sm:p-6" aria-labelledby="mis-comprobantes">
      <h3 id="mis-comprobantes" className="portal-section-title text-lg sm:text-xl mb-3">Comprobantes enviados</h3>
      <ul className="divide-y divide-[var(--portal-line)]">
        {comprobantes.slice(0, limite).map((c) => {
          const rechazado = c.estatus === 'rechazado';
          const resubible = rechazado && onSubirNuevo && puedeResubir(c);
          return (
            <li key={c.id} className="py-3.5 first:pt-0 last:pb-0">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[var(--portal-ink)] sm:text-base">{c.mes_nombre} {c.anio}</p>
                  {variosAlumnos && c.alumno_nombre && <p className="text-xs text-[var(--portal-ink)] truncate">{c.alumno_nombre}</p>}
                  <p className="text-xs text-[var(--portal-muted)]">Enviado el {fmtFecha(c.fecha_subida, "d 'de' MMM, h:mm a")}</p>
                </div>
                <EstadoBadge estado={ESTATUS_COMPROBANTE[c.estatus]} fallback={c.estatus_display} />
              </div>
              {rechazado && c.observaciones && (
                <p className="mt-2 whitespace-pre-line break-words rounded-xl bg-[var(--red-light)] px-3 py-2 text-xs text-[var(--red)]">Motivo: {c.observaciones}</p>
              )}
              {resubible && (
                <button
                  type="button"
                  onClick={() => onSubirNuevo(c.mensualidad)}
                  className="mt-2 flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-[var(--portal-primary)] px-4 text-sm font-semibold text-[var(--portal-primary)] transition-colors hover:bg-[var(--portal-primary)]/10 sm:w-auto"
                >
                  <Upload size={16} aria-hidden="true" /> Subir nuevo comprobante
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
};

export default WidgetMisComprobantes;
