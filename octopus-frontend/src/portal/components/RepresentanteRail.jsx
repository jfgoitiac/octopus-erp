import { NavLink } from 'react-router-dom';
import { GraduationCap, Home, Receipt, Megaphone, MessageCircle, TrendingUp, UserCircle } from 'lucide-react';

const ITEMS = [
  { to: '/portal', end: true, icon: Home, label: 'Inicio' },
  { to: '/portal/historial', icon: Receipt, label: 'Historial' },
  { to: '/portal/comunicaciones', icon: Megaphone, label: 'Comunicaciones' },
  { to: '/portal/mensajes', icon: MessageCircle, label: 'Mensajes' },
  { to: '/portal/rendimiento', icon: TrendingUp, label: 'Rendimiento' },
  { to: '/portal/perfil', icon: UserCircle, label: 'Perfil' },
];

const RepresentanteRail = () => {
  return (
  <nav className="hidden md:flex fixed left-0 top-0 bottom-0 w-20 flex-col items-center bg-white border-r border-gray-100 py-4 z-20">
    <div className="mb-6" style={{ color: 'var(--portal-primary, #0fa3b1)' }}>
      <GraduationCap size={26} />
    </div>
    <div className="flex flex-col items-center gap-2 w-full">
      {ITEMS.map(({ to, end, icon: Icon, label }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) =>
            `flex flex-col items-center gap-1 py-2.5 px-2 w-16 rounded-xl transition-colors ${
              isActive ? 'bg-[var(--portal-primary,#0fa3b1)]/10 text-[var(--portal-primary,#0fa3b1)]' : 'text-gray-400 hover:text-gray-600'
            }`
          }
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
