import { NavLink } from 'react-router-dom';
import { GraduationCap, Home, Receipt, Megaphone, MessageCircle, TrendingUp, UserCircle, CreditCard } from 'lucide-react';

const ITEMS = [
  { to: '/portal', end: true, icon: Home, label: 'Inicio' },
  { to: '/portal/historial', icon: Receipt, label: 'Historial' },
  { to: '/portal/comunicaciones', icon: Megaphone, label: 'Comunicaciones' },
  { to: '/portal/mensajes', icon: MessageCircle, label: 'Mensajes' },
  { to: '/portal/rendimiento', icon: TrendingUp, label: 'Rendimiento' },
  { to: '/portal/cantina', icon: CreditCard, label: 'Cantina' },
  { to: '/portal/perfil', icon: UserCircle, label: 'Perfil' },
];

const RepresentanteRail = () => {
  return (
  <nav className="hidden md:flex fixed left-0 top-0 bottom-0 w-20 flex-col items-center bg-white/90 backdrop-blur-xl border-r border-slate-200/80 py-5 z-20">
    <div className="mb-7 w-10 h-10 rounded-2xl flex items-center justify-center" style={{ color: 'var(--portal-primary, #0fa3b1)', background: 'color-mix(in srgb, var(--portal-primary, #0fa3b1) 10%, white)' }}>
      <GraduationCap size={26} />
    </div>
    <div className="flex flex-col items-center gap-2 w-full">
      {ITEMS.map(({ to, end, icon: Icon, label }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) =>
            `portal-rail-link flex flex-col items-center gap-1 py-2.5 px-2 w-16 rounded-2xl ${
              isActive ? 'text-[var(--portal-primary,#0fa3b1)]' : 'text-slate-400 hover:text-slate-700'
            }`
          }
          style={({ isActive }) => isActive ? { background: 'color-mix(in srgb, var(--portal-primary, #0fa3b1) 11%, white)' } : undefined}
        >
          <Icon size={20} />
          <span className="text-[10px] font-medium">{label}</span>
        </NavLink>
      ))}
    </div>
  </nav>
  );
};

export default RepresentanteRail;
