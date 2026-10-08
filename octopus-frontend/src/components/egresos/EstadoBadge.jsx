const VERDE = 'bg-[var(--green-light)] text-[var(--green)]';
const AMARILLO = 'bg-[var(--yellow-light)] text-[var(--yellow)]';
const GRIS = 'bg-[var(--surface-sunken)] text-[var(--ash)]';

const ESTILOS = {
  vencida: 'bg-[var(--red-light)] text-[var(--red)]',
  vence_hoy: AMARILLO,
  por_vencer: AMARILLO,
  al_dia: VERDE,
  pagada: VERDE,
  registrado: VERDE,
  parcial: 'bg-[var(--pb-light)] text-[var(--pb-mid)]',
  pendiente: AMARILLO,
  por_aprobar: AMARILLO,
  anulado: GRIS,
  anulada: GRIS,
};

// Badge de estado compartido entre Egresos y Cuentas por Pagar.
export default function EstadoBadge({ estado, className = '' }) {
  if (!estado) return <span className="text-[var(--ash)]">—</span>;
  const estilo = ESTILOS[estado] || GRIS;
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ring-1 ring-inset ring-black/5 ${estilo} ${className}`}>
      <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
      {String(estado).replace(/_/g, ' ')}
    </span>
  );
}
