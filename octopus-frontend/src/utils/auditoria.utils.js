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
