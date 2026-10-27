import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { ETIQUETA_AREA } from '../cantina/aperturaEvento';
import { etiquetaMetodo } from '../components/cantina/metodoPagoUtils';
import { formatoBs } from './impresoraTermica';

/**
 * Reporte de cierre de caja de cantina como lista de líneas neutras. Una sola
 * fuente para los tres destinos: la vista en pantalla (ReporteCierreTicket),
 * el HTML del diálogo de impresión y el ESC/POS de la impresora térmica.
 *
 * Tipos de línea:
 *  logo | centro {txt, negrita, grande} | fila {izq, der, negrita, grande}
 *  sep | titulo {txt} | texto {txt} | firma {txt}
 *
 * Los métodos de pago van en bolívares (como los recibos de cantina); el
 * arqueo y el origen del ingreso van en USD porque así se registra el conteo.
 */
const num = (v) => Number(v ?? 0) || 0;
const usd = (n) => `$ ${num(n).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fecha = (iso) => (iso ? format(parseISO(iso), 'dd/MM/yy HH:mm', { locale: es }) : '—');

export function lineasReporteCierre(c) {
  if (!c) return [];
  const area = c.area ? (ETIQUETA_AREA[c.area] ?? c.area) : 'Cantina';
  const cajero = c.cajero_nombre || c.cajero_username || '—';

  const metodos = Object.entries(c.totales_por_metodo ?? {});
  const origen = { ventas: 0, abonos: 0, recargas: 0 };
  let totalVes = 0;
  metodos.forEach(([, v]) => {
    origen.ventas += num(v?.ventas);
    origen.abonos += num(v?.abonos);
    origen.recargas += num(v?.recargas);
    totalVes += num(v?.total_ves);
  });

  const esperado = num(c.efectivo_esperado);
  const inicial = num(c.monto_inicial);
  const dif = num(c.diferencia);
  const etiquetaDif = dif < 0 ? 'FALTANTE' : dif > 0 ? 'SOBRANTE' : 'CUADRADO';
  const montoDif = `${dif < 0 ? '-' : dif > 0 ? '+' : ''}${usd(Math.abs(dif))}`;

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
    { tipo: 'titulo', txt: 'POR MÉTODO DE PAGO' },
  ];

  if (metodos.length === 0) L.push({ tipo: 'texto', txt: 'Sin movimientos en esta caja.' });
  metodos.forEach(([m, v]) => L.push({ tipo: 'fila', izq: etiquetaMetodo(m), der: formatoBs(v?.total_ves) }));

  L.push(
    { tipo: 'sep' },
    { tipo: 'fila', izq: 'TOTAL', der: formatoBs(totalVes), negrita: true, grande: true },
    { tipo: 'sep' },
    { tipo: 'titulo', txt: 'ORIGEN DEL INGRESO' },
    { tipo: 'fila', izq: 'Ventas', der: usd(origen.ventas) },
    { tipo: 'fila', izq: 'Abonos CxC', der: usd(origen.abonos) },
    { tipo: 'fila', izq: 'Recargas tarjeta', der: usd(origen.recargas) },
    { tipo: 'sep' },
    { tipo: 'titulo', txt: 'ARQUEO DE EFECTIVO' },
    { tipo: 'fila', izq: 'Fondo inicial', der: usd(inicial) },
    { tipo: 'fila', izq: 'Cobrado efectivo', der: usd(esperado - inicial) },
    { tipo: 'fila', izq: 'Esperado', der: usd(esperado) },
    { tipo: 'fila', izq: 'Conteo físico', der: usd(c.conteo_fisico) },
    { tipo: 'fila', izq: etiquetaDif, der: montoDif, negrita: true },
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
