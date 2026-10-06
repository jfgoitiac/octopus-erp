// Utilidades de MetodoPagoFields (modal de abono CxC y POS). Mantienen en UN
// solo lugar la lista de métodos de cobranza y las reglas de validación, que
// replican las de cantina/serializers.py (RecargaTarjetaSerializer) y
// cobranza (punto de venta: referencia y lote de 4 dígitos).
//
// Los métodos son los de cobranza.Pago.METODOS (el backend los importa; acá
// solo se espejan las etiquetas para la UI — no hay endpoint que los liste).

export const METODOS_COBRANZA = [
  { value: 'transferencia', label: 'Transferencia' },
  { value: 'pago_movil', label: 'Pago móvil' },
  { value: 'punto_de_venta', label: 'Punto de venta' },
  { value: 'zelle', label: 'Zelle' },
  { value: 'efectivo', label: 'Efectivo divisas' },
  { value: 'efectivo_ves', label: 'Efectivo bolívares' },
];

// Incluye los métodos propios de cantina que no son de cobranza.
const EXTRA_ETIQUETAS = { tarjeta_prepago: 'Tarjeta prepago', credito_representante: 'Cargo a cuenta' };

export const etiquetaMetodo = (valor) => (
  METODOS_COBRANZA.find(m => m.value === valor)?.label
  ?? EXTRA_ETIQUETAS[valor]
  ?? (valor || '—').replace(/_/g, ' ')
);

const METODOS_VES = ['transferencia', 'pago_movil', 'punto_de_venta', 'efectivo_ves'];
const METODOS_BANCARIOS = ['transferencia', 'pago_movil', 'punto_de_venta', 'zelle'];

// Un método en bolívares captura monto_ves y deriva monto_usd con la tasa;
// uno en divisas captura monto_usd (mismo criterio que cobranza.Pago.save()).
export const esMetodoVes = (m) => METODOS_VES.includes(m);
export const esMetodoBancario = (m) => METODOS_BANCARIOS.includes(m);
export const esPuntoDeVenta = (m) => m === 'punto_de_venta';

/**
 * Forma del `value` que maneja MetodoPagoFields:
 * { metodo_pago, monto_usd, monto_ves, banco_receptor, banco_procedencia,
 *   referencia, numero_lote }  (mismos nombres que una línea de cxc/abonos/).
 * Solo se captura el monto de la moneda del método (monto_ves si
 * esMetodoVes, si no monto_usd); el otro queda ''. Acepta valores parciales.
 */
export const valorInicialMetodo = (metodo = 'efectivo') => ({
  metodo_pago: metodo,
  monto_usd: '',
  monto_ves: '',
  banco_receptor: '',
  banco_procedencia: '',
  referencia: '',
  numero_lote: '',
});

// Monto capturado (string) en la moneda propia del método.
export const montoDeValor = (value) => (
  (esMetodoVes(value?.metodo_pago) ? value?.monto_ves : value?.monto_usd) ?? ''
);

const digitos = (s, n) => (s || '').replace(/\D/g, '').slice(0, n);
export const normalizarReferencia = (metodo, ref) => {
  if (metodo === 'punto_de_venta') return digitos(ref, 4);
  if (metodo === 'transferencia' || metodo === 'pago_movil') return digitos(ref, 6);
  return (ref || '').slice(0, 100);
};
export const normalizarLote = (lote) => digitos(lote, 4);

/**
 * Errores por campo ({} si es válido). `conMonto: false` omite el monto
 * (POS: el monto es el total del carrito).
 */
export const validarMetodoPago = (value, { conMonto = true } = {}) => {
  const errores = {};
  const m = value?.metodo_pago;
  if (!m) { errores.metodo_pago = 'Selecciona el método de pago.'; return errores; }

  if (conMonto) {
    const monto = montoDeValor(value);
    const n = parseFloat(monto);
    if (!monto || Number.isNaN(n) || n <= 0) errores.monto = 'Ingresa un monto mayor a 0.';
  }
  if (esMetodoBancario(m)) {
    if (!value.banco_receptor) errores.banco_receptor = 'Selecciona el banco receptor.';
    const ref = (value.referencia || '').trim();
    if (m === 'punto_de_venta') {
      if (!/^\d{4}$/.test(ref)) errores.referencia = 'Debe tener 4 dígitos.';
      if (!/^\d{4}$/.test(value.numero_lote || '')) errores.numero_lote = 'Debe tener 4 dígitos.';
    } else if (m === 'zelle') {
      if (!ref) errores.referencia = 'Ingresa el número de confirmación.';
    } else if (!/^\d{6}$/.test(ref)) {
      errores.referencia = 'Debe tener 6 dígitos.';
    }
  }
  return errores;
};

// Monto de la línea expresado en USD (para totales en vivo). 0 si no hay
// monto válido o falta la tasa para un método en bolívares.
export const montoUsdDeValor = (value, tasa) => {
  const n = parseFloat(montoDeValor(value));
  if (Number.isNaN(n) || n <= 0) return 0;
  if (!esMetodoVes(value.metodo_pago)) return n;
  return tasa > 0 ? n / tasa : 0;
};

/**
 * Campos de método de pago listos para el backend (línea de abono o venta).
 * - Línea de abono: `lineaAbono(value, { tasa })` agrega monto_usd o monto_ves
 *   (+ tasa_aplicada si se pasa `tasa` y el método es en bolívares).
 * - Venta del POS: `camposMetodoVenta(value)` solo manda método + datos
 *   bancarios (el monto es el total del carrito).
 */
export const camposMetodoVenta = (value) => {
  const m = value.metodo_pago;
  const campos = { metodo_pago: m };
  if (esMetodoBancario(m)) {
    campos.banco_receptor = value.banco_receptor || null;
    campos.banco_procedencia = (value.banco_procedencia || '').trim();
    campos.referencia = (value.referencia || '').trim();
    if (esPuntoDeVenta(m)) campos.numero_lote = value.numero_lote;
  }
  return campos;
};

export const lineaAbono = (value, { tasa } = {}) => {
  const linea = camposMetodoVenta(value);
  const n = parseFloat(montoDeValor(value));
  if (esMetodoVes(value.metodo_pago)) {
    linea.monto_ves = n.toFixed(2);
    if (tasa > 0) linea.tasa_aplicada = String(tasa);
  } else {
    linea.monto_usd = n.toFixed(2);
  }
  return linea;
};
