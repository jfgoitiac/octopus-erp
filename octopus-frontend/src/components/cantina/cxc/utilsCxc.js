import { format, parseISO, isValid } from 'date-fns';
import { es } from 'date-fns/locale';
import { reciboAbonoCxcUrl, descargarReciboVenta } from '../../../api/cantina.service';

export const ROLES_ADMIN_CANTINA = ['administrador', 'director'];

export const AREA_LABELS = { cantina: 'Cantina', libreria: 'Librería' };

export const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export const fmtUsd = (v) =>
  `$ ${num(v).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const fmtVes = (v) =>
  `Bs. ${num(v).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const fmtFecha = (valor, patron = "dd/MM/yyyy HH:mm") => {
  if (!valor) return '—';
  const d = typeof valor === 'string' ? parseISO(valor) : valor;
  return isValid(d) ? format(d, patron, { locale: es }) : '—';
};

// El backend devuelve `detalle` de un cargo como arreglo
// [{ producto, cantidad, subtotal }]; se muestra como texto corrido.
export const detalleCargoTexto = (c) => {
  const d = c?.detalle;
  if (Array.isArray(d) && d.length > 0) {
    return d.map(i => `${i.cantidad}× ${i.producto}`).join(', ');
  }
  if (typeof d === 'string' && d.trim()) return d;
  return c?.venta_id ? `Venta #${c.venta_id}` : '—';
};

// Fecha local de hoy (YYYY-MM-DD), sin pasar por UTC. `offsetDias` = -1 → ayer.
export const fechaLocalISO = (offsetDias = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDias);
  return format(d, 'yyyy-MM-dd');
};

export const nombreCompleto = (r) =>
  [r?.nombre, r?.apellido].filter(Boolean).join(' ') || '—';

// Los endpoints paginados pueden devolver { results } o un arreglo plano.
export const listaDe = (data) => {
  if (Array.isArray(data)) return data;
  return Array.isArray(data?.results) ? data.results : [];
};

// Mensaje de error de una respuesta Axios, incluidos los errores en blob.
export const mensajeError = async (err, porDefecto) => {
  const data = err?.response?.data;
  if (data instanceof Blob) {
    try {
      const json = JSON.parse(await data.text());
      return json?.detail || porDefecto;
    } catch {
      return porDefecto;
    }
  }
  if (typeof data === 'string') return porDefecto;
  if (data?.detail) return data.detail;
  if (data && typeof data === 'object') {
    const primero = Object.values(data).flat()[0];
    if (typeof primero === 'string') return primero;
  }
  return porDefecto;
};

export const esCancelacion = (err) =>
  err?.name === 'CanceledError' || err?.code === 'ERR_CANCELED';

export const descargarBlob = (blob, nombre) => {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: nombre });
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.setTimeout(() => URL.revokeObjectURL(url), 30000);
};

// Recibo de la venta a cuenta (se pide desde el cargo, no al cobrar en el POS).
export const abrirReciboVenta = async (ventaId) => {
  const res = await descargarReciboVenta(ventaId);
  const blob = new Blob([res.data], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const ventana = window.open(url, '_blank');
  if (!ventana) descargarBlob(blob, `Ticket_${ventaId}.pdf`);
  window.setTimeout(() => URL.revokeObjectURL(url), 30000);
};

// Abre el PDF del recibo en otra pestaña; si el popup se bloquea, lo descarga.
export const abrirReciboAbono = async (operacionUuid) => {
  const res = await reciboAbonoCxcUrl(operacionUuid);
  const blob = new Blob([res.data], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const ventana = window.open(url, '_blank');
  if (!ventana) descargarBlob(blob, `Recibo_abono_${operacionUuid}.pdf`);
  window.setTimeout(() => URL.revokeObjectURL(url), 30000);
};
