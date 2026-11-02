import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { ETIQUETA_AREA } from '../cantina/aperturaEvento';
import {
  formatoUsd as usd,
  formatoVes,
  metodosConDinero,
  movimientosSinDinero,
  origenDelIngreso,
  totalRecibidoUsd,
} from '../components/cantina/cierre/calculosCierre';

/**
 * Reporte de cierre de caja de cantina como lista de líneas neutras. Una sola
 * fuente para los tres destinos: la vista en pantalla (ReporteCierreTicket),
 * el HTML del diálogo de impresión y el ESC/POS de la impresora térmica.
 *
 * Tipos de línea:
 *  logo | centro {txt, negrita, grande} | fila {izq, der, negrita, grande}
 *  sep | titulo {txt} | texto {txt} | firma {txt}
 *
 * "Dinero recibido" lista cada método en su moneda y totaliza en USD. Tarjeta
 * prepago y cargo a cuenta no son dinero: van aparte. El arqueo es por moneda
 * si el cierre guardó el conteo así; los cierres antiguos conservan el suyo.
 */
const num = (v) => Number(v ?? 0) || 0;
const fecha = (iso) => (iso ? format(parseISO(iso), 'dd/MM/yy HH:mm', { locale: es }) : '—');

const conSigno = (n, formato) => `${n < 0 ? '-' : n > 0 ? '+' : ''}${formato(Math.abs(n))}`;
const etiquetaDiferencia = (n) => (n < 0 ? 'FALTANTE' : n > 0 ? 'SOBRANTE' : 'CUADRADO');

function arqueoPorMoneda(c, arqueo) {
  const difUsd = num(arqueo.diferencia_usd);
  const difVes = num(arqueo.diferencia_ves);
  const dif = num(c.diferencia);
  return [
    { tipo: 'titulo', txt: 'ARQUEO DE EFECTIVO' },
    { tipo: 'fila', izq: 'Fondo inicial $', der: usd(c.monto_inicial) },
    { tipo: 'fila', izq: 'Esperado $', der: usd(arqueo.esperado_usd) },
    { tipo: 'fila', izq: 'Contado $', der: usd(arqueo.contado_usd) },
    { tipo: 'fila', izq: 'Diferencia $', der: conSigno(difUsd, usd) },
    { tipo: 'sep' },
    { tipo: 'fila', izq: 'Esperado Bs', der: formatoVes(arqueo.esperado_ves) },
    { tipo: 'fila', izq: 'Contado Bs', der: formatoVes(arqueo.contado_ves) },
    { tipo: 'fila', izq: 'Diferencia Bs', der: conSigno(difVes, formatoVes) },
    { tipo: 'sep' },
    { tipo: 'fila', izq: `${etiquetaDiferencia(dif)} TOTAL`, der: conSigno(dif, usd), negrita: true },
  ];
}

function arqueoAntiguo(c) {
  const esperado = num(c.efectivo_esperado);
  const inicial = num(c.monto_inicial);
  const dif = num(c.diferencia);
  return [
    { tipo: 'titulo', txt: 'ARQUEO DE EFECTIVO' },
    { tipo: 'fila', izq: 'Fondo inicial', der: usd(inicial) },
    { tipo: 'fila', izq: 'Cobrado efectivo', der: usd(esperado - inicial) },
    { tipo: 'fila', izq: 'Esperado', der: usd(esperado) },
    { tipo: 'fila', izq: 'Conteo físico', der: usd(c.conteo_fisico) },
    { tipo: 'fila', izq: etiquetaDiferencia(dif), der: conSigno(dif, usd), negrita: true },
  ];
}

export function lineasReporteCierre(c) {
  if (!c) return [];
  const area = c.area ? (ETIQUETA_AREA[c.area] ?? c.area) : 'Cantina';
  const cajero = c.cajero_nombre || c.cajero_username || '—';

  const metodos = metodosConDinero(c.totales_por_metodo);
  const sinDinero = movimientosSinDinero(c);
  const origen = origenDelIngreso(c.totales_por_metodo);
  const arqueo = c.desglose?.arqueo;

  const L = [
    { tipo: 'logo' },
    { tipo: 'centro', txt: 'CIERRE DE CAJA', negrita: true, grande: true },
    { tipo: 'centro', txt: `Caja ${area}` },
    { tipo: 'sep' },
    { tipo: 'fila', izq: 'Cajero', der: cajero, negrita: true },
    { tipo: 'fila', izq: 'Caja', der: `${area} #${c.apertura ?? c.id}` },
    { tipo: 'fila', izq: 'Apertura', der: fecha(c.fecha_hora_apertura) },
    { tipo: 'fila', izq: 'Cierre', der: fecha(c.cerrado_en) },
    { tipo: 'sep' },
    { tipo: 'titulo', txt: 'DINERO RECIBIDO' },
  ];

  if (metodos.length === 0) L.push({ tipo: 'texto', txt: 'Sin dinero recibido en esta caja.' });
  metodos.forEach((m) => L.push({ tipo: 'fila', izq: m.etiqueta, der: m.cifra }));
  L.push({ tipo: 'fila', izq: 'TOTAL', der: usd(totalRecibidoUsd(metodos)), negrita: true, grande: true });

  if (sinDinero.length > 0) {
    L.push({ tipo: 'sep' }, { tipo: 'titulo', txt: 'SIN ENTRADA DE DINERO' });
    sinDinero.forEach((m) => L.push({ tipo: 'fila', izq: m.etiqueta, der: usd(m.usd) }));
  }

  if (origen) {
    L.push(
      { tipo: 'sep' },
      { tipo: 'titulo', txt: 'ORIGEN DEL INGRESO' },
      { tipo: 'fila', izq: 'Ventas', der: usd(origen.ventas) },
      { tipo: 'fila', izq: 'Abonos CxC', der: usd(origen.abonos) },
      { tipo: 'fila', izq: 'Recargas tarjeta', der: usd(origen.recargas) },
    );
  }

  L.push(
    { tipo: 'sep' },
    ...(arqueo?.contado_usd !== undefined && arqueo?.contado_usd !== null ? arqueoPorMoneda(c, arqueo) : arqueoAntiguo(c)),
  );

  if (c.observaciones) {
    L.push({ tipo: 'sep' }, { tipo: 'titulo', txt: 'OBSERVACIONES' }, { tipo: 'texto', txt: c.observaciones });
  }

  L.push(
    { tipo: 'firma', txt: 'Firma cajero' },
    { tipo: 'firma', txt: 'Firma supervisor' },
    { tipo: 'sep' },
    { tipo: 'centro', txt: `Cierre #${c.id}` },
  );
  return L;
}
