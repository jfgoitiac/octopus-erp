import { useContext } from 'react';
import { Outlet, useNavigate, useLocation, NavLink, Link } from 'react-router-dom';
import { LogOut, GraduationCap, LayoutDashboard, Home, ArrowLeft, BookOpen, MessageCircle, AlertTriangle, UserCircle } from 'lucide-react';
import { AuthContext } from '../../context/AuthContext';
import { useConfigColegio } from '../hooks/useConfigColegio';
import DesktopRail from './DesktopRail';

const DocenteLayout = () => {
  const { logout } = useContext(AuthContext);
  const { nombre_colegio: nombreColegio, logo_url: logoColegio } = useConfigColegio();
  const navigate = useNavigate();
  const location = useLocation();
  const enDashboard = location.pathname === '/portal-docente' || location.pathname === '/portal-docente/';

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="min-h-screen bg-[var(--docente-bg)]">
      <DesktopRail />

      {/* Header */}
      <header className="bg-white border-b border-gray-100 sticky top-0 z-10 md:pl-20">
        <div className="max-w-[480px] md:max-w-7xl mx-auto px-4 md:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {enDashboard ? (
              logoColegio ? (
                <img
                  src={logoColegio}
                  alt={nombreColegio || 'Logo del colegio'}
                  className="h-7 w-auto object-contain md:hidden"
                  onError={e => { e.target.style.display = 'none'; }}
                />
              ) : (
                <GraduationCap size={22} className="md:hidden" style={{ color: 'var(--docente-primary)' }} />
              )
            ) : (
              <>
                <button
                  onClick={() => navigate(-1)}
                  aria-label="Regresar"
                  className="text-gray-400 hover:text-gray-600 transition-colors -ml-1 p-1"
                >
                  <ArrowLeft size={20} />
                </button>
                <Link
                  to="/portal-docente"
                  aria-label="Ir al inicio"
                  className="text-gray-400 hover:text-gray-600 transition-colors p-1"
                >
                  <Home size={20} />
                </Link>
              </>
            )}
            <span className={`font-semibold text-gray-800 text-sm ${enDashboard ? '' : 'hidden sm:inline'}`}>
              Portal Docente
            </span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 text-gray-500 hover:text-red-500 transition-colors text-sm"
              aria-label="Cerrar sesión"
            >
              <LogOut size={16} />
              <span className="hidden sm:inline">Salir</span>
            </button>
          </div>
        </div>
      </header>

      {/* Contenido principal — pb-32 para que la bottom nav no tape contenido */}
      <main className="max-w-[480px] md:max-w-7xl mx-auto px-4 md:px-6 py-5 pb-32 sm:pb-10 md:pl-20">
        <Outlet />
      </main>

      {/* Bottom navigation — solo móvil */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 z-10 sm:hidden">
        <div className="max-w-[480px] mx-auto flex items-center justify-around">
          <NavLink
            to="/portal-docente"
            end
            className={({ isActive }) =>
              `flex flex-col items-center gap-0.5 py-2 px-2 min-h-[56px] justify-center transition-colors ${isActive ? 'text-[var(--docente-primary)]' : 'text-gray-400'}`
            }
          >
            <LayoutDashboard size={22} />
            <span className="text-[10px] font-medium">Inicio</span>
          </NavLink>
          <NavLink
            to="/portal-docente/materias"
            className={({ isActive }) =>
              `flex flex-col items-center gap-0.5 py-2 px-2 min-h-[56px] justify-center transition-colors ${isActive ? 'text-[var(--docente-primary)]' : 'text-gray-400'}`
            }
          >
            <BookOpen size={22} />
            <span className="text-[10px] font-medium">Mis Materias</span>
          </NavLink>
          <NavLink
            to="/portal-docente/mensajes"
            className={({ isActive }) =>
              `flex flex-col items-center gap-0.5 py-2 px-2 min-h-[56px] justify-center transition-colors ${isActive ? 'text-[var(--docente-primary)]' : 'text-gray-400'}`
            }
          >
            <MessageCircle size={22} />
            <span className="text-[10px] font-medium">Mensajes</span>
          </NavLink>
          <NavLink
            to="/portal-docente/incidentes"
            className={({ isActive }) =>
              `flex flex-col items-center gap-0.5 py-2 px-2 min-h-[56px] justify-center transition-colors ${isActive ? 'text-[var(--docente-primary)]' : 'text-gray-400'}`
            }
          >
            <AlertTriangle size={22} />
            <span className="text-[10px] font-medium">Incidentes</span>
          </NavLink>
          <NavLink
            to="/portal-docente/perfil"
            className={({ isActive }) =>
              `flex flex-col items-center gap-0.5 py-2 px-2 min-h-[56px] justify-center transition-colors ${isActive ? 'text-[var(--docente-primary)]' : 'text-gray-400'}`
            }
          >
            <UserCircle size={22} />
            <span className="text-[10px] font-medium">Perfil</span>
          </NavLink>
        </div>
      </nav>
    </div>
  );
};

export default DocenteLayout;
