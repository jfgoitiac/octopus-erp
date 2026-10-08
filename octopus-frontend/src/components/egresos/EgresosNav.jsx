import { NavLink, useLocation } from 'react-router-dom';

const SECCIONES = [
  { clave: 'egresos', label: 'Egresos', base: '/egresos', items: [
    { to: '/egresos', label: 'Listado', end: true },
    { to: '/egresos/tablero', label: 'Tablero' },
    { to: '/egresos/reportes', label: 'Reportes' },
  ] },
  { clave: 'cxp', label: 'Cuentas por pagar', base: '/cuentas-por-pagar', items: [
    { to: '/cuentas-por-pagar', label: 'Listado', end: true },
    { to: '/cuentas-por-pagar/tablero', label: 'Tablero' },
    { to: '/cuentas-por-pagar/calendario', label: 'Calendario' },
    { to: '/cuentas-por-pagar/reportes', label: 'Reportes' },
    { to: '/cuentas-por-pagar/recurrentes', label: 'Recurrentes' },
    { to: '/cuentas-por-pagar/configuracion', label: 'Recordatorios' },
  ] },
];

const tab = (activo) => `whitespace-nowrap px-3 py-1.5 text-sm rounded-full transition-colors ${activo ? 'font-medium text-[var(--pb-mid)] bg-[var(--pb-light)]' : 'text-[var(--ash)] hover:text-[var(--jet)]'}`;

// Navegación única del módulo: dos secciones y, debajo, las vistas de la sección activa.
export default function EgresosNav() {
  const { pathname } = useLocation();
  const actual = SECCIONES.find((s) => pathname.startsWith(s.base)) || SECCIONES[0];
  return (
    <nav aria-label="Egresos" className="mb-4 space-y-2">
      <div className="flex gap-1 overflow-x-auto border-b border-[var(--border)]">
        {SECCIONES.map((s) => (
          <NavLink key={s.clave} to={s.base} className={`-mb-px whitespace-nowrap border-b-2 px-4 py-2.5 text-sm ${s === actual ? 'border-[var(--pb)] font-semibold text-[var(--jet)]' : 'border-transparent text-[var(--ash)] hover:text-[var(--jet)]'}`}>{s.label}</NavLink>
        ))}
      </div>
      <div className="flex gap-1 overflow-x-auto">
        {actual.items.map((i) => <NavLink key={i.to} to={i.to} end={i.end} className={({ isActive }) => tab(isActive)}>{i.label}</NavLink>)}
      </div>
    </nav>
  );
}
