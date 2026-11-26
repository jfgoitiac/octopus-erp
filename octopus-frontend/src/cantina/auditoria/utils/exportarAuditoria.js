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

const COLORES_ALERTA = {
  critica: { fondo: [254, 226, 226], borde: [220, 38, 38], texto: [150, 20, 20] },
  advertencia: { fondo: [255, 244, 214], borde: [230, 180, 60], texto: [120, 75, 0] },
  info: { fondo: [226, 238, 252], borde: [90, 140, 200], texto: [30, 70, 130] },
};

// Membrete institucional (logo + nombre + datos del colegio). Devuelve la Y donde sigue el contenido.
function dibujarMembrete(doc, institucion) {
  const ancho = doc.internal.pageSize.getWidth();
  const x = institucion.logoColegio ? 36 : 14;
  if (institucion.logoColegio) {
    try { doc.addImage(institucion.logoColegio, 'PNG', 14, 8, 18, 18); } catch { /* el PDF sigue siendo válido sin logo */ }
  }
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(30);
  doc.text((institucion.nombre || 'Institución educativa').toUpperCase(), x, 13);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(100);
  const contacto = [institucion.rif, institucion.telefono, institucion.municipioEstado].filter(Boolean).join('  ·  ');
  if (contacto) doc.text(contacto, x, 18);
  if (institucion.direccion) doc.text(doc.splitTextToSize(institucion.direccion, ancho - x - 14).slice(0, 2), x, 22);
  doc.setDrawColor(180); doc.line(14, 29, ancho - 14, 29);
  return 29;
}

// `institucion` (opcional): membrete del colegio. `alertas`: [{severidad, titulo, detalle}].
export function exportarReportePDF({
  titulo, desde, hasta, filtros = [], advertencia, secciones, institucion, alertas = [],
}) {
  const anchas = secciones.some((s) => s.columnas.length > 5);
  const doc = new jsPDF({ orientation: anchas ? 'landscape' : 'portrait', unit: 'mm', format: 'a4' });
  const ancho = doc.internal.pageSize.getWidth();
  const alto = doc.internal.pageSize.getHeight();

  const base = institucion ? dibujarMembrete(doc, institucion) + 6 : 0;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(110);
  doc.text(institucion ? 'INFORME FINANCIERO' : 'AUDITORÍA DE CANTINA', 14, base + 8);
  doc.setFontSize(15); doc.setTextColor(30);
  doc.text(titulo, 14, base + 16);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(80);
  doc.text(textoPeriodo(desde, hasta), 14, base + 22);
  let y = base + 22;
  if (filtros.length) {
    const lineas = doc.splitTextToSize(filtros.join('  ·  '), ancho - 28);
    y += 4.5; doc.text(lineas, 14, y); y += (lineas.length - 1) * 4;
  }
  y += 4.5;
  doc.text(`Generado: ${format(new Date(), "d 'de' MMMM yyyy, HH:mm", { locale: es })}`, 14, y);
  doc.setDrawColor(200); doc.line(14, y + 3, ancho - 14, y + 3);
  y += 9;

  const todasAlertas = [
    ...(advertencia ? [{ severidad: 'advertencia', titulo: 'Advertencia', detalle: advertencia }] : []),
    ...alertas,
  ];
  todasAlertas.forEach((a) => {
    const c = COLORES_ALERTA[a.severidad] ?? COLORES_ALERTA.advertencia;
    doc.setFontSize(8.5);
    const lineas = doc.splitTextToSize(a.detalle, ancho - 34);
    const altoCaja = lineas.length * 4 + 9;
    if (y + altoCaja > alto - 20) { doc.addPage(); y = 18; }
    doc.setFillColor(...c.fondo); doc.setDrawColor(...c.borde);
    doc.roundedRect(14, y, ancho - 28, altoCaja, 1.5, 1.5, 'FD');
    doc.setFont('helvetica', 'bold'); doc.setTextColor(...c.texto);
    doc.text(a.titulo, 17, y + 5);
    doc.setFont('helvetica', 'normal');
    doc.text(lineas, 17, y + 9.5);
    y += altoCaja + 3;
  });
  if (todasAlertas.length) y += 3;

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

// Arma una hoja con la cabecera y una o varias tablas apiladas (con título y una
// fila en blanco entre ellas si son varias). Montos y porcentajes quedan como
// números con formato; el autofiltro cubre la primera tabla.
function construirHoja(cabecera, tablas) {
  const aoa = [...cabecera];
  const rangos = [];
  tablas.forEach((tabla, i) => {
    if (i > 0) aoa.push([]);
    if (tablas.length > 1 && tabla.titulo) aoa.push([tabla.titulo]);
    const encabezado = aoa.length;
    aoa.push(tabla.columnas.map((c) => c.label));
    tabla.filas.forEach((fila) => aoa.push(tabla.columnas.map((c) => valorExcel(c.tipo, valorCrudo(c, fila)))));
    if (tabla.totales) {
      aoa.push(tabla.columnas.map((c, idx) => (idx === 0 ? 'Totales' : valorExcel(c.tipo, tabla.totales[c.key]))));
    }
    rangos.push({ tabla, encabezado, ultima: aoa.length - 1 });
  });

  const hoja = XLSX.utils.aoa_to_sheet(aoa);
  const anchos = [];
  rangos.forEach(({ tabla, encabezado, ultima }) => {
    tabla.columnas.forEach((c, col) => {
      const z = FORMATO_EXCEL[c.tipo];
      if (z) {
        for (let r = encabezado + 1; r <= ultima; r += 1) {
          const celda = hoja[XLSX.utils.encode_cell({ r, c: col })];
          if (celda && celda.t === 'n') celda.z = z;
        }
      }
      anchos[col] = Math.max(anchos[col] ?? 0, 12, c.label.length + 4, c.tipo === 'texto' ? 24 : 0);
    });
  });
  hoja['!cols'] = anchos.map((wch) => ({ wch }));
  const primera = rangos[0];
  if (primera.tabla.filas.length > 0) {
    hoja['!autofilter'] = {
      ref: XLSX.utils.encode_range({
        s: { r: primera.encabezado, c: 0 },
        e: { r: primera.encabezado + primera.tabla.filas.length, c: primera.tabla.columnas.length - 1 },
      }),
    };
  }
  return hoja;
}

// Una hoja por sección (o por entrada de `hojas`: { nombre, tablas: [...] }):
// cabecera con título, período y filtros; luego las tablas con totales.
export function exportarReporteExcel({
  titulo, desde, hasta, filtros = [], advertencia, secciones = [], hojas, institucion, generado,
}) {
  const libro = XLSX.utils.book_new();
  const usados = new Set();
  const lista = hojas ?? secciones.map((s) => ({ nombre: s.titulo || titulo, tablas: [s] }));

  lista.forEach((h) => {
    const unica = !hojas && secciones.length <= 1;
    const cabecera = [
      ...(institucion?.nombre ? [[institucion.nombre]] : []),
      [unica ? titulo : `${titulo} — ${h.nombre}`],
      [textoPeriodo(desde, hasta)],
      ...(filtros.length ? [[filtros.join(' · ')]] : []),
      ...(generado ? [[`Generado: ${generado}`]] : []),
      ...(advertencia ? [[`Advertencia: ${advertencia}`]] : []),
      [],
    ];
    const base = h.nombre.replaceAll(/[\\/?*[\]:]/g, ' ').slice(0, 31);
    let nombre = base;
    for (let n = 2; usados.has(nombre); n += 1) nombre = `${base.slice(0, 28)} ${n}`;
    usados.add(nombre);
    XLSX.utils.book_append_sheet(libro, construirHoja(cabecera, h.tablas), nombre);
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
