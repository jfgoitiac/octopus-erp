import { useState } from 'react';
import { Outlet, useNavigate, NavLink, useLocation } from 'react-router-dom';
import { LogOut, GraduationCap, Lock, Home, Receipt, Megaphone, MessageCircle, TrendingUp, UserCircle, CreditCard, Menu, X } from 'lucide-react';
import { usePortalAuth } from '../context/PortalAuthContext';
import { AlumnoActivoProvider } from '../context/AlumnoActivoContext';
import { useBranding } from '../../context/BrandingContext';
import NotificacionesModal from './NotificacionesModal';
import RepresentanteRail from './RepresentanteRail';

const PortalLayout = () => {
  const { logout } = usePortalAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { nombreColegio, logoUrl } = useBranding();
  const [menuAbierto, setMenuAbierto] = useState(false);
  const rutasSecundarias = ['/portal/mensajes', '/portal/rendimiento', '/portal/cantina', '/portal/perfil', '/portal/cambiar-contrasena'];
  const masActivo = rutasSecundarias.includes(location.pathname);

  return (
    <div className="portal-shell min-h-screen">
      <RepresentanteRail />

      {/* Header */}
      <header className="portal-topbar border-b sticky top-0 z-10">
        <div className="max-w-[480px] md:max-w-7xl mx-auto px-4 h-14 flex items-center justify-between md:pl-20">
          <div className="flex items-center gap-2">
            {logoUrl ? (
              <img
                src={logoUrl}
                alt={nombreColegio || 'Logo del colegio'}
                className="h-8 w-auto object-contain"
                onError={e => { e.target.style.display = 'none'; }}
              />
            ) : (
              <GraduationCap size={22} style={{ color: 'var(--portal-primary, #0fa3b1)' }} />
            )}
            <span className="font-semibold text-gray-800 text-sm">
              {nombreColegio || 'Portal Escolar'}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/portal/cambiar-contrasena')}
              className="hidden sm:flex items-center gap-1 text-gray-400 hover:text-[var(--portal-primary,#0fa3b1)] transition-colors text-sm"
              aria-label="Cambiar contraseña"
              title="Cambiar contraseña"
            >
              <Lock size={15} />
            </button>
            <button
              onClick={logout}
              className="flex items-center gap-1.5 text-gray-500 hover:text-red-500 transition-colors text-sm"
              aria-label="Cerrar sesión"
            >
              <LogOut size={16} />
              <span className="hidden sm:inline">Salir</span>
            </button>
          </div>
        </div>
      </header>

      {/* Contenido principal — pb-32 para que el botón flotante y la bottom nav no tapen contenido */}
      <main className="max-w-[480px] md:max-w-7xl mx-auto px-4 py-5 pb-32 sm:pb-10 md:pl-20">
        <AlumnoActivoProvider>
          <Outlet context={{ logoColegio: logoUrl }} />
        </AlumnoActivoProvider>
      </main>

      {/* Bottom navigation — solo móvil */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white/95 border-t border-slate-200/80 backdrop-blur-xl z-30 sm:hidden">
        <div className="max-w-[480px] mx-auto grid grid-cols-4">
          <NavLink
            to="/portal"
            end
            className={({ isActive }) =>
              `flex flex-col items-center gap-0.5 py-2 px-2 min-h-[60px] justify-center transition-colors ${isActive ? 'text-[var(--portal-primary,#0fa3b1)]' : 'text-slate-400'}`
            }
          >
            <Home size={22} />
            <span className="text-[10px] font-medium">Inicio</span>
          </NavLink>
          <NavLink
            to="/portal/historial"
            className={({ isActive }) =>
              `flex flex-col items-center gap-0.5 py-2 px-2 min-h-[60px] justify-center transition-colors ${isActive ? 'text-[var(--portal-primary,#0fa3b1)]' : 'text-slate-400'}`
            }
          >
            <Receipt size={22} />
            <span className="text-[10px] font-medium">Historial</span>
          </NavLink>
          <NavLink
            to="/portal/comunicaciones"
            className={({ isActive }) =>
              `flex flex-col items-center gap-0.5 py-2 px-2 min-h-[60px] justify-center transition-colors ${isActive ? 'text-[var(--portal-primary,#0fa3b1)]' : 'text-slate-400'}`
            }
          >
            <Megaphone size={22} />
            <span className="text-[10px] font-medium">Avisos</span>
          </NavLink>
          <button
            type="button"
            onClick={() => setMenuAbierto((abierto) => !abierto)}
            className={`flex flex-col items-center gap-0.5 py-2 px-2 min-h-[60px] justify-center transition-colors ${masActivo || menuAbierto ? 'text-[var(--portal-primary,#0fa3b1)]' : 'text-slate-400'}`}
            aria-label="Más opciones"
            aria-expanded={menuAbierto}
          >
            {menuAbierto ? <X size={22} /> : <Menu size={22} />}
            <span className="text-[10px] font-medium">Más</span>
          </button>
        </div>
      </nav>

      {menuAbierto && (
        <div className="fixed inset-0 z-20 sm:hidden" onClick={() => setMenuAbierto(false)}>
          <div className="absolute bottom-[61px] left-3 right-3 max-w-[456px] mx-auto portal-card p-2 grid grid-cols-2 gap-1" onClick={(event) => event.stopPropagation()}>
            {[
              { to: '/portal/mensajes', icon: MessageCircle, label: 'Mensajes' },
              { to: '/portal/rendimiento', icon: TrendingUp, label: 'Rendimiento' },
              { to: '/portal/cantina', icon: CreditCard, label: 'Cantina' },
              { to: '/portal/perfil', icon: UserCircle, label: 'Mi perfil' },
              { to: '/portal/cambiar-contrasena', icon: Lock, label: 'Seguridad' },
            ].map(({ to, icon: Icon, label }) => (
              <NavLink key={to} to={to} onClick={() => setMenuAbierto(false)} className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-[var(--portal-primary,#0fa3b1)]">
                <Icon size={18} /> {label}
              </NavLink>
            ))}
          </div>
        </div>
      )}

      <NotificacionesModal />
    </div>
  );
};

export default PortalLayout;
