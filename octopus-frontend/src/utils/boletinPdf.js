import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

const BRAND = '#0fa3b1';

function calcularPromedio(materias) {
  const vals = materias.map(m => parseFloat(m.definitiva)).filter(v => !isNaN(v));
  return vals.length ? (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2) : null;
}

export function generarBoletinPDF(boletin) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();

  // ── Header ──
  doc.setFillColor(BRAND);
  doc.rect(0, 0, pageW, 28, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text(boletin.colegio?.nombre_colegio || 'Institución Educativa', pageW / 2, 10, { align: 'center' });

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text('BOLETÍN DE CALIFICACIONES', pageW / 2, 17, { align: 'center' });

  if (boletin.colegio?.direccion_colegio) {
    doc.setFontSize(7);
    doc.text(boletin.colegio.direccion_colegio, pageW / 2, 23, { align: 'center' });
  }

  // ── Datos del alumno ──
  doc.setTextColor(30, 30, 30);
  doc.setFontSize(9);
  const infoY = 36;
  const col1 = 14;
  const col2 = pageW / 2 + 4;

  doc.setFont('helvetica', 'bold');
  doc.text('Alumno:', col1, infoY);
  doc.setFont('helvetica', 'normal');
  doc.text(`${boletin.alumno?.nombre} ${boletin.alumno?.apellido}`, col1 + 18, infoY);

  doc.setFont('helvetica', 'bold');
  doc.text('Cédula:', col2, infoY);
  doc.setFont('helvetica', 'normal');
  doc.text(boletin.alumno?.cedula_escolar || 'N/A', col2 + 16, infoY);

  doc.setFont('helvetica', 'bold');
  doc.text('Grado:', col1, infoY + 6);
  doc.setFont('helvetica', 'normal');
  doc.text(boletin.alumno?.grado_seccion || 'N/A', col1 + 15, infoY + 6);

  doc.setFont('helvetica', 'bold');
  doc.text('Lapso:', col2, infoY + 6);
  doc.setFont('helvetica', 'normal');
  doc.text(`${boletin.lapso?.nombre} — ${boletin.lapso?.periodo_escolar}`, col2 + 14, infoY + 6);

  doc.setDrawColor(BRAND);
  doc.setLineWidth(0.5);
  doc.line(14, infoY + 10, pageW - 14, infoY + 10);

  // ── Tabla de materias ──
  const promedio = calcularPromedio(boletin.materias || []);
  const materiaRows = (boletin.materias || []).map(m => [
    m.materia_nombre,
    m.evaluacion_1 ?? '—',
    m.evaluacion_2 ?? '—',
    m.evaluacion_3 ?? '—',
    m.evaluacion_4 ?? '—',
    m.definitiva ?? '—',
    m.aprobado === true ? 'Aprobado' : m.aprobado === false ? 'Reprobado' : '—',
  ]);

  if (promedio) {
    materiaRows.push([
      { content: 'Promedio General', styles: { fontStyle: 'bold' } },
      '', '', '', '',
      { content: promedio, styles: { fontStyle: 'bold' } },
      '',
    ]);
  }

  autoTable(doc, {
    startY: infoY + 14,
    head: [['Materia', 'Eval 1', 'Eval 2', 'Eval 3', 'Eval 4', 'Definitiva', 'Aprobado']],
    body: materiaRows,
    styles: { fontSize: 8, cellPadding: 2.5 },
    headStyles: { fillColor: BRAND, textColor: 255, fontStyle: 'bold', fontSize: 8 },
    alternateRowStyles: { fillColor: [245, 253, 254] },
    columnStyles: {
      0: { cellWidth: 55 },
      1: { halign: 'center' },
      2: { halign: 'center' },
      3: { halign: 'center' },
      4: { halign: 'center' },
      5: { halign: 'center', fontStyle: 'bold' },
      6: { halign: 'center' },
    },
    margin: { left: 14, right: 14 },
  });

  // ── Asistencia ──
  const afterTableY = doc.lastAutoTable.finalY + 8;
  const ast = boletin.asistencia || {};

  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(BRAND);
  doc.text('Resumen de Asistencia', 14, afterTableY);

  doc.setTextColor(30, 30, 30);
  doc.setFont('helvetica', 'normal');
  const astY = afterTableY + 5;
  doc.text(`Días presentes: ${ast.dias_presentes ?? '—'}`, 14, astY);
  doc.text(`Total de días: ${ast.total_dias ?? '—'}`, 70, astY);
  doc.text(`Ausencias: ${ast.ausencias ?? '—'}`, 126, astY);

  // ── Firmas ──
  const sigY = astY + 18;
  doc.setDrawColor(100, 100, 100);
  doc.setLineWidth(0.3);
  doc.line(14, sigY, 80, sigY);
  doc.line(pageW - 80, sigY, pageW - 14, sigY);

  doc.setFontSize(8);
  doc.setTextColor(100, 100, 100);
  doc.text('Firma del Representante', 47, sigY + 4, { align: 'center' });
  doc.text('Director(a)', pageW - 47, sigY + 4, { align: 'center' });

  // ── Footer en TODAS las páginas ──
  const totalPages = doc.internal.getNumberOfPages();
  const fechaGenerado = format(new Date(), "dd 'de' MMMM yyyy", { locale: es });
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(160, 160, 160);
    doc.text(
      `Página ${i} de ${totalPages} — Generado el ${fechaGenerado} — Octopus ERP`,
      pageW / 2,
      pageH - 6,
      { align: 'center' }
    );
  }

  const nombreArchivo = `boletin_${boletin.alumno?.apellido || 'alumno'}_${boletin.lapso?.nombre || 'lapso'}.pdf`
    .replace(/\s+/g, '_').toLowerCase();
  doc.save(nombreArchivo);
}
