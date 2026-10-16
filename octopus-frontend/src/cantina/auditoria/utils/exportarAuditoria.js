import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { format, isValid, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { fmtFechaHora, usd } from '../components/CierreFormato';

// Exportación de los reportes de Auditoría de Cantina (CONTRATO §4) a PDF
// (jsPDF + autotable) y Excel (xlsx), con el mismo patrón de utils/egresosPDF.js
// y utils/egresosExcel.js: columnas declarativas, montos numéricos en Excel y
// formateados en PDF.
//
// Definición que reciben ambos exportadores:
// {
//   titulo: 'Reporte de ventas',
//   desde: 'YYYY-MM-DD', hasta: 'YYYY-MM-DD',
//   filtros: ['Área: Cantina', 'Agrupado por: Producto'],
//   advertencia: string | null,
//   secciones: [{ titulo, columnas, filas, totales }],
// }
// columna: { key, label, tipo: 'texto'|'monto'|'entero'|'pct'|'fechaHora'|'fecha', valor?: (fila) => any }
// totales: { [key]: valor } — la primera columna muestra "Totales".

export const valorCrudo = (columna, fila) => (columna.valor ? columna.valor(fila) : fila?.[columna.key]);

const fechaLarga = (valor) => {
  if (!valor) return '—';
  const d = typeof valor === 'string' ? parseISO(valor) : valor;
  return isValid(d) ? format(d, "d 'de' MMMM yyyy", { locale: es }) : String(valor);
};

const fechaCorta = (valor) => {
  if (!valor) return '—';
  const d = parseISO(valor);
  return isValid(d) ? format(d, "EEE dd/MM/yyyy", { locale: es }) : String(valor);
};

// Texto visible de una celda (tablas de la UI y PDF).
export const formatearCelda = (tipo, valor) => {
  if (valor === null || valor === undefined || valor === '') return '—';
  switch (tipo) {
    case 'monto': return usd(valor);
    case 'entero': return Number(valor).toLocaleString('en-US');
    case 'pct': return `${Number(valor).toFixed(2)} %`;
    case 'fechaHora': return fmtFechaHora(valor);
    case 'fecha': return fechaCorta(valor);
    default: return String(valor);
  }
};

export const textoPeriodo = (desde, hasta) => `Del ${fechaLarga(desde)} al ${fechaLarga(hasta)}`;

const nombreArchivo = (titulo, desde, hasta, extension) => {
  const base = titulo.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replaceAll(/[^a-z0-9]+/g, '_');
  return `${base}_${desde || 'inicio'}_${hasta || 'hoy'}.${extension}`;
};

export const ALINEA_DERECHA = new Set(['monto', 'entero', 'pct']);

/* ── PDF ── */

export function exportarReportePDF({ titulo, desde, hasta, filtros = [], advertencia, secciones }) {
  const anchas = secciones.some((s) => s.columnas.length > 5);
  const doc = new jsPDF({ orientation: anchas ? 'landscape' : 'portrait', unit: 'mm', format: 'a4' });
  const ancho = doc.internal.pageSize.getWidth();
  const alto = doc.internal.pageSize.getHeight();

  doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(110);
  doc.text('AUDITORÍA DE CANTINA', 14, 14);
  doc.setFontSize(15); doc.setTextColor(30);
  doc.text(titulo, 14, 22);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(80);
  doc.text(textoPeriodo(desde, hasta), 14, 28);
  let y = 28;
  if (filtros.length) { y += 4.5; doc.text(filtros.join('  ·  '), 14, y); }
  y += 4.5;
  doc.text(`Generado: ${format(new Date(), "d 'de' MMMM yyyy, HH:mm", { locale: es })}`, 14, y);
  doc.setDrawColor(200); doc.line(14, y + 3, ancho - 14, y + 3);
  y += 9;

  if (advertencia) {
    doc.setFontSize(8.5);
    const lineas = doc.splitTextToSize(`Advertencia: ${advertencia}`, ancho - 34);
    const altoCaja = lineas.length * 4 + 4;
    doc.setFillColor(255, 244, 214); doc.setDrawColor(230, 180, 60);
    doc.roundedRect(14, y, ancho - 28, altoCaja, 1.5, 1.5, 'FD');
    doc.setFont('helvetica', 'bold'); doc.setTextColor(120, 75, 0);
    doc.text(lineas, 17, y + 5);
    y += altoCaja + 6;
  }

  secciones.forEach((seccion) => {
    if (y > alto - 40) { doc.addPage(); y = 18; }
    if (secciones.length > 1) {
      doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(30);
      doc.text(seccion.titulo, 14, y);
      y += 3;
    }
    const columnStyles = {};
    seccion.columnas.forEach((c, idx) => { if (ALINEA_DERECHA.has(c.tipo)) columnStyles[idx] = { halign: 'right' }; });
    const foot = seccion.totales
      ? [seccion.columnas.map((c, idx) => {
          if (idx === 0) return 'Totales';
          const v = seccion.totales[c.key];
          return v === undefined ? '' : formatearCelda(c.tipo, v);
        })]
      : undefined;
    autoTable(doc, {
      startY: y,
      head: [seccion.columnas.map((c) => c.label)],
      body: seccion.filas.length
        ? seccion.filas.map((fila) => seccion.columnas.map((c) => formatearCelda(c.tipo, valorCrudo(c, fila))))
        : [[{ content: 'Sin registros en el período.', colSpan: seccion.columnas.length, styles: { halign: 'center', textColor: 120 } }]],
      foot,
      theme: 'grid',
      showFoot: 'lastPage',
      styles: { fontSize: 7.5, cellPadding: 1.8, textColor: 40 },
      headStyles: { fillColor: [15, 163, 177], textColor: 255 },
      footStyles: { fillColor: [235, 240, 242], textColor: 30, fontStyle: 'bold' },
      columnStyles,
      margin: { left: 14, right: 14, bottom: 16 },
    });
    y = (doc.lastAutoTable?.finalY || y) + 9;
  });

  const paginas = doc.getNumberOfPages();
  for (let p = 1; p <= paginas; p += 1) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(120);
    doc.text(`${titulo} · ${textoPeriodo(desde, hasta)}`, 14, alto - 8);
    doc.text(`Página ${p} de ${paginas}`, ancho - 14, alto - 8, { align: 'right' });
  }
  doc.save(nombreArchivo(titulo, desde, hasta, 'pdf'));
}

/* ── Excel ── */

const valorExcel = (tipo, valor) => {
  if (valor === null || valor === undefined || valor === '') return '';
  if (ALINEA_DERECHA.has(tipo)) {
    const n = Number(valor);
    return Number.isFinite(n) ? n : '';
  }
  if (tipo === 'fechaHora' || tipo === 'fecha') return formatearCelda(tipo, valor);
  return String(valor);
};

const FORMATO_EXCEL = { monto: '#,##0.00', pct: '0.00', entero: '#,##0' };

// Una hoja por sección: cabecera con título, período y filtros; luego la tabla
// con montos numéricos y la fila de totales.
export function exportarReporteExcel({ titulo, desde, hasta, filtros = [], advertencia, secciones }) {
  const libro = XLSX.utils.book_new();
  const usados = new Set();

  secciones.forEach((seccion) => {
    const cabecera = [
      [secciones.length > 1 ? `${titulo} — ${seccion.titulo}` : titulo],
      [textoPeriodo(desde, hasta)],
      ...(filtros.length ? [[filtros.join(' · ')]] : []),
      ...(advertencia ? [[`Advertencia: ${advertencia}`]] : []),
      [],
    ];
    const inicioTabla = cabecera.length;
    const filas = seccion.filas.map((fila) => seccion.columnas.map((c) => valorExcel(c.tipo, valorCrudo(c, fila))));
    const totales = seccion.totales
      ? [seccion.columnas.map((c, idx) => (idx === 0 ? 'Totales' : valorExcel(c.tipo, seccion.totales[c.key])))]
      : [];
    const hoja = XLSX.utils.aoa_to_sheet([...cabecera, seccion.columnas.map((c) => c.label), ...filas, ...totales]);

    const ultimaFila = inicioTabla + filas.length + totales.length;
    seccion.columnas.forEach((c, col) => {
      const z = FORMATO_EXCEL[c.tipo];
      if (!z) return;
      for (let r = inicioTabla + 1; r <= ultimaFila; r += 1) {
        const celda = hoja[XLSX.utils.encode_cell({ r, c: col })];
        if (celda && celda.t === 'n') celda.z = z;
      }
    });
    hoja['!cols'] = seccion.columnas.map((c) => ({ wch: Math.max(12, c.label.length + 4, c.tipo === 'texto' ? 24 : 0) }));

    const base = (seccion.titulo || titulo).replaceAll(/[\\/?*[\]:]/g, ' ').slice(0, 31);
    let nombre = base;
    for (let n = 2; usados.has(nombre); n += 1) nombre = `${base.slice(0, 28)} ${n}`;
    usados.add(nombre);
    XLSX.utils.book_append_sheet(libro, hoja, nombre);
  });

  XLSX.writeFile(libro, nombreArchivo(titulo, desde, hasta, 'xlsx'));
}

/* ── Datos completos de listados paginados ── */

// La UI pagina de 20 en 20; la exportación debe llevar todo el período, así que
// recorre las páginas con el máximo del contrato (page_size 100). Devuelve la
// primera respuesta (con su `resumen`) y todos los `results` juntos.
export async function obtenerTodasLasPaginas(fetcher, params, { maxPaginas = 50, signal } = {}) {
  let primera = null;
  const results = [];
  for (let page = 1; page <= maxPaginas; page += 1) {
    const { data } = await fetcher({ ...params, page, page_size: 100 }, signal);
    if (!primera) primera = data;
    results.push(...(data.results ?? []));
    if (!data.next) break;
  }
  return { ...primera, results };
}
