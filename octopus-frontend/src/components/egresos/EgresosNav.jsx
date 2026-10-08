import { BarChart3, CalendarDays, FileBarChart2, List, ReceiptText, Repeat2, Settings2, WalletCards } from 'lucide-react';
import { NavLink, useLocation } from 'react-router-dom';

const SECCIONES = [
  { clave: 'egresos', label: 'Egresos', descripcion: 'Compras y pagos registrados', base: '/egresos', icono: ReceiptText, items: [
    { to: '/egresos', label: 'Movimientos', icono: List, end: true },
    { to: '/egresos/tablero', label: 'Resumen', icono: BarChart3 },
    { to: '/egresos/reportes', label: 'Informes', icono: FileBarChart2 },
  ] },
  { clave: 'cxp', label: 'Cuentas por pagar', descripcion: 'Deuda y programación a proveedores', base: '/cuentas-por-pagar', icono: WalletCards, items: [
    { to: '/cuentas-por-pagar', label: 'Cuentas', icono: List, end: true },
    { to: '/cuentas-por-pagar/tablero', label: 'Resumen', icono: BarChart3 },
    { to: '/cuentas-por-pagar/calendario', label: 'Calendario', icono: CalendarDays },
    { to: '/cuentas-por-pagar/reportes', label: 'Informes', icono: FileBarChart2 },
    { to: '/cuentas-por-pagar/recurrentes', label: 'Recurrentes', icono: Repeat2 },
    { to: '/cuentas-por-pagar/configuracion', label: 'Ajustes', icono: Settings2 },
  ] },
];

export default function EgresosNav() {
  const { pathname } = useLocation();
  const actual = SECCIONES.find((seccion) => pathname.startsWith(seccion.base)) || SECCIONES[0];
  return <nav aria-label="Navegación financiera" className="finance-navigation"><div className="finance-navigation__modules" role="tablist" aria-label="Módulos financieros">{SECCIONES.map((seccion) => { const Icono = seccion.icono; const activo = seccion.clave === actual.clave; return <NavLink key={seccion.clave} to={seccion.base} className={`finance-navigation__module ${activo ? 'is-active' : ''}`}><Icono size={18} strokeWidth={1.8} aria-hidden="true" /><span><strong>{seccion.label}</strong><small>{seccion.descripcion}</small></span></NavLink>; })}</div><div className="finance-navigation__views" aria-label={`Vistas de ${actual.label}`}>{actual.items.map((item) => { const Icono = item.icono; return <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => `finance-navigation__view ${isActive ? 'is-active' : ''}`}><Icono size={15} strokeWidth={1.8} aria-hidden="true" />{item.label}</NavLink>; })}</div></nav>;
}
