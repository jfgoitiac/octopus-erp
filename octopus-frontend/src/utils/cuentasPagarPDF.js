import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

const texto = (valor) => valor === null || valor === undefined || valor === '' ? '—' : String(valor);
export function descargarReporteCuentasPagarPDF({ titulo, columnas, filas, filtros = {}, usuario = 'Usuario', institucion = {} }) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' }); const ancho = doc.internal.pageSize.getWidth();
  doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.text((institucion.nombre || 'Institución educativa').toUpperCase(), ancho / 2, 13, { align: 'center' });
  doc.setFontSize(14); doc.text(titulo, ancho / 2, 23, { align: 'center' }); doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
  const filtrosTexto = Object.entries(filtros).filter(([, valor]) => valor).map(([clave, valor]) => `${clave}: ${valor}`).join(' · ');
  doc.text(`Emitido por: ${usuario} · ${format(new Date(), "dd 'de' MMMM yyyy HH:mm", { locale: es })}`, 14, 30); if (filtrosTexto) doc.text(`Filtros: ${filtrosTexto}`, 14, 35);
  autoTable(doc, { startY: filtrosTexto ? 39 : 34, head: [columnas.map((columna) => columna.label)], body: filas.map((fila) => columnas.map((columna) => texto(fila[columna.key]))), theme: 'grid', styles: { fontSize: 7, cellPadding: 2 }, headStyles: { fillColor: [31, 78, 121] }, margin: { left: 14, right: 14, bottom: 14 }, didDrawPage: () => { const pagina = doc.getNumberOfPages(); doc.setFontSize(7); doc.text(`Página ${pagina}`, ancho - 14, doc.internal.pageSize.getHeight() - 7, { align: 'right' }); } });
  doc.save(`${titulo.toLowerCase().replaceAll(/[^a-z0-9]+/gi, '_')}.pdf`);
}
