import { NavLink } from 'react-router-dom';
import { GraduationCap, Home, Receipt, Megaphone, MessageCircle, TrendingUp, UserCircle, CreditCard, ClipboardList } from 'lucide-react';

const ITEMS = [
  { to: '/portal', end: true, icon: Home, label: 'Inicio' },
  { to: '/portal/historial', icon: Receipt, label: 'Historial' },
  { to: '/portal/comunicaciones', icon: Megaphone, label: 'Comunicaciones' },
  { to: '/portal/mensajes', icon: MessageCircle, label: 'Mensajes' },
  { to: '/portal/rendimiento', icon: TrendingUp, label: 'Rendimiento' },
  { to: '/portal/plan-evaluacion', icon: ClipboardList, label: 'Plan de evaluación' },
  { to: '/portal/cantina', icon: CreditCard, label: 'Cantina' },
  { to: '/portal/perfil', icon: UserCircle, label: 'Perfil' },
];

const RepresentanteRail = () => {
  return (
  <nav aria-label="Navegación del portal de representantes" className="group hidden md:flex focus-within:w-60 fixed left-0 top-0 bottom-0 w-20 hover:w-60 flex-col bg-[var(--surface)]/90 backdrop-blur-xl border-r border-[var(--border)]/80 py-5 z-20 overflow-hidden transition-[width] duration-200">
    <div className="mb-7 ml-5 flex items-center gap-3 whitespace-nowrap">
      <div className="w-10 h-10 rounded-2xl flex items-center justify-center" style={{ color: 'var(--portal-primary)', background: 'color-mix(in srgb, var(--portal-primary) 10%, white)' }}>
      <GraduationCap size={26} className="shrink-0" />
      </div>
      <div className="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity"><p className="text-xs font-bold text-[var(--jet)]">Portal de representantes</p><p className="text-xs text-[var(--ash)]">Mi colegio</p></div>
    </div>
    <div className="flex flex-col items-center gap-2 w-full px-2">
      {ITEMS.map(({ to, end, icon: Icon, label }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) =>
            `portal-rail-link flex items-center gap-3 py-2.5 px-3 w-full rounded-2xl ${
              isActive ? 'text-[var(--portal-primary)]' : 'text-[var(--ash)] hover:text-[var(--jet-mid)]'
            }`
          }
          style={({ isActive }) => isActive ? { background: 'color-mix(in srgb, var(--portal-primary) 11%, white)' } : undefined}
        >
          <Icon size={20} />
          <span className="text-xs font-medium whitespace-nowrap opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">{label}</span>
        </NavLink>
      ))}
    </div>
  </nav>
  );
};

export default RepresentanteRail;
