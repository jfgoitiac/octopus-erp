import { toast } from 'react-toastify';
import { getAnchoPapel } from './imprimirReciboCantina';
import { getConfigImpresora, enviarBytes, MODOS, Ticket, logoRaster } from './impresoraTermica';
import { lineasReporteCierre } from './reporteCierreCaja';

/**
 * Impresión del reporte de cierre de caja (el mismo contenido que se ve en
 * pantalla, ver reporteCierreCaja.js). Mismo criterio que el recibo de venta:
 * con impresora Bluetooth/USB configurada va por ESC/POS directo; si no, por
 * el diálogo del sistema sobre un iframe oculto. Solo se imprime cuando el
 * usuario pulsa "Imprimir": nunca de forma automática al cerrar la caja.
 */
const LOGO = '/cantina-logo-termico.png';

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function construirHtml(lineas, ancho, titulo) {
  const cuerpo = lineas.map((l) => {
    switch (l.tipo) {
      case 'logo': return `<img class="logo" src="${LOGO}" alt=""/>`;
      case 'centro': return `<div class="centro${l.negrita ? ' neg' : ''}${l.grande ? ' grande' : ''}">${esc(l.txt)}</div>`;
      case 'fila': return `<div class="fila${l.negrita ? ' neg' : ''}${l.grande ? ' grande' : ''}"><span class="izq">${esc(l.izq)}</span><span class="der">${esc(l.der)}</span></div>`;
      case 'sep': return '<hr/>';
      case 'titulo': return `<div class="neg">${esc(l.txt)}</div>`;
      case 'texto': return `<div>${esc(l.txt)}</div>`;
      case 'firma': return `<div class="firma">${esc(l.txt)}</div>`;
      default: return '';
    }
  }).join('');

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"/><title>${esc(titulo)}</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box;}
  @page{size:${ancho}mm auto;margin:0;}
  html,body{width:${ancho}mm;background:#fff;color:#000;}
  body{padding:1mm 2.5mm 3mm;font-family:Arial,Helvetica,sans-serif;font-size:${ancho === 58 ? 10 : 12}px;line-height:1.2;}
  .centro{text-align:center;}
  .neg{font-weight:700;}
  .grande{font-size:${ancho === 58 ? 12 : 14}px;}
  .logo{display:block;margin:0 auto;width:${ancho === 58 ? 20 : 28}mm;height:auto;}
  hr{border:0;border-top:1px dashed #000;margin:1mm 0;}
  .fila{display:flex;justify-content:space-between;gap:2mm;}
  .izq{min-width:0;overflow-wrap:anywhere;}
  .der{white-space:nowrap;text-align:right;}
  .firma{margin-top:9mm;border-top:1px solid #000;padding-top:0.5mm;text-align:center;}
</style></head><body>${cuerpo}</body></html>`;
}

// Parte un texto largo en renglones del ancho de la impresora.
const envolver = (txt, cols) => String(txt ?? '').split('\n').flatMap((p) => {
  const partes = [];
  let resto = p;
  while (resto.length > cols) { partes.push(resto.slice(0, cols)); resto = resto.slice(cols); }
  partes.push(resto);
  return partes;
});

export async function construirCierreEscPos(lineas, ancho, logoUrl) {
  const cols = ancho === 80 ? 48 : 32;
  const t = new Ticket(cols);
  for (const l of lineas) {
    switch (l.tipo) {
      case 'logo': {
        const logo = logoUrl ? await logoRaster(logoUrl, ancho === 80 ? 160 : 112) : null;
        if (logo) t.alinear(1).raster(logo.bits, logo.anchoBytes, logo.alto).alinear(0);
        break;
      }
      case 'centro':
        t.alinear(1).negrita(!!l.negrita).linea(l.txt).negrita(false).alinear(0);
        break;
      case 'fila':
        t.negrita(!!l.negrita).fila(l.izq, l.der).negrita(false);
        break;
      case 'sep': t.guiones(); break;
      case 'titulo': t.negrita(true).linea(l.txt).negrita(false); break;
      case 'texto': envolver(l.txt, cols).forEach(r => t.linea(r)); break;
      case 'firma': t.linea('').linea('').guiones().alinear(1).linea(l.txt).alinear(0); break;
      default: break;
    }
  }
  return t.cortar().bytes();
}

export function imprimirCierreCantina(cierre, ancho = getAnchoPapel()) {
  if (!cierre) return;
  const lineas = lineasReporteCierre(cierre);

  if (getConfigImpresora().modo !== MODOS.DIALOGO) {
    construirCierreEscPos(lineas, ancho, LOGO)
      .then(enviarBytes)
      .catch((e) => {
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
  doc.write(construirHtml(lineas, ancho, `Cierre #${cierre.id}`));
  doc.close();

  const limpiar = () => setTimeout(() => iframe.remove(), 1000);
  const imprimir = () => {
    iframe.contentWindow.focus();
    iframe.contentWindow.print();
    limpiar();
  };
  const img = doc.querySelector('img');
  if (img && !img.complete) {
    img.onload = imprimir;
    img.onerror = imprimir;
  } else {
    setTimeout(imprimir, 100);
  }
}
