import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';

export const fmt = (n, d = 0) =>
  Number(n || 0).toLocaleString('es-VE', { minimumFractionDigits: d, maximumFractionDigits: d });

export const fmtFecha = (str) => {
  try { return format(parseISO(str), 'dd MMM yyyy', { locale: es }); }
  catch { return str || '—'; }
};
