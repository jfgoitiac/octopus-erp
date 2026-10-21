import { Home, Receipt, Megaphone, MessageCircle, TrendingUp, ClipboardList, CreditCard, UserCircle, Lock } from 'lucide-react';

// Única fuente de etiquetas de navegación del portal: el riel (md+) y la
// barra inferior móvil usan los mismos nombres.
export const NAV_PORTAL = [
  { to: '/portal', end: true, icon: Home, label: 'Inicio', principal: true },
  { to: '/portal/historial', icon: Receipt, label: 'Historial', principal: true },
  { to: '/portal/comunicaciones', icon: Megaphone, label: 'Avisos', principal: true },
  { to: '/portal/mensajes', icon: MessageCircle, label: 'Mensajes' },
  { to: '/portal/rendimiento', icon: TrendingUp, label: 'Rendimiento' },
  { to: '/portal/plan-evaluacion', icon: ClipboardList, label: 'Plan de evaluación' },
  { to: '/portal/cantina', icon: CreditCard, label: 'Cantina' },
  { to: '/portal/perfil', icon: UserCircle, label: 'Mi perfil' },
  { to: '/portal/cambiar-contrasena', icon: Lock, label: 'Seguridad' },
];

export const iniciales = (nombre = '') =>
  nombre.trim().split(/\s+/).slice(0, 2).map(parte => parte[0]?.toUpperCase() ?? '').join('') || 'R';
