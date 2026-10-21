import { NavLink, Link } from 'react-router-dom';
import { GraduationCap, Download } from 'lucide-react';
import { useBranding } from '../../context/BrandingContext';
import { usePortalAuth } from '../context/PortalAuthContext';
import { NAV_PORTAL, iniciales } from './navPortal';

/**
 * Riel lateral (md+). En tablet solo íconos; desde lg muestra el colegio,
 * la tarjeta del representante y la navegación con texto.
 */
const RepresentanteRail = ({ puedeInstalar = false, onInstalar }) => {
  const { nombreColegio, logoUrl } = useBranding();
  const { user } = usePortalAuth();
  const nombre = [user?.nombre, user?.apellido].filter(Boolean).join(' ') || 'Representante';

  return (
    <nav
      aria-label="Navegación del portal de representantes"
      className="hidden md:flex fixed inset-y-0 left-0 z-20 w-20 lg:w-64 flex-col gap-5 overflow-y-auto px-3 py-6 lg:px-5"
    >
      <div className="flex items-center justify-center gap-3 lg:justify-start lg:px-2">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-[var(--portal-surface)] shadow-sm">
          {logoUrl ? (
            <img src={logoUrl} alt="" className="h-8 w-8 object-contain" onError={e => { e.target.style.display = 'none'; }} />
          ) : (
            <GraduationCap size={22} style={{ color: 'var(--portal-primary)' }} />
          )}
        </span>
        <span className="sr-only lg:not-sr-only lg:line-clamp-2 text-sm font-bold leading-tight text-[var(--portal-ink)]">
          {nombreColegio || 'Portal de representantes'}
        </span>
      </div>

      <Link
        to="/portal/perfil"
        className="flex flex-col items-center gap-2 rounded-3xl lg:bg-[var(--portal-surface)] lg:px-4 lg:py-4 lg:shadow-[var(--portal-shadow)]"
        aria-label={`Mi perfil — ${nombre}`}
      >
        <span className="portal-avatar h-11 w-11 text-sm lg:h-14 lg:w-14 lg:text-lg">{iniciales(nombre)}</span>
        <span className="hidden lg:block w-full truncate text-center text-sm font-semibold text-[var(--portal-ink)]">{nombre}</span>
        <span className="hidden lg:block -mt-1.5 text-xs text-[var(--portal-muted)]">Representante</span>
      </Link>

      <ul className="flex flex-col gap-0.5">
        {NAV_PORTAL.map(({ to, end, icon: Icon, label }) => (
          <li key={to}>
            <NavLink
              to={to}
              end={end}
              title={label}
              className="portal-rail-link flex min-h-[44px] items-center justify-center gap-3 rounded-2xl px-3 py-2 lg:justify-start"
            >
              <Icon size={20} className="shrink-0" />
              <span className="sr-only lg:not-sr-only text-sm font-medium">{label}</span>
            </NavLink>
          </li>
        ))}
      </ul>

      {puedeInstalar && (
        <button type="button" onClick={onInstalar} title="Instalar app" className="portal-rail-link mt-auto flex min-h-[44px] items-center justify-center gap-3 rounded-2xl px-3 py-2.5 lg:justify-start">
          <Download size={20} className="shrink-0" />
          <span className="sr-only lg:not-sr-only text-sm font-medium">Instalar app</span>
        </button>
      )}
    </nav>
  );
};

export default RepresentanteRail;
