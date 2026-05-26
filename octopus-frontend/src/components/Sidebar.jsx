import { useContext } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import {
  LayoutDashboard, UserPlus, Users, Calculator,
  BarChart3, Wrench, LogOut, Octagon, ShieldCheck,
  Loader2, Banknote, Monitor, Contact, AlertTriangle
} from 'lucide-react';

const navSections = [
  {
    label: 'Principal',
    items: [
      { name: 'Dashboard',     path: '/dashboard',     icon: LayoutDashboard, roles: ['director','sistemas','cobranza','cajero','administrador','secretaria'] },
      { name: 'Alumnos',        path: '/alumnos',        icon: Users,           roles: ['director','sistemas','administrador'] },
      { name: 'Morosos',        path: '/morosos',        icon: AlertTriangle,   roles: ['director','administrador','secretaria','cajero','sistemas'] },
      { name: 'Representantes', path: '/representantes', icon: Contact,         roles: ['director','administrador','secretaria','cajero'] },
      { name: 'Inscripciones', path: '/inscripciones', icon: UserPlus,        roles: ['director','sistemas','administrador','secretaria'] },
    ],
  },
  {
    label: 'Finanzas',
    items: [
      { name: 'Cobranza', path: '/cobranza', icon: Calculator, roles: ['director','cobranza','administrador','cajero'] },
      { name: 'Reportes', path: '/reportes', icon: BarChart3,  roles: ['director','cobranza','administrador'] },
      { name: 'Nómina',   path: '/nomina',   icon: Banknote,   roles: ['director','administrador'] },
    ],
  },
  {
    label: 'Sistema',
    items: [
      { name: 'Configuración', path: '/configuracion', icon: Wrench,    roles: ['director','sistemas','administrador'] },
      { name: 'Sistemas',  path: '/sistemas',  icon: Monitor,   roles: ['director','sistemas','administrador'] }, 
      { name: 'Auditoría', path: '/auditoria', icon: ShieldCheck, roles: ['director','sistemas','administrador'] },
    ],
  },
];

const Sidebar = () => {
  const { user, logout, loading } = useContext(AuthContext);
  const navigate = useNavigate();
  const location = useLocation();

  // CORREGIDO: Extracción robusta y normalización del rol a minúsculas
  const rawRole =
    user?.perfil?.rol ||
    user?.rol ||
    user?.data?.rol ||
    user?.user?.rol ||
    localStorage.getItem('user_role') ||
    '';
    
  const userRole = rawRole.toLowerCase().trim();
  const initials = (user?.username || 'U').slice(0, 2).toUpperCase();

  const handleLogout = () => { logout(); navigate('/login'); };

  if (loading) return (
    <div className="w-52 h-screen flex items-center justify-center" style={{ background: 'var(--porcelain)' }}>
      <Loader2 className="animate-spin" size={24} style={{ color: 'var(--pb)' }} />
    </div>
  );

  if (!user) return null;

  return (
    <div
      className="w-52 h-screen flex flex-col fixed left-0 top-0"
      style={{ background: 'var(--porcelain)', borderRight: '0.5px solid var(--border-md)' }}
    >
      {/* Logo */}
      <div
        className="flex items-center gap-3 px-4 py-[18px]"
        style={{ borderBottom: '0.5px solid var(--border)' }}
      >
        <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'var(--pb)' }}>
          <Octagon size={15} color="#fff" />
        </div>
        <div>
          <p className="text-sm font-medium leading-none" style={{ color: 'var(--jet)' }}>Octopus</p>
          <p className="text-[10px] tracking-widest mt-0.5" style={{ color: 'var(--ash)' }}>ERP v2</p>
        </div>
      </div>

      {/* Usuario */}
      <div
        className="mx-2.5 my-2.5 p-3 rounded-xl flex items-center gap-2.5"
        style={{ background: 'var(--porcelain)', border: '0.5px solid var(--border-md)' }}
      >
        <div
          className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-medium flex-shrink-0"
          style={{ background: 'var(--pb)' }}
        >
          {initials}
        </div>
        <div className="min-w-0">
          <p className="text-xs font-medium truncate" style={{ color: 'var(--jet)' }}>
            {user?.username || 'Usuario'}
          </p>
          <span
            className="text-[10px] px-2 py-0.5 rounded-full mt-0.5 inline-block capitalize"
            style={{ background: 'var(--pb-light)', color: 'var(--pb-mid)' }}
          >
            {userRole || 'Sin rol'}
          </span>
        </div>
      </div>

      {/* Navegación */}
      <nav className="flex-1 overflow-y-auto px-2 pb-2 custom-scrollbar">
        {navSections.map((section, sIdx) => {
          const visible = section.items.filter(item => item.roles.includes(userRole));
          if (!visible.length) return null;
          return (
            <div
              key={section.label}
              className="mb-1 anim-slide-in"
              style={{ animationDelay: `${sIdx * 60}ms` }}
            >
              <label
                className="block text-[11px] uppercase tracking-widest px-4 py-2"
                style={{ color: 'var(--ash)' }}
              >
                {section.label}
              </label>
              <div className="space-y-0.5">
                {visible.map((item, iIdx) => {
                  const Icon = item.icon;
                  const isActive =
                    location.pathname === item.path ||
                    (item.path === '/dashboard' && location.pathname === '/');
                  return (
                    <Link
                      key={item.name}
                      to={item.path}
                      className="anim-fade-up flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all relative overflow-hidden"
                      style={{
                        animationDelay: `${sIdx * 60 + iIdx * 35}ms`,
                        ...(isActive
                          ? { background: 'var(--pb)', color: '#fff', fontWeight: 500 }
                          : { color: 'var(--ash)' })
                      }}
                      onMouseEnter={e => {
                        if (!isActive) {
                          e.currentTarget.style.background = 'var(--ash-light)';
                          e.currentTarget.style.color = 'var(--jet)';
                          e.currentTarget.style.paddingLeft = '14px';
                        }
                      }}
                      onMouseLeave={e => {
                        if (!isActive) {
                          e.currentTarget.style.background = 'transparent';
                          e.currentTarget.style.color = 'var(--ash)';
                          e.currentTarget.style.paddingLeft = '12px';
                        }
                      }}
                    >
                      <Icon size={15} />
                      <span>{item.name}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      {/* Logout */}
      <div className="p-2" style={{ borderTop: '0.5px solid var(--border)' }}>
        <button
          onClick={handleLogout}
          className="flex items-center gap-2.5 w-full px-4 py-2 rounded-lg text-sm transition-all"
          style={{ color: 'var(--ash)' }}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--red-light)'; e.currentTarget.style.color = 'var(--red)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--ash)'; }}
        >
          <LogOut size={15} />
          <span>Cerrar sesión</span>
        </button>
      </div>
    </div>
  );
};

export default Sidebar;