const ESTILOS = {
  vencida: 'bg-[var(--red-light)] text-[var(--red)] ring-black/5',
  vence_hoy: 'bg-[var(--yellow-light)] text-[var(--yellow)] ring-black/5',
  por_vencer: 'bg-[var(--yellow-light)] text-[var(--yellow)] ring-black/5',
  al_dia: 'bg-[var(--green-light)] text-[var(--green)] ring-black/5',
  pagada: 'bg-[var(--green-light)] text-[var(--green)] ring-black/5',
  registrado: 'bg-[var(--green-light)] text-[var(--green)] ring-black/5',
  parcial: 'bg-[var(--pb-light)] text-[var(--pb-mid)] ring-black/5',
  pendiente: 'bg-[var(--yellow-light)] text-[var(--yellow)] ring-black/5',
  por_aprobar: 'bg-[var(--yellow-light)] text-[var(--yellow)] ring-black/5',
  anulado: 'bg-[var(--surface-sunken)] text-[var(--ash)] ring-black/5',
  anulada: 'bg-[var(--surface-sunken)] text-[var(--ash)] ring-black/5',
};

// Badge de estado compartido entre Egresos y Cuentas por Pagar.
export default function EstadoBadge({ estado, className = '' }) {
  if (!estado) return <span className="text-[var(--ash)]">—</span>;
  const estilo = ESTILOS[estado] || 'bg-[var(--surface-sunken)] text-[var(--ash)] ring-black/5';
  return <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ring-1 ring-inset ${estilo} ${className}`}>{String(estado).replace(/_/g, ' ')}</span>;
}
