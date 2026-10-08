import { Link } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, ChevronRight, Clock3 } from 'lucide-react';

const NIVEL = {
  urgente: { label: 'Urgente', className: 'bg-red-50 text-red-700', Icon: AlertTriangle },
  pronto: { label: 'Próximo', className: 'bg-amber-50 text-amber-700', Icon: Clock3 },
  normal: { label: 'Pendiente', className: 'bg-sky-50 text-sky-700', Icon: Clock3 },
};

const WidgetPendientesHoy = ({ items, updatedAt, className = '' }) => (
  <section className={`bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden ${className}`} aria-labelledby="pendientes-hoy">
    <div className="flex items-start justify-between gap-3 px-4 pt-4 pb-3">
      <div><h2 id="pendientes-hoy" className="text-sm font-semibold text-gray-900">Pendientes de hoy</h2><p className="mt-0.5 text-xs text-gray-400">Prioriza una acción y continúa con tu jornada.</p></div>
      <span className="text-[10px] text-gray-400 whitespace-nowrap">Actualizado {updatedAt}</span>
    </div>
    {items.length === 0 ? (
      <div className="px-4 py-7 text-center"><CheckCircle2 size={25} className="mx-auto text-emerald-500" /><p className="mt-2 text-sm font-medium text-gray-700">Todo al día</p><p className="mt-1 text-xs text-gray-400">No hay acciones académicas urgentes.</p></div>
    ) : <div className="divide-y divide-gray-50">{items.slice(0, 5).map((item) => {
      const level = NIVEL[item.level] || NIVEL.normal; const Icon = level.Icon;
      return <Link key={item.id} to={item.to} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-gray-50">
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${level.className}`}><Icon size={16} /></div>
        <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-gray-800">{item.title}</p><p className="truncate text-xs text-gray-400">{item.detail}</p></div>
        <span className={`hidden sm:inline rounded-full px-2 py-0.5 text-[10px] font-semibold ${level.className}`}>{level.label}</span><ChevronRight size={16} className="shrink-0 text-gray-300" />
      </Link>;
    })}</div>}
  </section>
);

export default WidgetPendientesHoy;
