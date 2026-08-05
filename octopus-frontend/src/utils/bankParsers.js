import { format } from 'date-fns';
import { es } from 'date-fns/locale';

export const BANKS = [
  { id: 'bancaribe', label: 'Bancaribe',        color: '#005baa' },
  { id: 'banesco',   label: 'Banesco',           color: '#c8102e' },
  { id: 'tesoro',    label: 'Banco del Tesoro',  color: '#1a3a5c' },
];

// Algunos bancos (ej. Banco del Tesoro) exportan HTML donde SheetJS solo decodifica
// un set reducido de entidades, dejando cosas como "D&eacute;bito" sin convertir.
// Decodificamos las entidades acentuadas más comunes y luego quitamos tildes para
// que la detección de columnas no dependa de que el acento esté bien codificado.
const HTML_ENTITIES = {
  aacute: 'a', eacute: 'e', iacute: 'i', oacute: 'o', uacute: 'u',
  ntilde: 'n', uuml: 'u', amp: '&', nbsp: ' ',
};
const decodeEntities = (s) => s.replace(/&([a-zA-Z]+);/g, (m, name) => HTML_ENTITIES[name.toLowerCase()] ?? m);

const n = (s = '') => decodeEntities(s.toString())
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().trim();

// Mapa de abreviatura de mes (3 letras, sin tildes) -> índice 0-11. Algunos
// bancos usan "sep" y otros "set" para septiembre, por eso no es un array
// simple indexado por posición.
const MESES_ES = {
  ene: 0, feb: 1, mar: 2, abr: 3, may: 4, jun: 5,
  jul: 6, ago: 7, sep: 8, set: 8, oct: 9, nov: 10, dic: 11,
};

function findCol(headers, candidates) {
  for (const c of candidates) {
    const idx = headers.findIndex(h => n(h).includes(c));
    if (idx !== -1) return idx;
  }
  return -1;
}

function findHeaderRow(rows) {
  for (let i = 0; i < Math.min(rows.length, 30); i++) {
    const row = rows[i];
    if (!row) continue;
    const joined = row.map(c => n(c)).join(' ');
    const hasFecha = joined.includes('fecha');
    const hasRef   = joined.includes('referencia') || joined.includes('ref.') || joined.includes('nro.') || joined.includes('comprobante') || joined.includes('documento');
    if (hasFecha && hasRef) return i;
  }
  return 0;
}

// Cuando una celda de PDF (ej. descripción larga) no cabe en una sola línea,
// pdfplumber la devuelve con un salto de línea interno (ej. "ND EMISION DE\nCUENTA").
// Lo normalizamos a un solo espacio para que se vea bien en la tabla.
function cleanCell(val) {
  return (val ?? '').toString().replace(/\s*\n\s*/g, ' ').trim();
}

// La referencia es un código numérico/alfanumérico sin espacios reales, así
// que si una referencia larga se parte en dos líneas dentro de su celda
// (ej. "1142001139734\n86432"), quitamos todo el espacio en blanco en vez de
// colapsarlo a un espacio — de lo contrario quedaría un espacio falso en
// medio del número.
//
// Bancaribe: cuando la columna Referencia y la de Descripción quedan muy
// cerca en el PDF, la reconstrucción por posición de palabras
// (`_extraer_tabla_por_palabras` en conciliacion.py) a veces arrastra el
// inicio de la descripción ("ND EMISION DE...", "NC ...") pegado al final
// del número de referencia (ej. "428951916672ND"). "ND"/"NC" son las
// abreviaturas de Nota Débito/Nota Crédito de Bancaribe, nunca parte real
// del número, así que se recortan cuando aparecen pegadas al final de una
// referencia puramente numérica.
function cleanReferencia(val) {
  const ref = (val ?? '').toString().replace(/\s+/g, '').trim();
  return ref.replace(/^(\d+)(?:ND|NC)$/i, '$1');
}

function parseAmount(val) {
  if (!val && val !== 0) return 0;
  // Las celdas numéricas de Excel ya traen el valor correcto; convertirlas a
  // texto y volver a parsear (como abajo) borra el punto decimal real y
  // multiplica el monto por ~100 (ej. 14320.5 -> "143205").
  if (typeof val === 'number') return Math.abs(val);
  const str = val.toString().trim();
  if (!str) return 0;
  let clean = str.replace(/[Bs$%]/g, '').replace(/\s/g, '');
  const lastComma = clean.lastIndexOf(',');
  const lastDot   = clean.lastIndexOf('.');
  if (lastComma > lastDot) {
    // La coma es el separador decimal (formato es-VE): 14.320,00 -> 14320.00
    clean = clean.replace(/\./g, '').replace(',', '.');
  } else if (lastDot > -1) {
    // Sin coma: el punto actúa como separador de miles (formato es-VE): 14.320 -> 14320
    clean = clean.replace(/\./g, '');
  } else {
    clean = clean.replace(/,/g, '');
  }
  return Math.abs(parseFloat(clean) || 0);
}

function formatDate(val) {
  if (!val && val !== 0) return '';

  if (typeof val === 'number') {
    // Excel serial number: days since 1900-01-01 (with Lotus 1-2-3 leap year bug offset)
    const d = new Date(Math.round((val - 25569) * 86400 * 1000));
    return format(d, 'dd/MM/yyyy', { locale: es });
  }

  const str = cleanCell(val);

  // Already formatted dd/MM/yyyy
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(str)) return str;

  // ISO format: 2024-01-15 or 2024-01-15T...
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
    const [y, m, d] = str.split(/[-T]/);
    const date = new Date(Number(y), Number(m) - 1, Number(d));
    return format(date, 'dd/MM/yyyy', { locale: es });
  }

  // dd-MM-yyyy
  if (/^\d{2}-\d{2}-\d{4}$/.test(str)) {
    const [d, m, y] = str.split('-');
    const date = new Date(Number(y), Number(m) - 1, Number(d));
    return format(date, 'dd/MM/yyyy', { locale: es });
  }

  // dd-MMM-yyyy con mes abreviado en español (ej. Bancaribe: "01-JUL-2026")
  const mesAbreviado = str.match(/^(\d{2})-([A-Za-zñÑ]{3,4})\.?-(\d{4})$/);
  if (mesAbreviado) {
    const [, d, mesStr, y] = mesAbreviado;
    const mes = n(mesStr).slice(0, 3);
    const idx = MESES_ES[mes];
    if (idx !== undefined) {
      const date = new Date(Number(y), idx, Number(d));
      return format(date, 'dd/MM/yyyy', { locale: es });
    }
  }

  return str;
}

function genericParse(rows, bankId) {
  const headerIdx = findHeaderRow(rows);
  const headers   = (rows[headerIdx] || []).map(h => h?.toString() || '');

  const fechaIdx   = findCol(headers, ['fecha']);
  const refIdx     = findCol(headers, ['referencia', 'nro. ref', 'n° ref', 'num. ref', 'comprobante', 'documento', 'ref.', 'nro.doc', 'numero']);
  const descIdx    = findCol(headers, ['descripci', 'concepto', 'detalle', 'motivo', 'narración', 'narraci']);
  const montoIdx   = findCol(headers, ['monto', 'importe', 'valor']);
  const debitoIdx  = findCol(headers, ['debito', 'débito', 'cargo', ' db', 'deb.', 'egresos']);
  const creditoIdx = findCol(headers, ['credito', 'crédito', 'abono', ' cr', 'cre.', 'ingresos']);

  const transactions = [];

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.every(c => c === '' || c === null || c === undefined)) continue;

    // No usar cleanCell() aquí: formatDate() necesita distinguir un number
    // crudo (fecha serial de Excel) de un string, y cleanCell() ya convierte
    // todo a string con .toString().
    const fecha      = row[fechaIdx];
    const referencia = refIdx !== -1 ? cleanReferencia(row[refIdx]) : null;

    if (!fecha || !referencia || referencia.length < 3) continue;

    let monto;
    let tipo;
    if (montoIdx !== -1 && row[montoIdx] !== '' && row[montoIdx] != null) {
      monto = parseAmount(row[montoIdx]);
      tipo  = /^\s*-|\(.*\)/.test(row[montoIdx]?.toString() || '') ? 'egreso' : 'ingreso';
    } else {
      const deb = parseAmount(row[debitoIdx]);
      const cre = parseAmount(row[creditoIdx]);
      monto = cre || deb;
      tipo  = deb > 0 ? 'egreso' : 'ingreso';
    }

    if (monto === 0) continue;

    transactions.push({
      fecha:       formatDate(fecha),
      referencia,
      monto,
      tipo,
      descripcion: descIdx !== -1 ? cleanCell(row[descIdx]) : '',
      banco:       bankId,
    });
  }

  return transactions;
}

export function parseStatement(rows, bankId) {
  return genericParse(rows, bankId);
}
