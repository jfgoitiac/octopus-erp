import { useContext, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { RefreshCw, TrendingUp } from 'lucide-react';
import { toast } from 'react-toastify';
import Sidebar from './Sidebar';
import { AuthContext } from '../context/AuthContext';
import { useTasaBCV } from '../hooks/useTasaBCV';
import axiosInstance from '../api/apiClient';

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
};

const FULL_HEIGHT_PAGES = ['/recibos'];

const MainLayout = () => {
  const { user } = useContext(AuthContext);
  const location = useLocation();
  const title = PAGE_TITLES[location.pathname] || 'Octopus ERP';
  const initials = (user?.username || 'U').slice(0, 2).toUpperCase();
  const isFullPage = FULL_HEIGHT_PAGES.includes(location.pathname);

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
      <Sidebar />

      <div className="flex flex-col ml-52" style={{ height: '100vh', overflow: 'hidden' }}>
        {/* Topbar */}
        <header
          className="flex-shrink-0 z-40 h-[50px] flex items-center justify-between px-5 glass"
          style={{ borderBottom: '0.5px solid var(--border-md)' }}
        >
          <h1 className="text-lg font-medium" style={{ color: 'var(--jet)' }}>{title}</h1>

          <div className="flex items-center gap-2.5">
            <span className="text-xs hidden md:block capitalize" style={{ color: 'var(--ash)' }}>
              {today}
            </span>
            <button
              onClick={handleSyncBCV}
              disabled={syncing || loadingTasa}
              title={ultimaActualizacion
                ? `Actualizado: ${ultimaActualizacion.toLocaleTimeString('es-VE')} · Clic para sincronizar`
                : 'Sincronizar tasa BCV'}
              className="flex items-center gap-1.5 px-2.5 h-7 rounded-lg text-xs font-medium transition-all disabled:opacity-60"
              style={{
                border: `0.5px solid ${tasaError ? '#fca5a5' : 'var(--border-md)'}`,
                background: tasaError ? '#fef2f2' : 'var(--porcelain)',
                color: tasaError ? '#dc2626' : 'var(--jet)',
              }}
            >
              <TrendingUp size={13} style={{ color: tasaError ? '#dc2626' : 'var(--pb)' }} />
              <span className="hidden sm:inline" style={{ color: 'var(--ash)' }}>BCV</span>
              <span className="font-mono font-semibold tracking-tight">
                {loadingTasa ? '···' : tasa > 0
                  ? `Bs. ${tasa.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                  : '—'}
              </span>
              <RefreshCw
                size={11}
                className={syncing ? 'animate-spin' : ''}
                style={{ color: 'var(--ash)', flexShrink: 0 }}
              />
            </button>
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-medium"
              style={{ background: 'var(--pb)' }}
            >
              {initials}
            </div>
          </div>
        </header>

        {/* Contenido */}
        <main className={`flex-1 min-h-0 ${isFullPage ? 'overflow-hidden' : 'overflow-y-auto p-6'}`}>
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default MainLayout;