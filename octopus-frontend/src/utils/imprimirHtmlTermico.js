/**
 * Impresión térmica mediante el diálogo del navegador.
 *
 * Chromium y algunos drivers de Windows convierten `@page size: 80mm auto`
 * en un formulario de largo fijo. Antes de imprimir medimos el contenido y
 * reemplazamos ese `auto` por el alto físico exacto del ticket.
 */

export function calcularAltoPaginaMm({ altoPx, anchoPx, anchoMm, margenFinalMm }) {
  const pxPorMm = anchoPx > 0 ? anchoPx / anchoMm : 96 / 25.4;
  const contenidoMm = altoPx / pxPorMm;
  // Una décima hacia arriba evita que el redondeo mande la última línea a
  // una segunda página, que sería peor que dejar una fracción de milímetro.
  return Math.ceil((contenidoMm + margenFinalMm) * 10) / 10;
}

export function fijarAltoPaginaTermica(doc, anchoMm, margenFinalMm) {
  const body = doc.body;
  const anchoPx = body.getBoundingClientRect().width
    || doc.documentElement.getBoundingClientRect().width;
  const altoPx = Math.max(
    body.scrollHeight,
    body.offsetHeight,
    Math.ceil(body.getBoundingClientRect().height),
  );
  const altoMm = calcularAltoPaginaMm({ altoPx, anchoPx, anchoMm, margenFinalMm });
  const estilo = doc.createElement('style');
  estilo.dataset.altoTicket = 'true';
  estilo.textContent = `@page{size:${anchoMm}mm ${altoMm}mm;margin:0;}`;
  doc.head.appendChild(estilo);
  return altoMm;
}

function esperarImagenes(doc) {
  const pendientes = [...doc.images].filter(img => !img.complete);
  return Promise.all(pendientes.map(img => new Promise((resolve) => {
    img.addEventListener('load', resolve, { once: true });
    img.addEventListener('error', resolve, { once: true });
  })));
}

export function imprimirHtmlTermico(html, anchoMm, margenFinalMm) {
  const iframe = document.createElement('iframe');
  iframe.style.cssText = `position:fixed;left:-10000px;top:0;width:${anchoMm}mm;height:1px;border:0;visibility:hidden;`;
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument || iframe.contentWindow.document;
  doc.open();
  doc.write(html);
  doc.close();

  const limpiar = () => setTimeout(() => iframe.remove(), 1000);
  const ejecutar = async () => {
    await esperarImagenes(doc);
    if (doc.fonts?.ready) await doc.fonts.ready;
    // Deja que el navegador consolide el layout después de cargar el logo.
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    fijarAltoPaginaTermica(doc, anchoMm, margenFinalMm);
    iframe.contentWindow.focus();
    iframe.contentWindow.print();
    limpiar();
  };

  ejecutar().catch(limpiar);
}
