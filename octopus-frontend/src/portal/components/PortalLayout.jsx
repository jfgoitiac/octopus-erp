import { useState, useEffect } from 'react';
import { Outlet, useNavigate, NavLink } from 'react-router-dom';
import { LogOut, GraduationCap, Lock, Home, Receipt } from 'lucide-react';
import { usePortalAuth } from '../context/PortalAuthContext';
import { getConfigColegio } from '../api/portal.service';

const PortalLayout = () => {
  const { user, logout } = usePortalAuth();
  const navigate = useNavigate();
  const [configColegio, setConfigColegio] = useState({
    nombre_colegio: '',
    color_primario: '#0fa3b1',
    color_secundario: '#1f3864',
    logo_url: '',
  });

  useEffect(() => {
    getConfigColegio()
      .then(res => {
        const cfg = res.data;
        setConfigColegio(cfg);
        // Aplicar colores como CSS variables en el root del portal
        const root = document.documentElement;
        if (cfg.color_primario) root.style.setProperty('--portal-primary', cfg.color_primario);
        if (cfg.color_secundario) root.style.setProperty('--portal-secondary', cfg.color_secundario);
      })
      .catch(() => {}); // Si falla, usar colores por defecto
  }, []);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-[480px] mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {configColegio.logo_url ? (
              <img
                src={configColegio.logo_url}
                alt={configColegio.nombre_colegio || 'Logo del colegio'}
                className="h-8 w-auto object-contain"
                onError={e => { e.target.style.display = 'none'; }}
              />
            ) : (
              <GraduationCap size={22} style={{ color: 'var(--portal-primary, #0fa3b1)' }} />
            )}
            <span className="font-semibold text-gray-800 text-sm">
              {configColegio.nombre_colegio || 'Portal Escolar'}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/portal/cambiar-contrasena')}
              className="hidden sm:flex items-center gap-1 text-gray-400 hover:text-[#0fa3b1] transition-colors text-sm"
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
      <main className="max-w-[480px] mx-auto px-4 py-5 pb-32 sm:pb-10">
        <Outlet />
      </main>

      {/* Bottom navigation — solo móvil */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 z-10 sm:hidden">
        <div className="max-w-[480px] mx-auto flex items-center justify-around">
          <NavLink
            to="/portal"
            end
            className={({ isActive }) =>
              `flex flex-col items-center gap-0.5 py-2 px-6 min-h-[56px] justify-center transition-colors ${isActive ? 'text-[#0fa3b1]' : 'text-gray-400'}`
            }
          >
            <Home size={22} />
            <span className="text-[10px] font-medium">Inicio</span>
          </NavLink>
          <NavLink
            to="/portal/historial"
            className={({ isActive }) =>
              `flex flex-col items-center gap-0.5 py-2 px-6 min-h-[56px] justify-center transition-colors ${isActive ? 'text-[#0fa3b1]' : 'text-gray-400'}`
            }
          >
            <Receipt size={22} />
            <span className="text-[10px] font-medium">Historial</span>
          </NavLink>
          <NavLink
            to="/portal/cambiar-contrasena"
            className={({ isActive }) =>
              `flex flex-col items-center gap-0.5 py-2 px-6 min-h-[56px] justify-center transition-colors ${isActive ? 'text-[#0fa3b1]' : 'text-gray-400'}`
            }
          >
            <Lock size={22} />
            <span className="text-[10px] font-medium">Ajustes</span>
          </NavLink>
        </div>
      </nav>
    </div>
  );
};

export default PortalLayout;
