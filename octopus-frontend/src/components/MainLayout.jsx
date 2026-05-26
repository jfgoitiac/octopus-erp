import { useContext } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Bell } from 'lucide-react';
import Sidebar from './Sidebar';
import { AuthContext } from '../context/AuthContext';

const PAGE_TITLES = {
  '/':             'Panel de control',
  '/dashboard':    'Panel de control',
  '/inscripciones':'Inscripciones',
  '/cobranza':     'Cobranza',
  '/alumnos':      'Lista de alumnos',
  '/reportes':     'Reportes',
  '/sistemas':     'Configuración del sistema',
  '/configuracion':'Configuración',
  '/nomina':       'Nómina',
  '/auditoria':    'Auditoría',
  '/representantes': 'Representantes',
  '/morosos':        'Alumnos en mora',
};

const MainLayout = () => {
  const { user } = useContext(AuthContext);
  const location = useLocation();
  const title = PAGE_TITLES[location.pathname] || 'Octopus ERP';
  const initials = (user?.username || 'U').slice(0, 2).toUpperCase();

  const today = new Date().toLocaleDateString('es-VE', {
    weekday: 'short', day: 'numeric', month: 'long', year: 'numeric',
  });

  return (
    <div className="flex min-h-screen" style={{ background: 'var(--bg)' }}>
      <Sidebar />

      <div className="flex-1 flex flex-col ml-52">
        {/* Topbar */}
        <header
          className="sticky top-0 z-40 h-[50px] flex items-center justify-between px-5"
          style={{ background: 'var(--porcelain)', borderBottom: '0.5px solid var(--border-md)' }}
        >
          <h1 className="text-lg font-medium" style={{ color: 'var(--jet)' }}>{title}</h1>

          <div className="flex items-center gap-2.5">
            <span className="text-xs hidden md:block capitalize" style={{ color: 'var(--ash)' }}>
              {today}
            </span>
            <button
              className="w-7 h-7 rounded-lg flex items-center justify-center transition-all"
              style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)', color: 'var(--ash)' }}
            >
              <Bell size={18} />
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
        <main className="flex-1 p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default MainLayout;