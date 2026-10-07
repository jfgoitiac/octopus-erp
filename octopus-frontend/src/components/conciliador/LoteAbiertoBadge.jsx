import { Link } from 'react-router-dom';
import { Layers, ArrowRight } from 'lucide-react';

/** Contador "Lote abierto: N operaciones" con enlace a Reportes → Conciliación. */
export default function LoteAbiertoBadge({ lote }) {
  const total = lote?.total_operaciones ?? lote?.conciliaciones?.length ?? 0;
  if (!lote || total === 0) return null;
  return (
    <div
      className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3 rounded-xl px-3 py-2.5 mb-4 text-sm"
      style={{ background: 'var(--pb-light)', border: '0.5px solid var(--border-md)', color: 'var(--jet)' }}
    >
      <span className="inline-flex items-center gap-2 font-medium">
        <Layers size={15} style={{ color: 'var(--pb)' }} />
        Lote abierto: {total} {total === 1 ? 'operación' : 'operaciones'}
      </span>
      <Link
        to="/reportes?tab=conciliacion"
        className="inline-flex items-center gap-1 text-xs font-medium"
        style={{ color: 'var(--pb)' }}
      >
        Ver en Reportes → Conciliación
        <ArrowRight size={12} />
      </Link>
    </div>
  );
}
