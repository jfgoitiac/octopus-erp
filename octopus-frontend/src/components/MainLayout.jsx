import { useContext, useState, useEffect, useRef } from 'react';
import { Outlet, useLocation, useNavigate, Link } from 'react-router-dom';
import { RefreshCw, TrendingUp, Menu, LogOut } from 'lucide-react';
import { toast } from 'react-toastify';
import Sidebar from './Sidebar';
import { AuthContext } from '../context/AuthContext';
import { useTasaBCV } from '../hooks/useTasaBCV';
import axiosInstance from '../api/apiClient';
import { inicialesUsuario } from '../utils/nombreUsuario';
import octopusSymbol from '../assets/octopus-symbol.svg';

const PAGE_TITLES = {
  '/':                   'Panel de control',
  '/dashboard':          'Panel de control',
  '/inscripciones':      'Inscripciones',
  '/cobranza':           'Cobranza',
  '/cobranza/dashboard': 'Dashboard de Cobranza',
  '/comprobantes':       'Comprobantes',
  '/alumnos':            'Lista de alumnos',
  '/grados':             'Grados',
  '/reportes':           'Reportes',
  '/sistemas':           'Configuración del sistema',
  '/configuracion':      'Configuración',
  '/nomina':             'Nómina',
  '/pagos':              'Pagos',
  '/recibos':            'Recibos de Pago',
  '/conciliador':        'Conciliador',
  '/auditoria':          'Auditoría',
  '/representantes':     'Representantes',
  '/morosos':            'Alumnos en mora',
  '/gestion-sitio':      'Sitio Institucional',
  '/notas':              'Registro de Notas',
  '/boletin':            'Boletines',
  '/asistencia':         'Asistencia',
  '/horarios':           'Horarios',
  '/materias':           'Materias',
  '/docentes':           'Docentes',
  '/incidentes':         'Incidentes',
  '/rendimiento':        'Rendimiento Académico',
  '/comunicacion':       'Comunicación',
  '/multisede':          'Multi-sede',
  '/multisede/sedes':    'Sedes',
};

const FULL_HEIGHT_PAGES = ['/recibos'];

const MainLayout = () => {
  const { user, logout } = useContext(AuthContext);
  const location = useLocation();
  const navigate = useNavigate();
  const title = PAGE_TITLES[location.pathname] || 'Octopus ERP';
  const initials = inicialesUsuario(user);
  const isFullPage = FULL_HEIGHT_PAGES.includes(location.pathname);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef(null);

  useEffect(() => { setSidebarOpen(false); setProfileOpen(false); }, [location.pathname]);

  useEffect(() => {
    if (!profileOpen) return;
    const handleClickOutside = (e) => {
      if (profileRef.current && !profileRef.current.contains(e.target)) setProfileOpen(false);
    };
    const handleEscape = (e) => { if (e.key === 'Escape') setProfileOpen(false); };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [profileOpen]);

  const handleLogout = () => { logout(); navigate('/login'); };

  const { tasa, loading: loadingTasa, error: tasaError, ultimaActualizacion, refetch } = useTasaBCV();
  const [syncing, setSyncing] = useState(false);

  const handleSyncBCV = async () => {
    setSyncing(true);
    try {
      await toast.promise(
        axiosInstance.post('cobranza/sincronizar-tasa/', {}),
        {
          pending: 'Sincronizando tasa BCV...',
          success: { render: ({ data }) => `Tasa actualizada a Bs. ${data.data.valor}` },
          error:   { render: ({ data }) => data?.response?.data?.error || data?.response?.data?.detail || 'No se pudo sincronizar la tasa' },
        }
      );
      await refetch();
    } finally {
      setSyncing(false);
    }
  };

  const today = new Date().toLocaleDateString('es-VE', {
    weekday: 'short', day: 'numeric', month: 'long', year: 'numeric',
  });

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      <div className="print:hidden">
        <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      </div>

      <div className="md:ml-[var(--sidebar-w)] print:ml-0 relative" style={{ height: '100dvh', overflow: 'hidden' }}>
        {/* Topbar — ancho completo, por encima del sidebar (opción (a): sin left-*, el sidebar arranca debajo de ella) */}
        <header
          className="topbar-surface fixed inset-x-0 top-0 z-50 h-[var(--topbar-h)] md:h-[var(--topbar-h-lg)] flex items-center gap-2 sm:gap-3 justify-between px-4 md:px-5 print:hidden"
          style={{
            boxShadow: 'inset 0 1px 0 var(--topbar-hairline), var(--topbar-shadow)',
          }}
        >
          <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
            <Link
              to="/dashboard"
              className="flex-shrink-0 flex items-center justify-center min-w-10 min-h-10 -ml-2 -mr-2 rounded-lg transition-colors hover:bg-[var(--topbar-border)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
              style={{ outlineColor: 'var(--topbar-fg)' }}
              aria-label="Ir al panel de control"
            >
              <img
                src={octopusSymbol}
                alt="Octopus"
                className="h-8 md:h-9 lg:h-10 w-auto object-contain"
              />
            </Link>
            <span className="hidden sm:inline text-lg md:text-xl font-semibold flex-shrink-0" style={{ color: 'var(--topbar-fg)' }}>
              Schools
            </span>
            <span
              className="hidden sm:block flex-shrink-0 self-stretch w-px my-3"
              style={{ background: 'var(--topbar-border)' }}
            />
            <button
              className="md:hidden p-1.5 rounded-lg flex-shrink-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
              onClick={() => setSidebarOpen(true)}
              style={{ color: 'var(--topbar-fg)', outlineColor: 'var(--topbar-fg)' }}
              aria-label="Abrir menú"
            >
              <Menu size={20} />
            </button>
            <h1 className="text-base md:text-lg font-medium truncate" style={{ color: 'var(--topbar-fg)' }}>{title}</h1>
          </div>

          <div className="flex items-center gap-1.5 md:gap-2.5 flex-shrink-0">
            <span
              className="hidden lg:flex items-center h-7 px-3 rounded-full text-xs capitalize"
              style={{ background: 'rgba(0,0,0,0.18)', color: 'var(--topbar-fg-dim)' }}
            >
              {today}
            </span>
            <button
              onClick={handleSyncBCV}
              disabled={syncing || loadingTasa}
              title={ultimaActualizacion
                ? `Actualizado: ${ultimaActualizacion.toLocaleTimeString('es-VE')} · Clic para sincronizar`
                : 'Sincronizar tasa BCV'}
              className="flex items-center gap-1.5 px-2.5 md:px-3 h-7 rounded-full text-xs font-medium transition-all disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
              style={{
                background: tasaError ? '#fef2f2' : 'rgba(0,0,0,0.18)',
                color: tasaError ? '#991b1b' : 'var(--topbar-fg)',
                outlineColor: 'var(--topbar-fg)',
              }}
            >
              <TrendingUp size={13} style={{ color: tasaError ? '#991b1b' : 'var(--topbar-fg)' }} />
              <span className="hidden sm:inline" style={{ color: tasaError ? '#991b1b' : 'var(--topbar-fg-dim)' }}>BCV</span>
              <span className="font-mono font-semibold tracking-tight">
                {loadingTasa ? '···' : tasa > 0
                  ? `Bs. ${tasa.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                  : '—'}
              </span>
              <RefreshCw
                size={11}
                className={syncing ? 'animate-spin' : ''}
                style={{ color: tasaError ? '#991b1b' : 'var(--topbar-fg-dim)', flexShrink: 0 }}
              />
            </button>
            <div className="relative" ref={profileRef}>
              <button
                type="button"
                onClick={() => setProfileOpen((v) => !v)}
                aria-haspopup="menu"
                aria-expanded={profileOpen}
                aria-label="Menú de perfil"
                className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                style={{ background: 'rgba(0,0,0,0.18)', color: 'var(--topbar-fg)', outlineColor: 'var(--topbar-fg)' }}
              >
                {initials}
              </button>
              {profileOpen && (
                <div
                  role="menu"
                  className="absolute right-0 top-[calc(100%+10px)] w-56 max-w-[calc(100vw-2rem)] rounded-xl overflow-hidden z-50"
                  style={{ background: 'var(--bg)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-lg)' }}
                >
                  <button
                    type="button"
                    role="menuitem"
                    onClick={handleLogout}
                    className="flex items-center gap-2.5 w-full px-3.5 py-2.5 text-sm transition-colors hover:bg-[var(--red-light)]"
                    style={{ color: 'var(--ash)' }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--red)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--ash)'; }}
                  >
                    <LogOut size={15} />
                    Cerrar sesión
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Rellenos de esquina — mismo fondo que la barra superior, quedan detrás del
            sidebar y del <main>; el redondeo de esos dos elementos "recorta" su propia
            esquina y deja asomar este relleno, para que el color coincida exactamente
            con la barra en vez de aproximarlo con un color plano. */}
        <div
          aria-hidden="true"
          className="topbar-surface fixed left-0 top-[var(--topbar-h)] md:top-[var(--topbar-h-lg)] z-0 w-[calc(var(--shell-radius)/2)] h-[calc(var(--shell-radius)/2)] md:w-[var(--shell-radius)] md:h-[var(--shell-radius)] print:hidden"
        />
        <div
          aria-hidden="true"
          className="topbar-surface fixed right-0 top-[var(--topbar-h)] md:top-[var(--topbar-h-lg)] z-0 w-[calc(var(--shell-radius)/2)] h-[calc(var(--shell-radius)/2)] md:w-[var(--shell-radius)] md:h-[var(--shell-radius)] print:hidden"
        />

        {/* Rellenos de esquina inferior — mismo truco que arriba: un color plano fijo
            detrás, que la esquina redondeada del sidebar/main recorta y deja asomar. */}
        <div
          aria-hidden="true"
          className="fixed left-0 bottom-0 z-0 w-[calc(var(--shell-radius)*2.5)] h-[calc(var(--shell-radius)*2.5)] md:w-[calc(var(--shell-radius)*5)] md:h-[calc(var(--shell-radius)*5)] print:hidden"
          style={{ background: 'linear-gradient(135deg, var(--pb) 0%, var(--pb-mid) 100%)' }}
        />
        <div
          aria-hidden="true"
          className="fixed right-0 bottom-0 z-0 w-[calc(var(--shell-radius)*2.5)] h-[calc(var(--shell-radius)*2.5)] md:w-[calc(var(--shell-radius)*5)] md:h-[calc(var(--shell-radius)*5)] print:hidden"
          style={{ background: 'linear-gradient(135deg, var(--pb) 0%, var(--pb-mid) 100%)' }}
        />

        {/* Contenido — el padding superior compensa la barra fija, que queda por encima.
            El scroll vive en un div interno que arranca debajo de la esquina redondeada:
            el scrollbar del navegador no respeta border-radius, así que si el propio
            elemento con overflow-y-auto tuviera la esquina redondeada, la barra la taparía. */}
        <main
          className="absolute inset-x-0 bottom-0 top-[var(--topbar-h)] md:top-[var(--topbar-h-lg)] z-10 rounded-tr-[calc(var(--shell-radius)/2)] md:rounded-tr-[var(--shell-radius)] rounded-br-[calc(var(--shell-radius)/2)] md:rounded-br-[var(--shell-radius)] overflow-hidden"
          style={{ background: 'var(--bg)' }}
        >
          <div className={`h-full ${isFullPage ? 'overflow-hidden' : 'overflow-y-auto px-4 md:px-6 pt-4 md:pt-6 pb-4 md:pb-6'}`}>
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
};

export default MainLayout;