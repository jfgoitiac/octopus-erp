import { useState, useEffect } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { LogOut, GraduationCap, Lock } from 'lucide-react';
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
              className="flex items-center gap-1 text-gray-400 hover:text-[#0fa3b1] transition-colors text-sm"
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

      {/* Contenido principal */}
      <main className="max-w-[480px] mx-auto px-4 py-5 pb-10">
        <Outlet />
      </main>
    </div>
  );
};

export default PortalLayout;
