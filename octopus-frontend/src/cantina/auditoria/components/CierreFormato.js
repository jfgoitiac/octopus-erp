import { format, isValid, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { API_BASE } from '../../api/cantinaApiClient';

// Helpers de presentación de los cierres (CONTRATO_AUDITORIA_CANTINA.md §3).
// Montos llegan como string decimal en USD; fechas como YYYY-MM-DD o ISO 8601.

export const ESTADOS_REVISION = {
  pendiente: { etiqueta: 'Pendiente', accion: 'Marcar pendiente', color: 'var(--amber-ink)', fondo: 'var(--yellow-light)' },
  revisado: { etiqueta: 'Revisado', accion: 'Marcar revisado', color: 'var(--pb-mid)', fondo: 'var(--pb-light)' },
  aprobado: { etiqueta: 'Aprobado', accion: 'Aprobar', color: 'var(--green)', fondo: 'var(--green-light)' },
  observado: { etiqueta: 'Observado', accion: 'Observar', color: 'var(--red)', fondo: 'var(--red-light)' },
};

export const ETIQUETA_AREA = { cantina: 'Cantina', libreria: 'Librería' };

export const usd = (valor) => {
  const n = Number(valor ?? 0);
  const signo = n < 0 ? '-' : '';
  return `${signo}$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

// Diferencia con signo explícito: "+$1.00", "-$4.00", "$0.00".
export const usdConSigno = (valor) => {
  const n = Number(valor ?? 0);
  return n > 0 ? `+${usd(n)}` : usd(n);
};

export const colorDiferencia = (valor) => {
  const n = Number(valor ?? 0);
  if (n < 0) return 'var(--red)';
  if (n > 0) return 'var(--amber-ink)';
  return 'var(--green)';
};

export const fondoDiferencia = (valor) => {
  const n = Number(valor ?? 0);
  if (n < 0) return 'var(--red-light)';
  if (n > 0) return 'var(--yellow-light)';
  return 'var(--green-light)';
};

// "2026-10-14" se parsea en hora local (parseISO lo hace así para fechas sin hora).
const formatear = (valor, patron) => {
  if (!valor) return '—';
  const fecha = parseISO(valor);
  return isValid(fecha) ? format(fecha, patron, { locale: es }) : valor;
};

export const fmtFecha = (valor) => formatear(valor, "EEE d 'de' MMM yyyy");
export const fmtFechaCorta = (valor) => formatear(valor, 'dd MMM yyyy');
export const fmtFechaHora = (valor) => formatear(valor, "d MMM yyyy, HH:mm");
export const fmtHora = (valor) => formatear(valor, 'HH:mm');

export const fmtTamano = (bytes) => {
  const n = Number(bytes ?? 0);
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
};

// Las URLs de media llegan relativas ("/media/..."): se resuelven contra la API.
export const urlAbsoluta = (url) => {
  if (!url) return '#';
  return /^https?:\/\//i.test(url) ? url : `${API_BASE}${url}`;
};

export const esCancelacion = (err) => err?.name === 'CanceledError' || err?.code === 'ERR_CANCELED';

// Fechas de los filtros: el DatePicker trabaja con Date locales y la API con YYYY-MM-DD.
export const parseFechaLocal = (str) => {
  if (!str) return null;
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
};

export const aFechaISO = (fecha) => {
  if (!fecha) return '';
  const y = fecha.getFullYear();
  const m = String(fecha.getMonth() + 1).padStart(2, '0');
  const d = String(fecha.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

export const haceNDias = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return aFechaISO(d);
};

// Estilos compartidos de tarjetas y campos, coherentes con la cantina.
export const ESTILO_TARJETA = { background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)' };
export const ESTILO_CAMPO = { border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)' };
