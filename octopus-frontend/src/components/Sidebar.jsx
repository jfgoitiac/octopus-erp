import { useContext } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import {
  LayoutDashboard, UserPlus, Users, Calculator,
  BarChart3, Wrench, LogOut, Octagon, ShieldCheck,
  Loader2, Banknote, Monitor, Contact, AlertTriangle, GraduationCap, ReceiptText, GitCompareArrows
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
      { name: 'Grados',        path: '/grados',        icon: GraduationCap,   roles: ['director','sistemas','administrador','secretaria','docente'] },
    ],
  },
  {
    label: 'Finanzas',
    items: [
      { name: 'Cobranza',      path: '/cobranza',      icon: Calculator,   roles: ['director','cobranza','administrador','cajero'] },
      { name: 'Comprobantes',  path: '/comprobantes',  icon: ReceiptText,  roles: ['director','cobranza','administrador','cajero','sistemas'] },
      { name: 'Reportes',      path: '/reportes',      icon: BarChart3,    roles: ['director','cobranza','administrador'] },
      { name: 'Nómina',        path: '/nomina',        icon: Banknote,          roles: ['director','administrador'] },
      { name: 'Conciliador',  path: '/conciliador',   icon: GitCompareArrows,  roles: ['director','sistemas','administrador','cobranza'] },
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
        className="flex items-center gap-3 px-4 py-[18px] relative overflow-hidden"
        style={{ borderBottom: '0.5px solid var(--border)' }}
      >
        {/* Fondo decorativo sutil */}
        <div
          className="absolute inset-0 opacity-[0.04] pointer-events-none"
          style={{ background: 'radial-gradient(ellipse 120% 100% at -10% 50%, var(--pb) 0%, transparent 65%)' }}
        />
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 glow-pulse"
          style={{ background: 'linear-gradient(135deg, var(--pb) 0%, var(--pb-mid) 100%)' }}
        >
          <Octagon size={15} color="#fff" />
        </div>
        <div>
          <p className="text-sm font-semibold leading-none text-gradient">Octopus</p>
          <p className="text-[10px] tracking-widest mt-0.5" style={{ color: 'var(--ash)' }}>ERP v2</p>
        </div>
      </div>

      {/* Usuario */}
      <div
        className="mx-2.5 my-2.5 p-3 rounded-xl flex items-center gap-2.5 glass"
      >
        <div
          className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-medium flex-shrink-0"
          style={{ background: 'linear-gradient(135deg, var(--pb) 0%, var(--pb-mid) 100%)', boxShadow: '0 2px 8px rgba(15,163,177,0.35)' }}
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
                      className="anim-fade-up flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm relative overflow-hidden"
                      style={{
                        animationDelay: `${sIdx * 60 + iIdx * 35}ms`,
                        transition: 'background 0.18s ease, color 0.18s ease, transform 0.18s ease, box-shadow 0.18s ease',
                        ...(isActive
                          ? {
                              background: 'linear-gradient(135deg, var(--pb) 0%, var(--pb-mid) 100%)',
                              color: '#fff',
                              fontWeight: 500,
                              transform: 'translateX(3px)',
                              boxShadow: '0 4px 14px rgba(15,163,177,0.35), 0 1px 4px rgba(15,163,177,0.2)',
                            }
                          : { color: 'var(--ash)', transform: 'translateX(0)' })
                      }}
                      onMouseEnter={e => {
                        if (!isActive) {
                          e.currentTarget.style.background = 'var(--ash-light)';
                          e.currentTarget.style.color = 'var(--jet)';
                          e.currentTarget.style.transform = 'translateX(4px)';
                          e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)';
                        }
                      }}
                      onMouseLeave={e => {
                        if (!isActive) {
                          e.currentTarget.style.background = 'transparent';
                          e.currentTarget.style.color = 'var(--ash)';
                          e.currentTarget.style.transform = 'translateX(0)';
                          e.currentTarget.style.boxShadow = 'none';
                        }
                      }}
                      onMouseDown={e => {
                        e.currentTarget.style.transform = 'translateX(2px) scale(0.96)';
                        e.currentTarget.style.boxShadow = 'none';
                      }}
                      onMouseUp={e => {
                        if (!isActive) {
                          e.currentTarget.style.transform = 'translateX(4px)';
                          e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)';
                        } else {
                          e.currentTarget.style.transform = 'translateX(3px)';
                          e.currentTarget.style.boxShadow = '0 3px 10px rgba(0,0,0,0.18)';
                        }
                      }}
                    >
                      {isActive && (
                        <span
                          className="absolute left-0 top-1/2 rounded-r-full"
                          style={{
                            width: 3,
                            height: '60%',
                            background: 'rgba(255,255,255,0.7)',
                            transform: 'translateY(-50%)',
                          }}
                        />
                      )}
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
          className="flex items-center gap-2.5 w-full px-4 py-2 rounded-lg text-sm"
          style={{ color: 'var(--ash)', transition: 'background 0.18s ease, color 0.18s ease, transform 0.18s ease' }}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--red-light)'; e.currentTarget.style.color = 'var(--red)'; e.currentTarget.style.transform = 'translateX(4px)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--ash)'; e.currentTarget.style.transform = 'translateX(0)'; }}
          onMouseDown={e => { e.currentTarget.style.transform = 'translateX(2px) scale(0.96)'; }}
          onMouseUp={e => { e.currentTarget.style.transform = 'translateX(4px)'; }}
        >
          <LogOut size={15} />
          <span>Cerrar sesión</span>
        </button>
      </div>
    </div>
  );
};

export default Sidebar;