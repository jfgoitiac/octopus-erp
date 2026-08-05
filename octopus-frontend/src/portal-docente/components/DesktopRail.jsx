import { NavLink } from 'react-router-dom';
import { GraduationCap, LayoutDashboard, BookOpen, MessageCircle, AlertTriangle, UserCircle } from 'lucide-react';
import { useConfigColegio } from '../hooks/useConfigColegio';

const ITEMS = [
  { to: '/portal-docente', end: true, icon: LayoutDashboard, label: 'Inicio' },
  { to: '/portal-docente/materias', icon: BookOpen, label: 'Materias' },
  { to: '/portal-docente/mensajes', icon: MessageCircle, label: 'Mensajes' },
  { to: '/portal-docente/incidentes', icon: AlertTriangle, label: 'Incidentes' },
  { to: '/portal-docente/perfil', icon: UserCircle, label: 'Perfil' },
];

const DesktopRail = () => {
  const { nombre_colegio: nombreColegio, logo_url: logoColegio } = useConfigColegio();

  return (
  <nav className="hidden md:flex fixed left-0 top-0 bottom-0 w-20 flex-col items-center bg-white border-r border-gray-100 py-4 z-20">
    <div className="mb-6" style={{ color: 'var(--docente-primary)' }}>
      {logoColegio ? (
        <img
          src={logoColegio}
          alt={nombreColegio || 'Logo del colegio'}
          className="h-8 w-8 object-contain"
          onError={e => { e.target.style.display = 'none'; }}
        />
      ) : (
        <GraduationCap size={26} />
      )}
    </div>
    <div className="flex flex-col items-center gap-2 w-full">
      {ITEMS.map(({ to, end, icon: Icon, label }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) =>
            `flex flex-col items-center gap-1 py-2.5 px-2 w-16 rounded-xl transition-colors ${
              isActive ? 'bg-[var(--docente-primary)]/10 text-[var(--docente-primary)]' : 'text-gray-400 hover:text-gray-600'
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

export default DesktopRail;
