import { Sparkles } from 'lucide-react';
import { ROLES } from '../../constants/roles';

const TODOS = [ROLES.DIRECTOR, ROLES.ADMINISTRADOR, ROLES.COBRANZA, ROLES.CAJERO, ROLES.SISTEMAS];
const DIRECCION = [ROLES.DIRECTOR, ROLES.ADMINISTRADOR, ROLES.SISTEMAS];

/** Pestañas del módulo y roles que pueden verlas (deben coincidir con las rutas de App.jsx). */
export const PESTANAS_COBRANZA = [
    { id: 'hoy', label: 'Hoy', to: '/cobranza/inteligente', end: true, roles: TODOS, icono: Sparkles },
    { id: 'cartera', label: 'Cartera', to: '/cobranza/inteligente/cartera', roles: TODOS },
    { id: 'conversaciones', label: 'Conversaciones', to: '/cobranza/inteligente/conversaciones', roles: TODOS },
    { id: 'automatizaciones', label: 'Automatizaciones', to: '/cobranza/inteligente/automatizaciones', roles: DIRECCION },
    { id: 'reportes', label: 'Reportes', to: '/cobranza/inteligente/reportes', roles: DIRECCION },
];

export const pestanasPorRol = (rol) => {
    const r = (rol || '').toLowerCase().trim();
    return PESTANAS_COBRANZA.filter(p => p.roles.includes(r));
};
