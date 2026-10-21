import { FileCheck2 } from 'lucide-react';
import { fmtFecha } from '../../utils/fechas';
import { ESTATUS_COMPROBANTE } from '../../utils/estados';
import EstadoBadge from '../EstadoBadge';

// Últimos comprobantes enviados desde el portal y su estado de revisión,
// con el motivo cuando el colegio rechaza uno. Sin comprobantes no se pinta.
const WidgetMisComprobantes = ({ comprobantes = [], variosAlumnos = false, limite = 4 }) => {
  if (!comprobantes.length) return null;

  return (
    <section className="portal-card portal-card--soft p-4 sm:p-5" aria-labelledby="mis-comprobantes">
      <div className="flex items-center gap-2 mb-2">
        <FileCheck2 size={16} className="text-[var(--portal-primary)]" aria-hidden="true" />
        <h3 id="mis-comprobantes" className="text-sm font-semibold text-[var(--jet)]">Comprobantes enviados</h3>
      </div>
      <ul className="divide-y divide-[var(--border)]">
        {comprobantes.slice(0, limite).map((c) => (
          <li key={c.id} className="py-2.5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-[var(--jet)]">{c.mes_nombre} {c.anio}</p>
                {variosAlumnos && c.alumno_nombre && <p className="text-xs text-[var(--jet-mid)] truncate">{c.alumno_nombre}</p>}
                <p className="text-xs text-[var(--ash)]">Enviado el {fmtFecha(c.fecha_subida, "d 'de' MMM, h:mm a")}</p>
              </div>
              <EstadoBadge estado={ESTATUS_COMPROBANTE[c.estatus]} fallback={c.estatus_display} />
            </div>
            {c.estatus === 'rechazado' && c.observaciones && (
              <p className="mt-1.5 rounded-lg bg-[var(--red-light)] px-2 py-1 text-xs text-[var(--red)]">Motivo: {c.observaciones}</p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
};

export default WidgetMisComprobantes;
