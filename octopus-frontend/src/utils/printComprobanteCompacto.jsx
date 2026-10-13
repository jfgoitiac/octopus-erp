import { renderToStaticMarkup } from 'react-dom/server';
import ComprobanteCard from './ComprobanteCard';
import { getLogosInstitucionales } from './logosInstitucionales';

export const printComprobanteCompacto = async (data) => {
  const logos = await getLogosInstitucionales();
  const institucion = {
    nombre:          logos.nombre          || '',
    rif:             logos.rif             || '',
    telefono:        logos.telefono        || '',
    municipioEstado: logos.municipioEstado || '',
  };
  try {
    const html = renderToStaticMarkup(<ComprobanteCard data={{ ...data, institucion, encabezadoPersonalizado: logos.encabezadoPersonalizado, piePaginaPersonalizado: logos.piePaginaPersonalizado }} />);

    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:fixed;width:0;height:0;border:0;visibility:hidden;';
    document.body.appendChild(iframe);

    const doc = iframe.contentDocument || iframe.contentWindow.document;
    doc.open();
    doc.write(`<!DOCTYPE html><html><head>
      <meta charset="UTF-8"/>
      <title>Comprobante ${data.nroControl || ''}</title>
      <style>
        *{margin:0;padding:0;box-sizing:border-box;}
        body{background:#fff;}
        @media print{
          @page{size:100mm auto;margin:4mm;}
          body{margin:0;}
        }
      </style>
    </head><body style="padding:0;">${html}</body></html>`);
    doc.close();

    setTimeout(() => {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
      setTimeout(() => document.body.removeChild(iframe), 1000);
    }, 400);
  } catch {
    // error silencioso — el iframe falla solo si el documento está vacío
  }
};
