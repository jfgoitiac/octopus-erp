import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { fmt } from '../../../utils/formato';
import { esMetodoVes, etiquetaMetodo } from '../metodoPagoUtils';

/**
 * Lógica pura del cierre de caja de cantina: parseo del conteo, estado de la
 * diferencia y derivación de las tarjetas. La usan la pantalla y el ticket
 * (utils/reporteCierreCaja.js). Los montos del backend llegan como string.
 */

const CENTAVOS = 100;
const redondear = (n) => Math.round(n * CENTAVOS) / CENTAVOS;
const aNumero = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/* ── Formato ─────────────────────────────────────────────────────────── */

export const formatoUsd = (n) => `$ ${fmt(n)}`;
export const formatoVes = (n) => `Bs ${fmt(n)}`;
export const formatoMoneda = (n, moneda) => (moneda === 'ves' ? formatoVes(n) : formatoUsd(n));

/** Fecha visible en español. Devuelve '' si no hay dato o no es válido. */
export function fechaHoraCierre(iso, patron = "d 'de' MMMM 'de' yyyy, HH:mm") {
  if (!iso) return '';
  try {
    return format(parseISO(iso), patron, { locale: es });
  } catch {
    return '';
  }
}

/* ── Conteo ──────────────────────────────────────────────────────────── */

const GRUPOS_PUNTO = /^\d{1,3}(\.\d{3})+$/;
const GRUPOS_COMA = /^\d{1,3}(,\d{3})+$/;

const componer = (entero, decimales) => {
  if (decimales.length > 2 || !/^\d*$/.test(decimales) || !/^\d*$/.test(entero)) return null;
  if (!entero && !decimales) return null;
  return redondear(Number(`${entero || '0'}.${decimales || '0'}`));
};

/**
 * Convierte lo que escribe el cajero en número. Acepta "1.234,50", "1234,5",
 * "1234.50" y "1,234.50". Con un solo punto seguido de tres dígitos ("1.234")
 * lee miles, que es como se escribe en Venezuela. Devuelve null si está vacío,
 * es negativo o no se puede leer sin adivinar (por ejemplo, tres decimales).
 */
export function parsearMonto(texto) {
  if (texto === null || texto === undefined) return null;
  const limpio = String(texto).replace(/\s/g, '').replace(/^(\$|bs\.?)/i, '');
  if (!limpio || !/^[\d.,]+$/.test(limpio)) return null;

  const punto = limpio.lastIndexOf('.');
  const coma = limpio.lastIndexOf(',');

  if (punto !== -1 && coma !== -1) {
    const decimalEsComa = coma > punto;
    const corte = Math.max(punto, coma);
    const entero = limpio.slice(0, corte);
    const grupos = decimalEsComa ? GRUPOS_PUNTO : GRUPOS_COMA;
    if (!grupos.test(entero)) return null;
    return componer(entero.replace(/[.,]/g, ''), limpio.slice(corte + 1));
  }

  const separador = punto !== -1 ? '.' : coma !== -1 ? ',' : null;
  if (!separador) return componer(limpio, '');

  const partes = limpio.split(separador);
  if (partes.length > 2) {
    const grupos = separador === '.' ? GRUPOS_PUNTO : GRUPOS_COMA;
    return grupos.test(limpio) ? componer(partes.join(''), '') : null;
  }

  const [entero, decimales] = partes;
  const esMiles = separador === '.' && decimales.length === 3 && /^[1-9]\d{0,2}$/.test(entero);
  return esMiles ? componer(entero + decimales, '') : componer(entero, decimales);
}

/** Monto ya parseado, con punto decimal, listo para enviar al backend. */
export const montoParaApi = (n) => n.toFixed(2);

/** Monto ya parseado, como se le muestra al cajero en el campo. */
export const montoParaCampo = (n) => fmt(n);

/* ── Diferencia ──────────────────────────────────────────────────────── */

// El verde de marca (--green) no alcanza AA sobre fondo claro para texto.
export const ESTILOS_DIFERENCIA = {
  pendiente: { tinta: 'var(--jet-mid)', fondo: 'var(--jet-light)' },
  sin_referencia: { tinta: 'var(--jet-mid)', fondo: 'var(--jet-light)' },
  invalido: { tinta: 'var(--red)', fondo: 'var(--red-light)' },
  cuadrado: { tinta: '#15803d', fondo: 'var(--green-light)' },
  faltante: { tinta: 'var(--red)', fondo: 'var(--red-light)' },
  sobrante: { tinta: 'var(--amber-ink)', fondo: 'var(--yellow-light)' },
};

/**
 * Estado de un conteo frente a lo esperado.
 * tipo: pendiente | sin_referencia | cuadrado | faltante | sobrante
 */
export function estadoDiferencia(contado, esperado, moneda = 'usd') {
  if (contado === null || contado === undefined) {
    return { tipo: 'pendiente', texto: 'Falta contar', diferencia: null };
  }
  if (esperado === null || esperado === undefined) {
    return { tipo: 'sin_referencia', texto: 'Sin monto esperado', diferencia: null };
  }
  const diferencia = redondear(contado - esperado);
  if (diferencia === 0) return { tipo: 'cuadrado', texto: 'Cuadrado', diferencia };
  const monto = formatoMoneda(Math.abs(diferencia), moneda);
  return diferencia < 0
    ? { tipo: 'faltante', texto: `Faltante ${monto}`, diferencia }
    : { tipo: 'sobrante', texto: `Sobrante ${monto}`, diferencia };
}

/** Esperado de cada moneda según el preliminar; null si el dato no existe. */
export const esperadosDe = (cierre) => {
  const arqueo = cierre?.desglose?.arqueo;
  return { usd: aNumero(arqueo?.esperado_usd), ves: aNumero(arqueo?.esperado_ves) };
};

/** Qué esperados cambiaron entre dos lecturas del preliminar. */
export function cambiosEsperados(antes, despues) {
  const a = esperadosDe(antes);
  const d = esperadosDe(despues);
  return ['usd', 'ves'].flatMap((moneda) => (
    a[moneda] !== null && d[moneda] !== null && redondear(a[moneda] - d[moneda]) !== 0
      ? [{ moneda, antes: a[moneda], despues: d[moneda] }]
      : []
  ));
}

/** Resultado de un cierre guardado, para la banda superior. */
export function resultadoCierre(cierre) {
  const diferencia = aNumero(cierre?.diferencia);
  if (diferencia === null) return { tipo: 'sin_referencia', titulo: 'Caja cerrada', diferencia: null };
  const redondeada = redondear(diferencia);
  if (redondeada === 0) {
    // Un sobrante en una moneda puede compensar un faltante en la otra: el
    // total da 0, pero la gaveta no cuadró y quien revisa debe notarlo.
    const arqueo = cierre?.desglose?.arqueo;
    const compensada = [arqueo?.diferencia_usd, arqueo?.diferencia_ves].some((d) => (aNumero(d) ?? 0) !== 0);
    return compensada
      ? { tipo: 'sobrante', titulo: 'Caja cerrada · Diferencias que se compensan', diferencia: 0 }
      : { tipo: 'cuadrado', titulo: 'Caja cerrada · Cuadrada', diferencia: 0 };
  }
  const monto = formatoUsd(Math.abs(redondeada));
  return redondeada < 0
    ? { tipo: 'faltante', titulo: `Faltante ${monto}`, diferencia: redondeada }
    : { tipo: 'sobrante', titulo: `Sobrante ${monto}`, diferencia: redondeada };
}

/**
 * Arqueo por moneda de un cierre guardado: contado frente a esperado de cada
 * moneda. null si el cierre no se contó por moneda (cierres antiguos).
 */
export function arqueoPorMoneda(cierre) {
  const arqueo = cierre?.desglose?.arqueo;
  const filas = ['usd', 'ves'].map((moneda) => {
    const contado = aNumero(arqueo?.[`contado_${moneda}`]);
    const esperado = aNumero(arqueo?.[`esperado_${moneda}`]);
    return { moneda, contado, esperado, estado: estadoDiferencia(contado, esperado, moneda) };
  });
  if (filas.some((f) => f.contado === null)) return null;
  return { filas, tasa: aNumero(arqueo?.tasa_ves) };
}

/* ── Dinero recibido ─────────────────────────────────────────────────── */

const SIN_DINERO = ['tarjeta_prepago', 'credito_representante'];
const VAN_A_GAVETA = ['efectivo', 'efectivo_ves'];
const ORDEN_METODOS = ['efectivo', 'efectivo_ves', 'pago_movil', 'punto_de_venta', 'transferencia', 'zelle'];

// Una entrada puede ser "12.50" (cierres antiguos) o { total_usd, total_ves, … }.
const leerMetodo = (valor) => {
  if (valor !== null && typeof valor === 'object') {
    return {
      usd: aNumero(valor.total_usd ?? valor.usd ?? valor.monto_usd) ?? 0,
      ves: aNumero(valor.total_ves ?? valor.ves ?? valor.monto_ves),
    };
  }
  return { usd: aNumero(valor) ?? 0, ves: null };
};

const posicionMetodo = (metodo) => {
  const i = ORDEN_METODOS.indexOf(metodo);
  return i === -1 ? ORDEN_METODOS.length : i;
};

/** Métodos con movimiento que sí son dinero, en orden estable. */
export function metodosConDinero(totales) {
  return Object.entries(totales ?? {})
    .filter(([metodo]) => !SIN_DINERO.includes(metodo))
    .map(([metodo, valor]) => {
      const { usd, ves } = leerMetodo(valor);
      const enBolivares = esMetodoVes(metodo) && ves !== null;
      return {
        metodo,
        etiqueta: etiquetaMetodo(metodo),
        usd,
        ves,
        enBolivares,
        cifra: enBolivares ? formatoVes(ves) : formatoUsd(usd),
        equivalente: enBolivares ? `≈ ${formatoUsd(usd)}` : null,
        destino: VAN_A_GAVETA.includes(metodo) ? 'Va a la gaveta' : 'Va al banco',
      };
    })
    .filter((m) => m.usd !== 0 || (m.ves ?? 0) !== 0)
    .sort((a, b) => posicionMetodo(a.metodo) - posicionMetodo(b.metodo));
}

export const totalRecibidoUsd = (metodos) => redondear(metodos.reduce((acc, m) => acc + m.usd, 0));

/* ── De dónde salió ──────────────────────────────────────────────────── */

const TEXTOS_ORIGEN = {
  ventas: { titulo: 'Ventas', detalle: 'Incluye lo pagado con tarjeta y a cuenta' },
  recargas_cobradas: { titulo: 'Recargas cobradas', detalle: '' },
  consumo_recargas: { titulo: 'Consumido de recargas', detalle: 'No entra dinero: se cobró al recargar' },
  abonos: { titulo: 'Abonos cobrados', detalle: 'Cuentas por cobrar' },
  cargado_a_cuenta: { titulo: 'Cargado a cuenta', detalle: 'No entra dinero: queda por cobrar' },
  anuladas: { titulo: 'Ventas anuladas', detalle: 'Ya descontadas de los totales' },
  reversos_recarga: { titulo: 'Devoluciones de recargas', detalle: 'Dinero devuelto por recargas de cajas anteriores' },
  recargas_portal: { titulo: 'Recargas del portal aprobadas', detalle: 'Por banco: no entran a la gaveta' },
};

const textoOperaciones = (n) => {
  if (n === null || n === undefined) return null;
  return n === 1 ? '1 operación' : `${n} operaciones`;
};

const tarjetaOrigen = (id, usd, { operaciones, detalle } = {}) => ({
  id,
  titulo: TEXTOS_ORIGEN[id].titulo,
  detalle: detalle ?? TEXTOS_ORIGEN[id].detalle,
  cifra: formatoUsd(usd),
  operaciones: textoOperaciones(operaciones),
});

const detalleRecargas = (efectivo, banco) => (
  `${formatoUsd(efectivo)} en efectivo · ${formatoUsd(banco)} por banco`
);

const origenDesdeDesglose = (origen) => {
  const base = ['ventas', 'recargas_cobradas', 'consumo_recargas', 'abonos', 'cargado_a_cuenta'];
  const opcionales = ['anuladas', 'reversos_recarga', 'recargas_portal']
    .filter((id) => (aNumero(origen[id]?.usd) ?? 0) > 0);
  return [...base, ...opcionales]
    .filter((id) => origen[id])
    .map((id) => tarjetaOrigen(id, origen[id].usd, {
      operaciones: origen[id].operaciones,
      detalle: id === 'recargas_cobradas'
        ? detalleRecargas(origen[id].efectivo_usd, origen[id].banco_usd)
        : undefined,
    }));
};

const sumaCampo = (totales, campo) => {
  const valores = Object.values(totales ?? {})
    .map((v) => (v !== null && typeof v === 'object' ? aNumero(v[campo]) : null))
    .filter((v) => v !== null);
  return valores.length ? redondear(valores.reduce((a, b) => a + b, 0)) : null;
};

// Cierres sin desglose: solo lo que el registro guardó, sin ceros inventados.
const origenDesdeCierreAntiguo = (cierre) => {
  const totales = cierre?.totales_por_metodo;
  const tarjetas = [];

  const ventas = aNumero(cierre?.total_ventas);
  if (ventas !== null) tarjetas.push(tarjetaOrigen('ventas', ventas));

  const recargas = sumaCampo(totales, 'recargas');
  const recargasEfectivo = aNumero(cierre?.total_recargas_efectivo);
  if (recargas !== null) {
    const detalle = recargasEfectivo !== null
      ? detalleRecargas(recargasEfectivo, redondear(recargas - recargasEfectivo))
      : '';
    tarjetas.push(tarjetaOrigen('recargas_cobradas', recargas, { detalle }));
  } else if (recargasEfectivo !== null) {
    tarjetas.push(tarjetaOrigen('recargas_cobradas', recargasEfectivo, {
      detalle: `${formatoUsd(recargasEfectivo)} en efectivo`,
    }));
  }

  const consumido = aNumero(cierre?.total_tarjeta);
  if (consumido !== null) tarjetas.push(tarjetaOrigen('consumo_recargas', consumido));

  const abonos = sumaCampo(totales, 'abonos');
  if (abonos !== null) tarjetas.push(tarjetaOrigen('abonos', abonos));

  if (totales?.credito_representante !== undefined) {
    tarjetas.push(tarjetaOrigen('cargado_a_cuenta', leerMetodo(totales.credito_representante).usd));
  }
  return tarjetas;
};

const tieneOrigen = (cierre) => Object.keys(cierre?.desglose?.origen ?? {}).length > 0;

/** Tarjetas de "De dónde salió", con el desglose o derivadas del cierre antiguo. */
export function tarjetasDeOrigen(cierre) {
  return tieneOrigen(cierre) ? origenDesdeDesglose(cierre.desglose.origen) : origenDesdeCierreAntiguo(cierre);
}

/** Movimientos que no son dinero, para el ticket. Omite lo que no exista. */
export function movimientosSinDinero(cierre) {
  const origen = cierre?.desglose?.origen;
  const totales = cierre?.totales_por_metodo;
  const consumo = tieneOrigen(cierre) ? aNumero(origen.consumo_recargas?.usd) : aNumero(cierre?.total_tarjeta);
  const cargado = tieneOrigen(cierre)
    ? aNumero(origen.cargado_a_cuenta?.usd)
    : (totales?.credito_representante !== undefined ? leerMetodo(totales.credito_representante).usd : null);
  return [
    { etiqueta: 'Consumo de recargas', usd: consumo },
    { etiqueta: 'Cargado a cuenta', usd: cargado },
  ].filter((m) => m.usd !== null);
}

/** Origen del dinero por método (excluye lo que no es dinero); null si no consta. */
export function origenDelIngreso(totales) {
  const conDinero = Object.fromEntries(
    Object.entries(totales ?? {}).filter(([metodo]) => !SIN_DINERO.includes(metodo)),
  );
  const ventas = sumaCampo(conDinero, 'ventas');
  const abonos = sumaCampo(conDinero, 'abonos');
  const recargas = sumaCampo(conDinero, 'recargas');
  if (ventas === null && abonos === null && recargas === null) return null;
  return { ventas: ventas ?? 0, abonos: abonos ?? 0, recargas: recargas ?? 0 };
}
