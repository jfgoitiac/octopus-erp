import { useContext, useEffect, useState } from 'react';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { LogOut, ShoppingCart, Package, CreditCard, Wallet, BarChart3, UserX, HandCoins, ShieldCheck } from 'lucide-react';
import { AuthContext } from '../../context/AuthContext';
import { nombreUsuario } from '../../utils/nombreUsuario';
import { getAperturaCajaActual } from '../../api/cantina.service';
import { EVENTO_APERTURA_CAMBIADA, ETIQUETA_AREA } from '../aperturaEvento';
import TasaCantinaBadge from './TasaCantinaBadge';
import useResumenAlertas from '../auditoria/useResumenAlertas';
import ContadorAlertas from '../auditoria/components/ContadorAlertas';
import { RUTA_AUDITORIA } from '../auditoria/rutas';

// Nav de cantina.md — todas las fases (0-7) ya están implementadas:
// Inventario (Fase 1), Tarjetas (Fase 2), POS (Fase 4), Cierre de caja
// (Fase 5) y Reportes (Fase 7).
// Decisión explícita del cliente (no la del borrador original de
// cantina.md §2/§6.1): el Cajero opera la cantina de punta a punta —
// inventario, tarjetas y reportes incluidos, no solo POS/Cierre — así
// que todos los ítems usan el mismo set de roles.
const ROLES_CANTINA = ['cajero', 'administrador', 'director'];
const NAV_ITEMS = [
  { name: 'Inventario', path: '/cantina/inventario', icon: Package, disabled: false, roles: ROLES_CANTINA },
  { name: 'POS',        path: '/cantina/pos',        icon: ShoppingCart, disabled: false, roles: ROLES_CANTINA },
  { name: 'Tarjetas',   path: '/cantina/tarjetas',    icon: CreditCard, disabled: false, roles: ROLES_CANTINA },
  { name: 'Cierre de caja', path: '/cantina/cierre',  icon: Wallet, disabled: false, roles: ROLES_CANTINA },
  { name: 'Reportes',   path: '/cantina/reportes',    icon: BarChart3, disabled: false, roles: ROLES_CANTINA },
  { name: 'Cuentas por cobrar', path: '/cantina/cuentas', icon: HandCoins, disabled: false, roles: ROLES_CANTINA },
  { name: 'Morosos',    path: '/cantina/morosos',     icon: UserX, disabled: false, roles: ROLES_CANTINA },
  // Auditoría: exclusiva del Director. Vive en el panel administrativo
  // (/auditoria-cantina); este acceso directo lleva allá.
  { name: 'Auditoría',  path: RUTA_AUDITORIA,   icon: ShieldCheck, disabled: false, roles: ['director'] },
];

const ROL_LABELS = {
  cajero: 'Cajero',
  administrador: 'Administrador',
  director: 'Director',
};

// Layout desktop-first para el módulo Cantina — se opera desde una PC/tablet
// fija en la cantina (ver §7.1 de cantina.md), a diferencia del portal de
// representantes/docentes que es mobile-first.
const CantinaLayout = () => {
  const { user, logout } = useContext(AuthContext);
  const navigate = useNavigate();
  const rol = (user?.rol || '').toLowerCase().trim();
  const navItems = NAV_ITEMS.filter(item => item.roles.includes(rol));
  const { pathname } = useLocation();

  // Área de la caja abierta del cajero (chip "Caja: Cantina/Librería"). Se
  // refresca al navegar y cuando el POS/cierre avisan que la apertura cambió.
  const [areaCaja, setAreaCaja] = useState(null);
  useEffect(() => {
    let controller = new AbortController();
    const cargar = () => {
      controller.abort();
      controller = new AbortController();
      getAperturaCajaActual(controller.signal)
        .then(res => setAreaCaja(res.data?.apertura?.area ?? null))
        .catch(() => { /* el chip es informativo: sin toast si falla */ });
    };
    cargar();
    window.addEventListener(EVENTO_APERTURA_CAMBIADA, cargar);
    return () => {
      controller.abort();
      window.removeEventListener(EVENTO_APERTURA_CAMBIADA, cargar);
    };
  }, [pathname]);

  // Contador de alertas abiertas junto a "Auditoría" (solo Director).
  const { abiertas: alertasAbiertas, hayCriticas } = useResumenAlertas(rol === 'director');

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="min-h-dvh flex flex-col lg:flex-row" style={{ background: 'var(--porcelain)' }}>
      {/* Sidebar */}
      {/* Debajo de `lg` el aside es una barra superior de dos filas (marca +
          caja + tasa + salir, y el menú con scroll horizontal propio); desde
          `lg` es la columna lateral. `order-*` reubica "Cerrar sesión" arriba
          en móvil sin duplicar el botón. */}
      <aside className="w-full lg:w-60 lg:shrink-0 bg-[var(--surface)] border-b lg:border-b-0 lg:border-r border-[var(--border)] flex flex-wrap items-center gap-y-1 lg:flex-nowrap lg:flex-col lg:items-stretch lg:gap-y-0">
        <div className="h-12 lg:h-16 shrink-0 flex items-center gap-2 px-3 lg:px-5 lg:border-b border-[var(--border)] lg:w-full">
          <ShoppingCart size={22} style={{ color: 'var(--pb)' }} />
          <span className="font-semibold text-[var(--jet)]">Cantina</span>
        </div>

        {areaCaja && (
          <div className="shrink-0 min-w-0 lg:px-5 lg:pt-3 lg:w-full">
            <span
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold"
              style={{ background: 'var(--pb-light)', color: 'var(--pb-mid)' }}
            >
              <Wallet size={13} />
              Caja: {ETIQUETA_AREA[areaCaja] ?? areaCaja}
            </span>
          </div>
        )}

        <TasaCantinaBadge />

        {/* El degradado de la derecha avisa que el menú sigue con scroll
            horizontal; solo existe debajo de `lg` (arriba el menú es vertical). */}
        <div className="order-5 basis-full relative min-w-0 lg:order-none lg:contents">
        <nav aria-label="Navegación de Cantina" className="flex flex-row gap-1 px-2 pb-2 pr-10 overflow-x-auto lg:order-none lg:basis-auto lg:overflow-visible lg:flex-1 lg:flex-col lg:gap-0 lg:px-3 lg:py-4 lg:space-y-1 lg:w-full">
          {navItems.map(({ name, path, icon: Icon, disabled }) => (
            disabled ? (
              <div
                key={name}
                className="shrink-0 whitespace-nowrap flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-[var(--ash)] opacity-60 cursor-not-allowed select-none"
                title="Próximamente" aria-disabled="true"
              >
                <Icon size={18} />
                {name}
              </div>
            ) : (
              <NavLink
                key={name}
                to={path}
                className={({ isActive }) =>
                  `shrink-0 whitespace-nowrap flex items-center gap-2 lg:gap-3 px-3 py-2.5 min-h-[44px] rounded-xl text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-[var(--pb)]/10 text-[var(--pb)] font-semibold'
                      : 'text-[var(--jet-mid)] hover:bg-[var(--surface-sunken)]'
                  }`
                }
              >
                <Icon size={18} />
                {name}
                {path === RUTA_AUDITORIA && (
                  <ContadorAlertas abiertas={alertasAbiertas} hayCriticas={hayCriticas} className="ml-auto" />
                )}
              </NavLink>
            )
          ))}
        </nav>
        <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-[var(--surface)] to-transparent lg:hidden" />
        </div>

        <div className="order-3 ml-auto shrink-0 pr-2 lg:order-none lg:ml-0 lg:px-3 lg:py-4 lg:border-t border-[var(--border)] lg:w-full">
          <div className="hidden lg:block px-3 py-2 mb-1">
            <p className="text-sm font-medium text-[var(--jet)] truncate">
              {nombreUsuario(user)}
            </p>
            <p className="text-xs text-[var(--ash)]">
              {ROL_LABELS[user?.rol] || user?.rol}
            </p>
          </div>
          <button
            onClick={handleLogout}
            aria-label="Cerrar sesión"
            className="whitespace-nowrap lg:w-full flex items-center justify-center lg:justify-start gap-2 px-3 py-2 min-h-[44px] min-w-[44px] rounded-lg text-sm text-[var(--ash)] hover:bg-[var(--red-light)] hover:text-[var(--red)] transition-colors"
          >
            <LogOut size={16} />
            <span className="hidden sm:inline">Cerrar sesión</span>
          </button>
        </div>
      </aside>

      {/* Contenido principal */}
      <main className="flex-1 min-w-0 px-3 py-4 sm:px-8 sm:py-8">
        <Outlet />
      </main>
    </div>
  );
};

export default CantinaLayout;
