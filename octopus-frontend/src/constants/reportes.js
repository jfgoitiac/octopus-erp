export const today = () => new Date().toISOString().split('T')[0];

export const daysAgo = (n) => {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return d.toISOString().split('T')[0];
};

export const currentYearMonth = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

export const fmt = (val) => parseFloat(val || 0).toFixed(2);
export const fmtInt = (val) => parseInt(val || 0, 10).toLocaleString();

export const MONTH_NAMES = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

export const CURRENT_YEAR = new Date().getFullYear();

/** Extrae el mensaje de error específico del backend cuando existe (patrón ya
 * usado en el desglose contable), y cae al mensaje genérico si no viene. */
export const getErrorMessage = (err, fallback) => err?.response?.data?.error || fallback;

/* Clave de agrupación para el checklist de conciliación bancaria: además de
   operacion_uuid, incluye método de pago + banco, porque cada combinación
   corresponde a un extracto bancario distinto que se concilia por separado. */
export const claveConciliacion = (p) => `${p.operacion_uuid}::${p.metodo_pago}::${p.banco_receptor ?? ''}`;

export const sumPagos = (arr) => arr.reduce((s, p) => s + parseFloat(p.monto_usd || p.monto || 0), 0);
export const countUniqAlumnos = (arr) => new Set(arr.map(p => p.alumno_id || p.alumno)).size;
export const mesConMayorRecaudacion = (arr) => {
    const byMonth = {};
    arr.forEach(p => {
        const m = (p.fecha || '').slice(0, 7);
        if (m) byMonth[m] = (byMonth[m] || 0) + parseFloat(p.monto_usd || p.monto || 0);
    });
    if (!Object.keys(byMonth).length) return '—';
    const best = Object.entries(byMonth).sort((a, b) => b[1] - a[1])[0];
    const [y, mo] = best[0].split('-');
    return `${MONTH_NAMES[parseInt(mo, 10) - 1]} ${y}`;
};

export const TIPO_CLASIFICACION_LABELS = {
    inscripcion: 'Inscripción',
    proyecto_inversion: 'Proyecto de Inversión',
    mes_atrasado: 'Mes Atrasado',
    proyecto_inversion_atrasado: 'Proyecto de Inversión Atrasado',
};

export const ESTADO_CLASIF_STYLE = {
    sin_clasificar:      { label: 'Sin clasificar',    color: 'var(--ash)', bg: 'var(--ash-light)' },
    parcial:             { label: 'Parcial',            color: '#ca8a04',   bg: '#fef9c3' },
    completo_automatico: { label: '✓ Automático',       color: '#16a34a',   bg: '#dcfce7' },
    completo_manual:     { label: '✓ Clasificado',      color: '#16a34a',   bg: '#dcfce7' },
};

export const METODO_LABELS = {
    transferencia:  'Transferencia Bancaria',
    pago_movil:     'Pago Móvil',
    punto_de_venta: 'Punto de Venta',
    zelle:          'Zelle',
    efectivo:       'Efectivo USD',
    efectivo_ves:   'Efectivo Bs.',
};

export const ESTATUS_STYLE = {
    completado:  { label: 'Completado',  color: '#16a34a', bg: '#dcfce7' },
    en_revision: { label: 'En Revisión',  color: '#ca8a04', bg: '#fef9c3' },
    anulado:     { label: 'Anulado',      color: 'var(--red)', bg: 'var(--red-light)' },
};

export const inputStyle = { border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)', fontSize: '16px' };
export const cardStyle  = { border: '0.5px solid var(--border-md)', background: 'var(--porcelain)' };
