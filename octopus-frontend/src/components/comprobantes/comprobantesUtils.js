import { format, parseISO, isValid } from 'date-fns';
import { es } from 'date-fns/locale/es';

// Espejo de cobranza.models.Pago.METODOS.
export const METODOS_PAGO = [
  { value: 'transferencia', label: 'Transferencia bancaria' },
  { value: 'pago_movil', label: 'Pago móvil' },
  { value: 'punto_de_venta', label: 'Punto de venta' },
  { value: 'zelle', label: 'Zelle' },
  { value: 'efectivo', label: 'Efectivo divisas' },
  { value: 'efectivo_ves', label: 'Efectivo bolívares' },
];

export const etiquetaMetodo = (valor) =>
  METODOS_PAGO.find((m) => m.value === valor)?.label || valor || '—';

export const ESTATUS_COMPROBANTE = [
  { value: 'pendiente', label: 'Pendientes' },
  { value: 'aprobado', label: 'Aprobados' },
  { value: 'rechazado', label: 'Rechazados' },
];

export const ESTILO_ESTATUS = {
  pendiente: 'bg-amber-100 text-amber-800',
  aprobado: 'bg-green-100 text-green-700',
  rechazado: 'bg-red-100 text-red-700',
};

const aFecha = (valor) => {
  if (!valor) return null;
  const fecha = valor instanceof Date ? valor : parseISO(valor);
  return isValid(fecha) ? fecha : null;
};

export const formatearFecha = (valor, patron = "d 'de' MMM yyyy") => {
  const fecha = aFecha(valor);
  return fecha ? format(fecha, patron, { locale: es }) : '—';
};

export const formatearFechaHora = (valor) => formatearFecha(valor, "d MMM yyyy, h:mm aaaa");

export const aNumero = (valor) => {
  if (valor === null || valor === undefined || valor === '') return null;
  const n = Number(String(valor).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

export const formatearMonto = (valor, moneda = 'USD') => {
  const n = aNumero(valor);
  if (n === null) return '—';
  const texto = n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return moneda === 'VES' ? `Bs. ${texto}` : `$${texto}`;
};

/** Sustituye tokens `{{x}}` de una plantilla con datos de ejemplo. */
export const renderizarPlantilla = (texto, datos) =>
  (texto || '').replace(/\{\{\s*([\w.]+)\s*\}\}/g, (coincidencia, clave) =>
    (Object.prototype.hasOwnProperty.call(datos, clave) ? datos[clave] : coincidencia));

export const DATOS_EJEMPLO_AVISO = {
  'representante.nombre': 'María Rodríguez',
  'alumno.nombre': 'Amelia Rojas',
  mensualidad: 'Octubre 2026',
  monto: '$30,00',
  referencia: '00123456',
  motivo: 'El monto transferido no coincide con la mensualidad.',
  'colegio.nombre': 'U.E. Colegio Ejemplo',
  'portal.link': 'https://colegio.ejemplo/portal',
};

/** Primer mensaje legible de un error de Axios. */
export const mensajeError = (error, porDefecto) => {
  const data = error?.response?.data;
  if (!data) return porDefecto;
  if (typeof data === 'string') return porDefecto;
  if (data.error) return data.error;
  if (data.detail) return data.detail;
  const primero = Object.values(data)[0];
  if (Array.isArray(primero) && primero.length) return String(primero[0]);
  if (typeof primero === 'string') return primero;
  return porDefecto;
};

/** Normaliza `campos` del 400 a { campo: 'mensaje' }. */
export const normalizarCampos = (campos) => {
  if (!campos || typeof campos !== 'object') return {};
  return Object.fromEntries(
    Object.entries(campos).map(([k, v]) => [k, Array.isArray(v) ? v.join(' ') : String(v)])
  );
};
