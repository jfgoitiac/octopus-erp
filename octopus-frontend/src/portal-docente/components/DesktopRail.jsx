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
  <nav className="group hidden md:flex fixed left-0 top-0 bottom-0 w-20 hover:w-60 flex-col bg-white border-r border-gray-100 py-4 z-20 transition-[width] duration-200 overflow-hidden shadow-sm">
    <div className="mb-6 px-[27px] flex items-center gap-3 whitespace-nowrap" style={{ color: 'var(--docente-primary)' }}>
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
      <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-150 min-w-0">
        <p className="text-xs font-bold text-gray-800 truncate">{nombreColegio || 'Portal Docente'}</p>
        <p className="text-[10px] text-gray-400">Área académica</p>
      </div>
    </div>
    <div className="flex flex-col items-center gap-2 w-full px-2">
      {ITEMS.map(({ to, end, icon: Icon, label }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) =>
            `flex items-center gap-3 py-2.5 px-3 w-full rounded-xl transition-colors ${
              isActive ? 'bg-[var(--docente-primary)]/10 text-[var(--docente-primary)]' : 'text-gray-400 hover:text-gray-600'
            }`
          }
          >
            <Icon size={20} />
          <span className="text-xs font-medium whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-150">{label}</span>
        </NavLink>
      ))}
    </div>
  </nav>
  );
};

export default DesktopRail;
