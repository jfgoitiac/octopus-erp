import { useContext, useEffect, useState } from 'react';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { LogOut, ShoppingCart, Package, CreditCard, Wallet, BarChart3, UserX, HandCoins } from 'lucide-react';
import { AuthContext } from '../../context/AuthContext';
import { nombreUsuario } from '../../utils/nombreUsuario';
import { getAperturaCajaActual } from '../../api/cantina.service';
import { EVENTO_APERTURA_CAMBIADA, ETIQUETA_AREA } from '../aperturaEvento';

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

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="min-h-dvh flex" style={{ background: 'var(--porcelain, #f5f5f4)' }}>
      {/* Sidebar */}
      <aside className="w-60 shrink-0 bg-white border-r border-gray-100 flex flex-col">
        <div className="h-16 flex items-center gap-2 px-5 border-b border-gray-100">
          <ShoppingCart size={22} style={{ color: 'var(--pb, #0fa3b1)' }} />
          <span className="font-semibold text-gray-800">Cantina</span>
        </div>

        {areaCaja && (
          <div className="px-5 pt-3">
            <span
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold"
              style={{ background: 'var(--pb-light, #e6f7f9)', color: 'var(--pb-mid, #0c7a86)' }}
            >
              <Wallet size={13} />
              Caja: {ETIQUETA_AREA[areaCaja] ?? areaCaja}
            </span>
          </div>
        )}

        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.map(({ name, path, icon: Icon, disabled }) => (
            disabled ? (
              <div
                key={name}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-gray-300 cursor-not-allowed select-none"
                title="Próximamente"
              >
                <Icon size={18} />
                {name}
              </div>
            ) : (
              <NavLink
                key={name}
                to={path}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-[var(--pb,#0fa3b1)]/10 text-[var(--pb,#0fa3b1)]'
                      : 'text-gray-600 hover:bg-gray-50'
                  }`
                }
              >
                <Icon size={18} />
                {name}
              </NavLink>
            )
          ))}
        </nav>

        <div className="px-3 py-4 border-t border-gray-100">
          <div className="px-3 py-2 mb-1">
            <p className="text-sm font-medium text-gray-800 truncate">
              {nombreUsuario(user)}
            </p>
            <p className="text-xs text-gray-400">
              {ROL_LABELS[user?.rol] || user?.rol}
            </p>
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-500 hover:bg-red-50 hover:text-red-500 transition-colors"
          >
            <LogOut size={16} />
            Cerrar sesión
          </button>
        </div>
      </aside>

      {/* Contenido principal */}
      <main className="flex-1 min-w-0 px-8 py-8">
        <Outlet />
      </main>
    </div>
  );
};

export default CantinaLayout;
