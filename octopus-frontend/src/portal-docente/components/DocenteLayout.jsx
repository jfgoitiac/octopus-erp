import { useContext, useEffect } from 'react';
import { Outlet, useNavigate, useLocation, NavLink, Link } from 'react-router-dom';
import { LogOut, GraduationCap, LayoutDashboard, Home, ArrowLeft, BookOpen, MessageCircle, AlertTriangle, UserCircle } from 'lucide-react';
import { AuthContext } from '../../context/AuthContext';
import { useConfigColegio } from '../hooks/useConfigColegio';
import BotonNotificacionesPush from '../../components/BotonNotificacionesPush';
import DesktopRail from './DesktopRail';
import { enviarPendientes } from '../utils/colaAsistencia';

const NAV_ITEMS = [
  { to: '/portal-docente', end: true, icon: LayoutDashboard, label: 'Inicio' },
  { to: '/portal-docente/materias', icon: BookOpen, label: 'Materias' },
  { to: '/portal-docente/mensajes', icon: MessageCircle, label: 'Mensajes' },
  { to: '/portal-docente/incidentes', icon: AlertTriangle, label: 'Incidentes' },
  { to: '/portal-docente/perfil', icon: UserCircle, label: 'Perfil' },
];

const DocenteLayout = () => {
  const { logout } = useContext(AuthContext);
  const { nombre_colegio: nombreColegio, logo_url: logoColegio } = useConfigColegio();
  const navigate = useNavigate();
  const location = useLocation();
  const enDashboard = location.pathname === '/portal-docente' || location.pathname === '/portal-docente/';

  // Asistencia guardada sin conexión: se reenvía al entrar al portal y cada
  // vez que vuelve la señal, esté donde esté el docente dentro del portal.
  useEffect(() => {
    enviarPendientes();
    window.addEventListener('online', enviarPendientes);
    return () => window.removeEventListener('online', enviarPendientes);
  }, []);

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="min-h-dvh bg-[var(--docente-bg)]">
      <DesktopRail />

      {/* Header */}
      <header className="bg-[var(--surface)] border-b border-[var(--border)] sticky top-0 z-10 md:pl-20">
        <div className="max-w-[480px] sm:max-w-2xl md:max-w-7xl mx-auto px-4 md:px-6 h-14 flex items-center justify-between">
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
                  className="text-[var(--ash)] hover:text-[var(--jet-mid)] transition-colors -ml-2 p-2.5"
                >
                  <ArrowLeft size={20} />
                </button>
                <Link
                  to="/portal-docente"
                  aria-label="Ir al inicio"
                  className="text-[var(--ash)] hover:text-[var(--jet-mid)] transition-colors p-2.5"
                >
                  <Home size={20} />
                </Link>
              </>
            )}
            <span className={`font-semibold text-[var(--jet)] text-sm ${enDashboard ? '' : 'hidden sm:inline'}`}>
              Portal Docente
            </span>
          </div>
          <div className="flex items-center gap-3">
            <BotonNotificacionesPush variante="claro" />
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 text-[var(--ash)] hover:text-[var(--red)] transition-colors text-sm min-h-[44px] px-2"
              aria-label="Cerrar sesión"
            >
              <LogOut size={16} />
              <span className="hidden sm:inline">Salir</span>
            </button>
          </div>
        </div>
      </header>

      {/* Contenido principal — pb-28 para que la bottom nav no tape contenido */}
      <main className="max-w-[480px] sm:max-w-2xl md:max-w-7xl mx-auto px-4 md:px-6 py-5 pb-28 md:pb-10 md:pl-20">
        <Outlet />
      </main>

      {/* Bottom navigation — hasta md; desde md lo reemplaza DesktopRail */}
      <nav className="fixed bottom-0 left-0 right-0 bg-[var(--surface)] border-t border-[var(--border)] z-10 md:hidden pb-[env(safe-area-inset-bottom)]">
        <div className="max-w-[480px] sm:max-w-2xl mx-auto flex items-stretch">
          {NAV_ITEMS.map(({ to, end, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex flex-1 flex-col items-center gap-0.5 py-2 px-1 min-h-[56px] justify-center transition-colors ${isActive ? 'text-[var(--docente-primary)]' : 'text-[var(--ash)]'}`
              }
            >
              <Icon size={22} />
              <span className="text-[11px] font-medium">{label}</span>
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
};

export default DocenteLayout;
