/**
 * Helpers de clasificación de métodos de pago, compartidos por Cobranza.jsx,
 * CobranzaStep2.jsx y CargarPagoRetroactivoModal.jsx.
 *
 * `Pago.METODOS` (backend):
 *  - En divisas (USD): zelle, efectivo
 *  - En bolívares (Bs): transferencia, pago_movil, punto_de_venta, efectivo_ves
 */

export const esDivisa    = (m) => ['zelle', 'efectivo'].includes(m);
export const esBolivares = (m) => ['transferencia', 'pago_movil', 'punto_de_venta', 'efectivo_ves'].includes(m);
export const esCash      = (m) => ['efectivo', 'efectivo_ves'].includes(m);
export const requiereBanco = (m) => m && !['efectivo', 'efectivo_ves'].includes(m);
