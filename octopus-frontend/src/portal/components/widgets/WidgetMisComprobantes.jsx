import { fmtFecha } from '../../utils/fechas';
import { ESTATUS_COMPROBANTE } from '../../utils/estados';
import EstadoBadge from '../EstadoBadge';

// Últimos comprobantes enviados desde el portal y su estado de revisión,
// con el motivo cuando el colegio rechaza uno. Sin comprobantes no se pinta.
const WidgetMisComprobantes = ({ comprobantes = [], variosAlumnos = false, limite = 4 }) => {
  if (!comprobantes.length) return null;

  return (
    <section className="portal-card p-5 sm:p-6" aria-labelledby="mis-comprobantes">
      <h3 id="mis-comprobantes" className="portal-section-title text-lg sm:text-xl mb-3">Comprobantes enviados</h3>
      <ul className="divide-y divide-[var(--portal-line)]">
        {comprobantes.slice(0, limite).map((c) => (
          <li key={c.id} className="py-3.5 first:pt-0 last:pb-0">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[var(--portal-ink)] sm:text-base">{c.mes_nombre} {c.anio}</p>
                {variosAlumnos && c.alumno_nombre && <p className="text-xs text-[var(--portal-ink)] truncate">{c.alumno_nombre}</p>}
                <p className="text-xs text-[var(--portal-muted)]">Enviado el {fmtFecha(c.fecha_subida, "d 'de' MMM, h:mm a")}</p>
              </div>
              <EstadoBadge estado={ESTATUS_COMPROBANTE[c.estatus]} fallback={c.estatus_display} />
            </div>
            {c.estatus === 'rechazado' && c.observaciones && (
              <p className="mt-2 rounded-xl bg-[var(--red-light)] px-3 py-2 text-xs text-[var(--red)]">Motivo: {c.observaciones}</p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
};

export default WidgetMisComprobantes;
