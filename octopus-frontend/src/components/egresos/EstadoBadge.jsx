const ESTILOS = {
  vencida: 'bg-red-50 text-red-700 ring-red-200',
  vence_hoy: 'bg-orange-50 text-orange-700 ring-orange-200',
  por_vencer: 'bg-amber-50 text-amber-700 ring-amber-200',
  al_dia: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  pagada: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  registrado: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  parcial: 'bg-sky-50 text-sky-700 ring-sky-200',
  pendiente: 'bg-amber-50 text-amber-700 ring-amber-200',
  por_aprobar: 'bg-amber-50 text-amber-700 ring-amber-200',
  anulado: 'bg-slate-100 text-slate-600 ring-slate-200',
  anulada: 'bg-slate-100 text-slate-600 ring-slate-200',
};

// Badge de estado compartido entre Egresos y Cuentas por Pagar.
export default function EstadoBadge({ estado, className = '' }) {
  if (!estado) return <span className="text-slate-400">—</span>;
  const estilo = ESTILOS[estado] || 'bg-slate-100 text-slate-600 ring-slate-200';
  return <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ring-1 ring-inset ${estilo} ${className}`}>{String(estado).replace(/_/g, ' ')}</span>;
}
