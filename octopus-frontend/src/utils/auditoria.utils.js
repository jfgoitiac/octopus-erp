import { format, parseISO, isValid } from 'date-fns';
import { es } from 'date-fns/locale';

export const fmt = (val, cur = 'USD') => {
    try {
        return new Intl.NumberFormat(cur === 'USD' ? 'en-US' : 'es-VE', {
            style: 'currency',
            currency: cur,
            minimumFractionDigits: 2,
        }).format(val || 0);
    } catch {
        // VES not supported in all runtimes — plain fallback
        return `${cur} ${Number(val || 0).toFixed(2)}`;
    }
};

export const formatLogDate = (rawDate) => {
    if (!rawDate) return '—';
    try {
        const parsed = parseISO(rawDate);
        if (!isValid(parsed)) return rawDate;
        return format(parsed, 'dd MMM yyyy HH:mm', { locale: es });
    } catch {
        return rawDate;
    }
};

export const badgeClass = (accion) => {
    const a = (accion || '').toUpperCase();
    if (a.includes('ELIMINACION') || a.includes('ANULACION') || a.includes('DELETE'))
        return 'bg-red-50 text-red-700 border-red-100';
    if (a.includes('REGISTRO') || a.includes('CREACION') || a.includes('INSCRIPCION'))
        return 'bg-green-50 text-green-700 border-green-100';
    if (a.includes('INICIO_SESION') || a.includes('LOGIN'))
        return 'bg-blue-50 text-blue-700 border-blue-100';
    if (a.includes('ACTUALIZACION') || a.includes('EDICION') || a.includes('AJUSTE'))
        return 'bg-amber-50 text-amber-700 border-amber-100';
    return 'bg-slate-50 text-slate-600 border-slate-100';
};

// "INICIO_SESION" -> "Inicio sesión" legible para el badge (el valor crudo sigue
// disponible en el atributo title).
export const humanizarAccion = (accion) => {
    if (!accion) return 'Sin acción';
    const s = String(accion).replace(/_/g, ' ').toLowerCase();
    return s.charAt(0).toUpperCase() + s.slice(1);
};

// Categoría semántica de la acción: sirve para elegir ícono y para no depender
// solo del color (accesibilidad: color + ícono + texto).
export const accionCategoria = (accion) => {
    const a = (accion || '').toUpperCase();
    if (a.includes('ELIMINACION') || a.includes('ANULACION') || a.includes('DELETE')) return 'baja';
    if (a.includes('REGISTRO') || a.includes('CREACION') || a.includes('INSCRIPCION')) return 'alta';
    if (a.includes('INICIO_SESION') || a.includes('LOGIN')) return 'sesion';
    if (a.includes('ACTUALIZACION') || a.includes('EDICION') || a.includes('AJUSTE')) return 'cambio';
    return 'otro';
};

// Pares "antes/después" que el backend puede enviar dentro de `detalles`.
const PARES_CAMBIO = [
    ['antes', 'despues'],
    ['anterior', 'nuevo'],
    ['valor_anterior', 'valor_nuevo'],
    ['before', 'after'],
];

// Devuelve { antes, despues, resto } si `detalles` contiene un par de cambio
// reconocible; si no, null. `resto` son los demás campos (contexto).
export const extraerCambio = (detalles) => {
    if (!detalles || typeof detalles !== 'object' || Array.isArray(detalles)) return null;
    for (const [kA, kD] of PARES_CAMBIO) {
        if (kA in detalles || kD in detalles) {
            const { [kA]: antes, [kD]: despues, ...resto } = detalles;
            if (antes == null && despues == null) continue;
            return { antes, despues, resto };
        }
    }
    return null;
};
