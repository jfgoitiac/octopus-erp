import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

const monto = (valor, moneda = 'USD') => `${moneda === 'VES' ? 'Bs.' : '$'} ${Number(valor || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function membrete(doc, institucion = {}) {
  const ancho = doc.internal.pageSize.getWidth();
  const nombre = institucion.nombre || 'Institución educativa';
  if (institucion.logoColegio) {
    try { doc.addImage(institucion.logoColegio, 'PNG', 14, 8, 18, 18); } catch { /* El PDF sigue siendo válido si el logo no puede leerse. */ }
  }
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.text(nombre.toUpperCase(), ancho / 2, 13, { align: 'center' });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7);
  doc.text([institucion.rif, institucion.telefono].filter(Boolean).join('  ·  '), ancho / 2, 18, { align: 'center' });
  doc.setDrawColor(180); doc.line(14, 28, ancho - 14, 28);
}

/** Exporta cualquier informe de Egresos conservando sus dos snapshots monetarios. */
export function descargarReporteEgresosPDF({ titulo, columnas, filas, moneda = 'original', desde, hasta, institucion }) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const ancho = doc.internal.pageSize.getWidth();
  membrete(doc, institucion);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.text(titulo, ancho / 2, 37, { align: 'center' });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
  doc.text(`Período: ${desde || 'inicio'} al ${hasta || 'hoy'} · Generado: ${format(new Date(), "dd 'de' MMMM yyyy", { locale: es })}`, 14, 43);
  const cuerpo = filas.map((fila) => columnas.map((columna) => {
    const valor = fila[columna.key];
    if (columna.tipo === 'monto') return monto(valor, columna.moneda || (moneda === 'ves' ? 'VES' : 'USD'));
    return valor === null || valor === undefined || valor === '' ? '—' : String(valor);
  }));
  autoTable(doc, {
    startY: 47,
    head: [columnas.map((columna) => columna.label)],
    body: cuerpo,
    theme: 'grid',
    styles: { fontSize: 7, cellPadding: 2 },
    headStyles: { fillColor: [31, 78, 121] },
    margin: { left: 14, right: 14, bottom: 16 },
    didDrawPage: () => {
      const pagina = doc.getNumberOfPages();
      doc.setFontSize(7); doc.text(`Página ${pagina}`, ancho - 14, doc.internal.pageSize.getHeight() - 8, { align: 'right' });
    },
  });
  const totalUsd = filas.reduce((suma, fila) => suma + Number(fila.monto_usd || fila.pagado_usd || 0), 0);
  const totalVes = filas.reduce((suma, fila) => suma + Number(fila.monto_ves || fila.pagado_ves || 0), 0);
  const y = (doc.lastAutoTable?.finalY || 50) + 7;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8);
  doc.text(`Totales equivalentes: ${monto(totalUsd, 'USD')}  ·  ${monto(totalVes, 'VES')}`, 14, y);
  doc.save(`${titulo.toLowerCase().replaceAll(/[^a-z0-9]+/gi, '_')}.pdf`);
}
