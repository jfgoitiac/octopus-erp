import { Link } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, ChevronRight, Clock3 } from 'lucide-react';

const NIVEL = {
  urgente: { label: 'Urgente', className: 'bg-[var(--red-light)] text-[var(--red)]', Icon: AlertTriangle },
  pronto: { label: 'Próximo', className: 'bg-[var(--yellow-light)] text-[var(--yellow)]', Icon: Clock3 },
  normal: { label: 'Pendiente', className: 'bg-sky-50 text-sky-700', Icon: Clock3 },
};

const WidgetPendientesHoy = ({ items, updatedAt, className = '' }) => (
  <section className={`bg-[var(--surface)] rounded-2xl border border-[var(--border)] overflow-hidden ${className}`} aria-labelledby="pendientes-hoy">
    <div className="flex items-start justify-between gap-3 px-4 pt-4 pb-3">
      <div><h2 id="pendientes-hoy" className="text-sm font-semibold text-[var(--jet)]">Pendientes de hoy</h2><p className="mt-0.5 text-xs text-[var(--ash)]">Prioriza una acción y continúa con tu jornada.</p></div>
      <span className="text-[10px] text-[var(--ash)] whitespace-nowrap">Actualizado {updatedAt}</span>
    </div>
    {items.length === 0 ? (
      <div className="px-4 py-7 text-center"><CheckCircle2 size={25} className="mx-auto text-[var(--green)]" /><p className="mt-2 text-sm font-medium text-[var(--jet-mid)]">Todo al día</p><p className="mt-1 text-xs text-[var(--ash)]">No hay acciones académicas urgentes.</p></div>
    ) : <div className="divide-y divide-[var(--border)]">{items.slice(0, 5).map((item) => {
      const level = NIVEL[item.level] || NIVEL.normal; const Icon = level.Icon;
      return <Link key={item.id} to={item.to} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-[var(--surface-sunken)]">
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${level.className}`}><Icon size={16} /></div>
        <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-[var(--jet)]">{item.title}</p><p className="truncate text-xs text-[var(--ash)]">{item.detail}</p></div>
        <span className={`hidden sm:inline rounded-full px-2 py-0.5 text-[10px] font-semibold ${level.className}`}>{level.label}</span><ChevronRight size={16} className="shrink-0 text-[var(--ash)]" />
      </Link>;
    })}</div>}
  </section>
);

export default WidgetPendientesHoy;
