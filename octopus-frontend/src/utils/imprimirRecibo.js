import { toast } from 'react-toastify';

const PRINT_STYLE_ID = '__recibo_print_style';
const PRINT_AREA_ID  = '__recibo_print_area';

/**
 * Imprime el recibo usando window.print() + CSS @media print.
 * No abre popups (evita el bloqueo del navegador) y no usa innerHTML
 * con strings de usuario (elimina el vector XSS del enfoque anterior).
 */
export const imprimirRecibo = (previewRef, nombre) => {
  const el = previewRef.current;
  if (!el) return;

  // Limpiar artefactos de una impresión anterior que pudiera haber fallado
  document.getElementById(PRINT_STYLE_ID)?.remove();
  document.getElementById(PRINT_AREA_ID)?.remove();

  // Oculta todo el árbol React y muestra solo el área de impresión
  const style = document.createElement('style');
  style.id = PRINT_STYLE_ID;
  style.textContent = [
    '@media print {',
    `  body > *:not(#${PRINT_AREA_ID}) { display: none !important; }`,
    `  #${PRINT_AREA_ID} { display: block !important; }`,
    '  @page { size: A4; margin: 10mm; }',
    '}',
  ].join('\n');

  // Clonar nodos DOM (no strings HTML) — los logos base64 se preservan tal cual
  const area = document.createElement('div');
  area.id = PRINT_AREA_ID;
  area.style.display = 'none';
  area.appendChild(el.cloneNode(true));

  document.head.appendChild(style);
  document.body.appendChild(area);

  // afterprint se dispara al cerrar el diálogo (imprimir o cancelar)
  window.addEventListener('afterprint', () => {
    document.getElementById(PRINT_STYLE_ID)?.remove();
    document.getElementById(PRINT_AREA_ID)?.remove();
  }, { once: true });

  window.print();
  toast.success(`Recibo de ${nombre || 'empleado'} enviado a la impresora.`);
};
