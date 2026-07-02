export const fmt = (v, d = 2) =>
    Number(v || 0).toLocaleString('es-VE', { minimumFractionDigits: d, maximumFractionDigits: d });

export const fmtN = (n) =>
    isNaN(n) || n === '' || n === null
        ? ''
        : Number(n).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const fmtZ = (n) =>
    isNaN(n) ? '0,00' : Number(n).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
