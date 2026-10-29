import { esCash, esDivisa, requiereBanco } from '../../utils/metodosPago';

// Contrato entre la revisión de comprobantes, el conciliador y la caja
// (ver CONTRATO_V2_COMPROBANTES_CAJA). La caja se abre prellenada con:
//   /cobranza?cedula=<cédula>&comprobante=<id>
// y, desde el conciliador, además con los datos de la línea del banco:
//   &metodo=<transferencia|pago_movil|zelle>&banco=<banco_id>&referencia=<ref>
//   &fecha=<YYYY-MM-DD>&monto=<monto>&moneda=<VES|USD>&volver=conciliacion

export const RUTA_CAJA = '/cobranza';
export const RUTA_CONCILIADOR = '/conciliador';
export const RUTA_REVISION = '/comprobantes/revision';

const METODOS_LINEA_BANCO = ['transferencia', 'pago_movil', 'zelle', 'punto_de_venta'];
const FECHA_ISO = /^\d{4}-\d{2}-\d{2}$/;

/** URL de caja para procesar un comprobante del portal. */
export const urlCajaComprobante = ({ cedula, comprobanteId }) => {
    const params = new URLSearchParams();
    if (cedula) params.set('cedula', cedula);
    params.set('comprobante', String(comprobanteId));
    return `${RUTA_CAJA}?${params.toString()}`;
};

/** Motivo prellenado del modo retroactivo cuando se procesa un comprobante. */
export const motivoComprobante = (id) => `Pago reportado en el portal (comprobante #${id})`;

const montoValido = (valor) => {
    const n = Number(String(valor ?? '').replace(',', '.'));
    return Number.isFinite(n) && n > 0 ? n : null;
};

/**
 * Lee los parámetros de prellenado de la caja. Todo lo que no sea válido se
 * descarta en silencio: la caja sigue funcionando como siempre sin ellos.
 */
export const leerPrellenadoCaja = (search) => {
    const params = new URLSearchParams(search || '');
    const comprobante = params.get('comprobante');
    const comprobanteId = comprobante && /^\d+$/.test(comprobante) ? Number(comprobante) : null;
    const metodo = params.get('metodo');
    const fecha = params.get('fecha');
    const moneda = (params.get('moneda') || '').toUpperCase();
    return {
        cedula: params.get('cedula') || '',
        comprobanteId,
        metodo: METODOS_LINEA_BANCO.includes(metodo) ? metodo : null,
        banco: params.get('banco') && /^\d+$/.test(params.get('banco')) ? params.get('banco') : '',
        referencia: params.get('referencia') || '',
        fecha: fecha && FECHA_ISO.test(fecha) ? fecha : null,
        monto: montoValido(params.get('monto')),
        moneda: moneda === 'USD' || moneda === 'VES' ? moneda : null,
        volverConciliacion: params.get('volver') === 'conciliacion',
    };
};

/**
 * Aplica los datos de la línea del banco a una línea de pago de la caja.
 * El monto va al campo de la moneda del método; si la moneda de la URL no
 * coincide con la del método no se prellena el monto (el cajero lo escribe).
 */
export const aplicarPrellenadoALinea = (linea, prellenado) => {
    if (!prellenado?.metodo) return linea;
    const { metodo, banco, referencia, monto, moneda } = prellenado;
    const enDivisas = esDivisa(metodo);
    const monedaMetodo = enDivisas ? 'USD' : 'VES';
    const montoTexto = monto && (!moneda || moneda === monedaMetodo) ? monto.toFixed(2) : '';
    return {
        ...linea,
        metodo_pago: metodo,
        banco_receptor_id: requiereBanco(metodo) && banco ? String(banco) : '',
        referencia: metodo === 'punto_de_venta' ? referencia.replace(/\D/g, '').slice(0, 4) : referencia,
        monto_usd: enDivisas ? montoTexto : '',
        monto_ves: enDivisas ? '' : montoTexto,
    };
};

/**
 * Clasifica lo pagado de más en una operación de caja.
 * - Todas las líneas bancarias → siempre excedente (el dinero entró al banco).
 * - Alguna línea en efectivo → vuelto, salvo que el cajero marque excedente.
 * Devuelve los campos del payload: solo `excedente_*` o solo `vuelto_*`.
 */
export const clasificarSobrante = ({ lineas, sobranteVES, tasa, registrarComoExcedente }) => {
    const sobrante = sobranteVES > 0.005 ? sobranteVES : 0;
    const hayEfectivo = (lineas || []).some((l) => esCash(l.metodo_pago));
    const esExcedente = sobrante > 0 && (!hayEfectivo || Boolean(registrarComoExcedente));
    const ves = parseFloat(sobrante.toFixed(2));
    const usd = tasa > 0 ? parseFloat((sobrante / tasa).toFixed(2)) : 0;
    return {
        hayEfectivo,
        esExcedente,
        payload: esExcedente
            ? { excedente_usd: usd, excedente_ves: ves }
            : { vuelto_usd: usd, vuelto_ves: ves },
    };
};
