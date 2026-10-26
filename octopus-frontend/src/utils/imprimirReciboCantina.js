import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { ETIQUETA_AREA } from '../cantina/aperturaEvento';
import { toast } from 'react-toastify';
import { etiquetaMetodo } from '../components/cantina/metodoPagoUtils';
import {
  getConfigImpresora, imprimirReciboDirecto, MODOS, tasaVenta, bsDesdeUsd, formatoBs,
} from './impresoraTermica';

/**
 * Recibo de la caja de cantina para impresora térmica (Bluetooth o USB).
 * Se imprime con el diálogo del sistema sobre un iframe oculto: la impresora
 * ya emparejada en el equipo recibe el ticket sin permisos extra del
 * navegador. Para que además no aparezca el diálogo en cada venta, abrir
 * Chrome/Edge con el flag --kiosk-printing.
 *
 * El ancho del papel (58 u 80 mm) se recuerda en localStorage.
 */
const CLAVE_ANCHO = 'cantina_papel_mm';
const LOGO = '/cantina-logo-termico.png';

export const getAnchoPapel = () => {
  try {
    return localStorage.getItem(CLAVE_ANCHO) === '80' ? 80 : 58;
  } catch {
    return 58;
  }
};

export const setAnchoPapel = (mm) => {
  try { localStorage.setItem(CLAVE_ANCHO, String(mm)); } catch { /* sin persistencia */ }
};

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fila = (izq, der, clase = '') =>
  `<div class="fila ${clase}"><span class="izq">${izq}</span><span class="der">${der}</span></div>`;

function construirHtml(venta, ancho) {
  const detalles = venta.detalles || [];
  const tasa = tasaVenta(venta);
  const bs = (usdMonto) => bsDesdeUsd(usdMonto, tasa);
  const subtotal = detalles.reduce((acc, d) => acc + Number(d.subtotal || 0), 0);
  const descuento = Number(venta.descuento_usd) || 0;
  const fecha = format(venta.creado_en ? parseISO(venta.creado_en) : new Date(), 'dd/MM/yy HH:mm', { locale: es });
  const totalBs = venta.total_ves != null ? formatoBs(venta.total_ves) : bs(venta.total_usd);
  const metodo = venta.metodo_pago === 'credito_representante' ? 'Cargo a cuenta' : etiquetaMetodo(venta.metodo_pago);
  const area = venta.area ? (ETIQUETA_AREA[venta.area] ?? venta.area) : '';
  const cliente = venta.alumno_nombre || venta.cliente_nombre || '';

  const lineas = detalles.map(d =>
    `<div class="item"><div class="fila"><span class="izq">${esc(d.cantidad)}x ${esc(d.producto?.nombre)}</span>`
    + `<span class="der">${bs(d.subtotal)}</span></div></div>`).join('');

  const saldo = venta.saldo_tarjeta_despues != null
    ? fila('Saldo anterior', bs(Number(venta.saldo_tarjeta_despues) + Number(venta.total_usd)))
      + fila('<b>Saldo restante</b>', `<b>${bs(venta.saldo_tarjeta_despues)}</b>`)
    : '';

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"/><title>Recibo #${esc(venta.id)}</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box;}
  @page{size:${ancho}mm auto;margin:0;}
  html,body{width:${ancho}mm;background:#fff;color:#000;}
  body{padding:1mm 2.5mm 2mm;font-family:Arial,Helvetica,sans-serif;font-size:${ancho === 58 ? 10 : 12}px;line-height:1.15;}
  .centro{text-align:center;}
  .logo{display:block;margin:0 auto;width:${ancho === 58 ? 20 : 28}mm;height:auto;}
  .sub{font-size:${ancho === 58 ? 9 : 11}px;}
  hr{border:0;border-top:1px dashed #000;margin:1mm 0;}
  .fila{display:flex;justify-content:space-between;gap:2mm;}
  .izq{min-width:0;overflow-wrap:anywhere;}
  .der{white-space:nowrap;text-align:right;}
  .total{font-size:${ancho === 58 ? 12 : 14}px;font-weight:700;}
  .despacho{margin-top:1mm;text-align:center;font-weight:700;}
</style></head><body>
  <img class="logo" src="${LOGO}" alt="Los Hijos Café"/>
  <div class="centro sub">${esc(area ? `Caja ${area}` : 'Cantina')}</div>
  ${fila(`#${esc(venta.id)}`, fecha)}
  ${venta.cajero_nombre || venta.cajero_username ? fila('Cajero', esc(venta.cajero_nombre || venta.cajero_username)) : ''}
  ${cliente ? fila('Alumno', esc(cliente)) : ''}
  <hr/>
  ${lineas}
  <hr/>
  ${descuento > 0 ? fila('Subtotal', bs(subtotal)) + fila('Descuento', `-${bs(descuento)}`) : ''}
  ${fila('TOTAL', totalBs, 'total')}
  ${fila('Pago', esc(venta.referencia ? `${metodo} ${venta.referencia}` : metodo))}
  ${saldo}
  <hr/>
  <div class="despacho">ENTREGAR AL ALUMNO</div>
</body></html>`;
}

export function imprimirReciboCantina(venta, ancho = getAnchoPapel()) {
  if (!venta) return;
  // Impresora Bluetooth configurada: ESC/POS directo, sin diálogo del sistema.
  if (getConfigImpresora().modo !== MODOS.DIALOGO) {
    imprimirReciboDirecto(venta, ancho, LOGO).catch((e) => {
      if (e?.name === 'AbortError') return;
      toast.error(e?.message || 'No se pudo imprimir en la impresora Bluetooth.');
    });
    return;
  }
  const iframe = document.createElement('iframe');
  iframe.style.cssText = 'position:fixed;width:0;height:0;border:0;visibility:hidden;';
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument || iframe.contentWindow.document;
  doc.open();
  doc.write(construirHtml(venta, ancho));
  doc.close();

  const limpiar = () => setTimeout(() => iframe.remove(), 1000);
  const imprimir = () => {
    iframe.contentWindow.focus();
    iframe.contentWindow.print();
    limpiar();
  };
  // Esperar al logo para que no salga el recibo sin imagen.
  const img = doc.querySelector('img');
  if (img && !img.complete) {
    img.onload = imprimir;
    img.onerror = imprimir;
  } else {
    setTimeout(imprimir, 100);
  }
}
