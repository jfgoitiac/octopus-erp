import { useState, useEffect, useRef, useCallback } from 'react';
import { Outlet, NavLink, Link, useLocation } from 'react-router-dom';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { toast } from 'react-toastify';
import { LogOut, GraduationCap, Menu, X, Download } from 'lucide-react';
import { usePortalAuth } from '../context/PortalAuthContext';
import { AlumnoActivoProvider } from '../context/AlumnoActivoContext';
import { useBranding } from '../../context/BrandingContext';
import NotificacionesModal from './NotificacionesModal';
import RepresentanteRail from './RepresentanteRail';
import BannerInstalarApp from './BannerInstalarApp';
import useAccionInstalar from '../hooks/useAccionInstalar';
import { getDashboard } from '../api/portal.service';
import { NAV_PORTAL, iniciales } from './navPortal';

const NAV_PRINCIPAL = NAV_PORTAL.filter(item => item.principal);
const NAV_SECUNDARIA = NAV_PORTAL.filter(item => !item.principal);

const PortalLayout = () => {
  const { user, logout } = usePortalAuth();
  const { puedeInstalar, accionar: instalarApp, modal: modalInstalar } = useAccionInstalar();
  const location = useLocation();
  const { nombreColegio, logoUrl } = useBranding();
  const [menuAbierto, setMenuAbierto] = useState(false);
  const menuRef = useRef(null);
  const botonMasRef = useRef(null);
  const masActivo = NAV_SECUNDARIA.some(item => item.to === location.pathname);
  const nombre = [user?.nombre, user?.apellido].filter(Boolean).join(' ') || 'Representante';
  const hoy = format(new Date(), "EEEE d 'de' MMMM", { locale: es });
  const [resumen, setResumen] = useState(null);
  const [loadingResumen, setLoadingResumen] = useState(true);
  const [errorResumen, setErrorResumen] = useState(false);

  // Estado de cuenta para la tarjeta de saldo del riel. Se expone en el
  // contexto del Outlet para que las páginas puedan refrescarlo tras un pago.
  const cargarResumen = useCallback((signal) => getDashboard(signal)
    .then((res) => {
      setResumen(res.data?.resumen_financiero ?? null);
      setErrorResumen(false);
    })
    .catch((err) => {
      if (err.name === 'CanceledError' || err.code === 'ERR_CANCELED') return;
      setErrorResumen(true);
      toast.error('No se pudo cargar tu saldo. Intenta más tarde.', { toastId: 'portal-saldo' });
    })
    .finally(() => { if (!signal?.aborted) setLoadingResumen(false); }), []);

  useEffect(() => {
    const controller = new AbortController();
    cargarResumen(controller.signal);
    return () => controller.abort();
  }, [cargarResumen]);

  // El menú "Más" se cierra con Escape o tocando fuera de él (sin overlay).
  useEffect(() => {
    if (!menuAbierto) return;
    const alTeclear = (e) => { if (e.key === 'Escape') setMenuAbierto(false); };
    const alTocarFuera = (e) => {
      if (menuRef.current?.contains(e.target) || botonMasRef.current?.contains(e.target)) return;
      setMenuAbierto(false);
    };
    document.addEventListener('keydown', alTeclear);
    document.addEventListener('pointerdown', alTocarFuera);
    return () => {
      document.removeEventListener('keydown', alTeclear);
      document.removeEventListener('pointerdown', alTocarFuera);
    };
  }, [menuAbierto]);

  return (
    <div className="portal-shell min-h-dvh">
      <RepresentanteRail
        puedeInstalar={puedeInstalar}
        onInstalar={instalarApp}
        resumen={resumen}
        loadingResumen={loadingResumen}
        errorResumen={errorResumen}
      />

      <div className="md:pl-20 lg:pl-64">
        <header className="portal-topbar sticky top-0 z-10 border-b border-[var(--portal-line)]">
          <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6 lg:h-20 lg:px-10">
            {/* Celular y tablet: el colegio. Desde lg el riel ya lo muestra. */}
            <div className="flex min-w-0 items-center gap-2.5 lg:hidden">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[var(--portal-surface)] shadow-sm">
                {logoUrl ? (
                  <img src={logoUrl} alt="" className="h-6 w-6 object-contain" onError={e => { e.target.style.display = 'none'; }} />
                ) : (
                  <GraduationCap size={18} style={{ color: 'var(--portal-primary)' }} />
                )}
              </span>
              <span className="truncate text-sm font-semibold text-[var(--portal-ink)]">{nombreColegio || 'Portal escolar'}</span>
            </div>
            <p className="hidden text-sm capitalize text-[var(--portal-muted)] lg:block">{hoy}</p>

            <div className="flex shrink-0 items-center gap-1 sm:gap-2">
              <Link
                to="/portal/perfil"
                className="flex min-h-[44px] items-center gap-2 rounded-full py-1 pl-1 pr-1 transition-colors hover:bg-[var(--portal-canvas)] sm:pr-3"
                aria-label={`Mi perfil — ${nombre}`}
              >
                <span className="portal-avatar h-9 w-9 text-xs">{iniciales(nombre)}</span>
                <span className="hidden max-w-[12rem] truncate text-sm font-medium text-[var(--portal-ink)] sm:inline">{nombre}</span>
              </Link>
              <button
                type="button"
                onClick={logout}
                className="flex min-h-[44px] min-w-[44px] items-center justify-center gap-1.5 rounded-full px-2 text-sm text-[var(--portal-muted)] transition-colors hover:text-[var(--red)] sm:px-3 md:hidden"
                aria-label="Cerrar sesión"
              >
                <LogOut size={18} />
                <span className="hidden sm:inline">Salir</span>
              </button>
            </div>
          </div>
        </header>

        {/* pb-36 en móvil: deja libre el botón flotante de pago y la barra inferior */}
        <main className="mx-auto max-w-6xl px-4 pb-36 pt-5 sm:px-6 sm:pt-6 md:pb-12 lg:px-10 lg:pt-8">
          <BannerInstalarApp className="mb-5" />
          <AlumnoActivoProvider>
            <Outlet context={{ logoColegio: logoUrl, resumenFinanciero: resumen, recargarResumen: cargarResumen }} />
          </AlumnoActivoProvider>
        </main>
      </div>

      {/* Barra inferior — solo celular. Cuatro accesos cortos: caben en 360px. */}
      <nav aria-label="Navegación principal" className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--portal-line)] bg-[var(--portal-surface)]/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden">
        <div className="mx-auto grid max-w-xl grid-cols-4 px-1">
          {NAV_PRINCIPAL.map(({ to, end, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) => `portal-tab flex min-h-16 flex-col items-center justify-center gap-0.5 ${isActive ? 'is-active' : ''}`}
            >
              <span className="portal-tab__icon flex h-8 w-14 items-center justify-center rounded-full"><Icon size={20} /></span>
              <span className="text-[0.6875rem] font-semibold">{label}</span>
            </NavLink>
          ))}
          <button
            ref={botonMasRef}
            type="button"
            onClick={() => setMenuAbierto(abierto => !abierto)}
            className={`portal-tab flex min-h-16 flex-col items-center justify-center gap-0.5 ${masActivo || menuAbierto ? 'is-active' : ''}`}
            aria-label="Más opciones"
            aria-expanded={menuAbierto}
            aria-controls="portal-menu-mas"
          >
            <span className="portal-tab__icon flex h-8 w-14 items-center justify-center rounded-full">{menuAbierto ? <X size={20} /> : <Menu size={20} />}</span>
            <span className="text-[0.6875rem] font-semibold">Más</span>
          </button>
        </div>
      </nav>

      {menuAbierto && (
        <div
          id="portal-menu-mas"
          ref={menuRef}
          className="portal-card fixed inset-x-3 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-30 mx-auto max-w-xl p-2 md:hidden"
        >
          <ul className="grid grid-cols-2 gap-1">
            {NAV_SECUNDARIA.map(({ to, icon: Icon, label }) => (
              <li key={to}>
                <NavLink
                  to={to}
                  onClick={() => setMenuAbierto(false)}
                  className={({ isActive }) => `flex min-h-[48px] items-center gap-3 rounded-2xl px-3 py-3 text-sm font-medium transition-colors ${isActive ? 'bg-[var(--portal-tint)] text-[var(--portal-tint-ink)]' : 'text-[var(--portal-ink)] hover:bg-[var(--portal-canvas)]'}`}
                >
                  <Icon size={18} className="shrink-0" /> <span className="min-w-0">{label}</span>
                </NavLink>
              </li>
            ))}
            {puedeInstalar && (
              <li>
                <button
                  type="button"
                  onClick={() => { setMenuAbierto(false); instalarApp(); }}
                  className="flex min-h-[48px] w-full items-center gap-3 rounded-2xl px-3 py-3 text-left text-sm font-medium text-[var(--portal-ink)] transition-colors hover:bg-[var(--portal-canvas)]"
                >
                  <Download size={18} className="shrink-0" /> Instalar app
                </button>
              </li>
            )}
          </ul>
        </div>
      )}

      <NotificacionesModal />
      {modalInstalar}
    </div>
  );
};

export default PortalLayout;
