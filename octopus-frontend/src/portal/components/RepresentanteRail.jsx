import { NavLink, Link } from 'react-router-dom';
import { GraduationCap, Download, LogOut, CheckCircle2, ChevronRight } from 'lucide-react';
import { useBranding } from '../../context/BrandingContext';
import { usePortalAuth } from '../context/PortalAuthContext';
import { NAV_PORTAL } from './navPortal';
import MontoRef from './MontoRef';

/** Tarjeta de estado de cuenta en lo alto del riel (solo lg+). */
const TarjetaSaldo = ({ resumen, loading, error }) => {
  if (loading) {
    return <div className="hidden lg:block h-[5.5rem] rounded-[var(--portal-radius-sm)] bg-[var(--portal-tint)] animate-pulse" aria-label="Cargando saldo" />;
  }
  if (error || !resumen) {
    return (
      <p className="hidden lg:block rounded-[var(--portal-radius-sm)] bg-[var(--portal-canvas)] px-4 py-3 text-xs text-[var(--portal-muted)]">
        No se pudo cargar tu saldo.
      </p>
    );
  }

  const deuda = Number(resumen.total_deuda_usd || 0);
  return (
    <Link
      to="/portal"
      className="group hidden lg:block rounded-[var(--portal-radius-sm)] px-4 py-3.5 transition-colors"
      style={{ background: deuda > 0 ? 'var(--portal-tint)' : 'var(--green-light)' }}
    >
      <span className="flex items-center justify-between text-xs font-medium text-[var(--portal-muted)]">
        {deuda > 0 ? 'Saldo pendiente' : 'Estado de cuenta'}
        <ChevronRight size={14} className="transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
      </span>
      {deuda > 0 ? (
        <MontoRef usd={deuda} tasaBcv={resumen.tasa_bcv} align="left" className="mt-1" colorRef="text-[var(--portal-ink)] !text-lg" colorBs="text-[var(--portal-muted)]" />
      ) : (
        <span className="mt-1 flex items-center gap-1.5 text-base font-semibold text-[var(--green)]">
          <CheckCircle2 size={18} aria-hidden="true" /> Al día
        </span>
      )}
    </Link>
  );
};

/**
 * Riel lateral blanco (md+). En tablet solo íconos; desde lg muestra el
 * colegio, la tarjeta de saldo, la navegación con texto y Salir al pie.
 */
const RepresentanteRail = ({ puedeInstalar = false, onInstalar, resumen, loadingResumen, errorResumen }) => {
  const { nombreColegio, logoUrl } = useBranding();
  const { logout } = usePortalAuth();

  return (
    <nav
      aria-label="Navegación del portal de representantes"
      className="hidden md:flex fixed inset-y-0 left-0 z-20 w-20 lg:w-64 flex-col gap-6 overflow-y-auto border-r border-[var(--portal-line)] bg-[var(--portal-surface)] px-3 py-5 lg:px-5"
    >
      <div className="flex h-10 items-center justify-center gap-3 lg:justify-start lg:px-1">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl">
          {logoUrl ? (
            <img src={logoUrl} alt="" className="h-9 w-9 object-contain" onError={e => { e.target.style.display = 'none'; }} />
          ) : (
            <GraduationCap size={24} style={{ color: 'var(--portal-primary)' }} />
          )}
        </span>
        <span className="sr-only lg:not-sr-only lg:line-clamp-2 text-sm font-bold leading-tight text-[var(--portal-ink)]">
          {nombreColegio || 'Portal de representantes'}
        </span>
      </div>

      <TarjetaSaldo resumen={resumen} loading={loadingResumen} error={errorResumen} />

      <ul className="flex flex-col gap-0.5">
        {NAV_PORTAL.map(({ to, end, icon: Icon, label }) => (
          <li key={to}>
            <NavLink
              to={to}
              end={end}
              title={label}
              className="portal-rail-link flex min-h-[44px] items-center justify-center gap-3 rounded-2xl px-3 py-2 lg:justify-start"
            >
              <Icon size={20} strokeWidth={1.75} className="shrink-0" />
              <span className="sr-only lg:not-sr-only text-sm">{label}</span>
            </NavLink>
          </li>
        ))}
      </ul>

      <div className="mt-auto flex flex-col gap-0.5">
        {puedeInstalar && (
          <button type="button" onClick={onInstalar} title="Instalar app" className="portal-rail-link flex min-h-[44px] items-center justify-center gap-3 rounded-2xl px-3 py-2 lg:justify-start">
            <Download size={20} strokeWidth={1.75} className="shrink-0" />
            <span className="sr-only lg:not-sr-only text-sm">Instalar app</span>
          </button>
        )}
        <button type="button" onClick={logout} title="Salir" className="portal-rail-link flex min-h-[44px] items-center justify-center gap-3 rounded-2xl px-3 py-2 hover:!text-[var(--red)] lg:justify-start">
          <LogOut size={20} strokeWidth={1.75} className="shrink-0" />
          <span className="sr-only lg:not-sr-only text-sm">Salir</span>
        </button>
      </div>
    </nav>
  );
};

export default RepresentanteRail;
