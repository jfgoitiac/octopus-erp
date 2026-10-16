import { format, parseISO, isValid } from 'date-fns';
import { es } from 'date-fns/locale';
import { fmt } from '../../../utils/formato';

// Helpers de presentación del panel ejecutivo (CONTRATO §0 y §2): los montos
// llegan como string decimal en USD y las fechas como ISO 8601.

export const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export const fmtUsd = (v) => `$ ${fmt(num(v), 2)}`;

// Con signo explícito: "+$ 1,50" / "−$ 2,50".
export const fmtUsdConSigno = (v) => {
  const n = num(v);
  if (n === 0) return fmtUsd(0);
  return `${n > 0 ? '+' : '−'}$ ${fmt(Math.abs(n), 2)}`;
};

export const fmtFecha = (valor, patron = "d 'de' MMM yyyy") => {
  if (!valor) return '—';
  const d = typeof valor === 'string' ? parseISO(valor) : valor;
  return isValid(d) ? format(d, patron, { locale: es }) : '—';
};

// Colores semánticos de una diferencia de caja: faltante rojo, sobrante ámbar.
export const tonoDiferencia = (v) => {
  const n = num(v);
  if (n < 0) return { color: 'var(--red)', fondo: 'var(--red-light)', etiqueta: 'Faltante' };
  if (n > 0) return { color: 'var(--amber-ink)', fondo: 'var(--yellow-light)', etiqueta: 'Sobrante' };
  return { color: 'var(--green)', fondo: 'var(--green-light)', etiqueta: 'Cuadrada' };
};
