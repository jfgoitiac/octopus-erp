// Parser genérico y configurable de estados de cuenta bancarios.
//
// El comportamiento de cada banco se define con datos, no con código:
//   - `formato_estado_cuenta` (preset): generico | bancaribe | banesco | tesoro | bdt
//   - `config_estado_cuenta` (por banco, editable en Configuración):
//       { columnas: { referencia, fecha, descripcion, debito, credito, monto: [alias] },
//         formato_fecha: 'auto' | 'dd/MM/yyyy' | 'MM/dd/yyyy' | 'yyyy-MM-dd',
//         separador_decimal: 'auto' | ',' | '.',
//         filas_encabezado_max: int }
// Agregar un banco nuevo no requiere tocar este archivo.

// Algunos bancos (ej. Banco del Tesoro) exportan HTML donde SheetJS solo decodifica
// un set reducido de entidades, dejando cosas como "D&eacute;bito" sin convertir.
// Decodificamos las entidades acentuadas más comunes y luego quitamos tildes para
// que la detección de columnas no dependa de que el acento esté bien codificado.
const HTML_ENTITIES = {
  aacute: 'a', eacute: 'e', iacute: 'i', oacute: 'o', uacute: 'u',
  ntilde: 'n', uuml: 'u', amp: '&', nbsp: ' ',
};
const decodeEntities = (s) => s.replace(/&([a-zA-Z]+);/g, (m, name) => HTML_ENTITIES[name.toLowerCase()] ?? m);

// Normaliza sin recortar espacios (los alias ' db' / ' cr' dependen del espacio inicial).
const nSinTrim = (s = '') => decodeEntities((s ?? '').toString())
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase();
const n = (s = '') => nSinTrim(s).trim();

// Abreviatura de mes (3 letras, sin tildes) -> índice 0-11. Español e inglés
// ("sep"/"set" para septiembre, "ene"/"jan", "dic"/"dec"...).
const MESES = {
  ene: 0, jan: 0, feb: 1, mar: 2, abr: 3, apr: 3, may: 4, jun: 5,
  jul: 6, ago: 7, aug: 7, sep: 8, set: 8, oct: 9, nov: 10, dic: 11, dec: 11,
};

export const FORMATO_DEFECTO = 'generico';

// Alias base por tipo de columna (comparados por "contiene", sin tildes ni mayúsculas).
const ALIAS_BASE = {
  fecha:       ['fecha'],
  referencia:  ['referencia', 'nro. ref', 'n° ref', 'num. ref', 'comprobante', 'documento', 'ref.', 'nro.doc', 'numero'],
  descripcion: ['descripci', 'concepto', 'detalle', 'motivo', 'narraci'],
  monto:       ['monto', 'importe', 'valor'],
  debito:      ['debito', 'cargo', ' db', 'deb.', 'egresos'],
  credito:     ['credito', 'abono', ' cr', 'cre.', 'ingresos'],
};
const TIPOS = Object.keys(ALIAS_BASE);

// Presets: solo añaden alias/ajustes sobre los alias base.
export const PRESETS = {
  generico:  {},
  bancaribe: {},
  banesco:   {},
  tesoro:    {},
  // BDT: sin muestras públicas del formato; referencia como "operación"/"transacción".
  // Ajustar con un estado de cuenta real (o vía config_estado_cuenta del banco).
  bdt: { columnas: { referencia: ['operacion', 'transaccion', 'serial'] } },
};

export const FORMATOS_ESTADO_CUENTA = [
  { value: 'generico',  label: 'Genérico (autodetección)' },
  { value: 'bancaribe', label: 'Bancaribe' },
  { value: 'banesco',   label: 'Banesco' },
  { value: 'tesoro',    label: 'Banco del Tesoro' },
  { value: 'bdt',       label: 'Banco Digital de los Trabajadores' },
];

export const FORMATOS_FECHA = ['auto', 'dd/MM/yyyy', 'MM/dd/yyyy', 'yyyy-MM-dd'];
export const SEPARADORES_DECIMAL = ['auto', ',', '.'];
const ENCABEZADO_MAX_DEFECTO = 30;
const ENCABEZADO_MAX_TOPE = 200;

const listaStr = (v) => (Array.isArray(v) ? v : [])
  .map(x => (x ?? '').toString())
  .filter(x => x.trim() !== '');

// Combina alias base + preset + config del banco (los del banco tienen prioridad).
function resolverConfig(formato, config) {
  const preset = PRESETS[formato] || PRESETS[FORMATO_DEFECTO];
  const cfg = config && typeof config === 'object' ? config : {};
  const colsCfg = cfg.columnas && typeof cfg.columnas === 'object' ? cfg.columnas : {};
  const colsPreset = preset.columnas || {};

  const alias = {};
  for (const t of TIPOS) {
    const vistos = new Set();
    alias[t] = [
      ...listaStr(colsCfg[t]).map(a => n(a)),
      ...listaStr(colsPreset[t]).map(a => n(a)),
      ...ALIAS_BASE[t].map(a => nSinTrim(a)),
    ].filter(a => a !== '' && !vistos.has(a) && vistos.add(a));
  }

  const fechaFmt = FORMATOS_FECHA.includes(cfg.formato_fecha) ? cfg.formato_fecha : (preset.formato_fecha || 'auto');
  const sep = SEPARADORES_DECIMAL.includes(cfg.separador_decimal) ? cfg.separador_decimal : (preset.separador_decimal || 'auto');
  const maxCfg = Number.parseInt(cfg.filas_encabezado_max, 10);
  const filasMax = Number.isFinite(maxCfg) && maxCfg > 0
    ? Math.min(maxCfg, ENCABEZADO_MAX_TOPE)
    : ENCABEZADO_MAX_DEFECTO;

  return { alias, fechaFmt, sep, filasMax };
}

// ── Columnas y encabezado ────────────────────────────────────────────────

const esCeldaEncabezado = (c) => {
  if (c === null || c === undefined || typeof c === 'number') return false;
  const s = c.toString();
  return s.trim() !== '' && s.length <= 60;
};

function findCol(headers, candidatos) {
  const hs = headers.map(h => (esCeldaEncabezado(h) ? n(h) : null));
  for (const c of candidatos) {
    const idx = hs.findIndex(h => h !== null && h.includes(c));
    if (idx !== -1) return idx;
  }
  return -1;
}

function columnasDeFila(row, alias) {
  const headers = (row || []).map(h => h ?? '');
  const cols = {};
  for (const t of TIPOS) cols[t] = findCol(headers, alias[t]);
  return cols;
}

// Puntúa una fila como encabezado: columnas reconocidas (el importe cuenta una
// sola vez aunque haya monto + débito + crédito).
function puntuar(cols) {
  let p = 0;
  if (cols.fecha !== -1) p += 1;
  if (cols.referencia !== -1) p += 1;
  if (cols.descripcion !== -1) p += 0.5;
  if (cols.monto !== -1 || cols.debito !== -1 || cols.credito !== -1) p += 1;
  return p;
}

function detectarEncabezado(rows, alias, filasMax) {
  let mejor = { idx: 0, score: 0 };
  const limite = Math.min(rows.length, filasMax);
  for (let i = 0; i < limite; i++) {
    const row = rows[i];
    if (!Array.isArray(row)) continue;
    const score = puntuar(columnasDeFila(row, alias));
    if (score > mejor.score) mejor = { idx: i, score };
  }
  return mejor.idx;
}

// ── Limpieza de celdas ───────────────────────────────────────────────────

// Cuando una celda de PDF (ej. descripción larga) no cabe en una sola línea,
// pdfplumber la devuelve con un salto de línea interno. Lo colapsamos a un espacio.
function cleanCell(val) {
  return (val ?? '').toString().replace(/\s*\n\s*/g, ' ').trim();
}

// La referencia es un código sin espacios reales: se quita todo el espacio en
// blanco (una referencia larga partida en dos líneas no debe quedar con espacio).
// Bancaribe: la reconstrucción por palabras del PDF a veces pega "ND"/"NC" (Nota
// Débito/Crédito) al final de una referencia numérica (ej. "428951916672ND").
function cleanReferencia(val) {
  const ref = (val ?? '').toString().replace(/\s+/g, '').trim();
  return ref.replace(/^(\d+)(?:ND|NC)$/i, '$1');
}

const FILA_TOTAL = /^(total(es)?\b|sub ?total|saldo\s+(inicial|final|anterior|actual|disponible|al\b|promedio)|resumen\b|cantidad de)/;

function esFilaTotal(row) {
  return row.some(c => typeof c === 'string' && FILA_TOTAL.test(n(c)));
}

// ── Montos ───────────────────────────────────────────────────────────────

// Voto de separador decimal de un texto numérico: ',' | '.' | null (ambiguo).
function votoDecimal(str) {
  const s = str.replace(/[^\d.,]/g, '');
  const lc = s.lastIndexOf(',');
  const ld = s.lastIndexOf('.');
  if (lc === -1 && ld === -1) return null;
  if (lc !== -1 && ld !== -1) return lc > ld ? ',' : '.';
  const sepCh = lc !== -1 ? ',' : '.';
  const partes = s.split(sepCh);
  if (partes.length > 2) return null; // 1.234.567: solo miles
  return partes[1].length === 3 ? null : sepCh; // 1.234 es ambiguo; 12.5 / 12,50 no
}

function detectarSeparador(valores) {
  const votos = { ',': 0, '.': 0 };
  for (const v of valores) {
    if (typeof v !== 'string' || !v.trim()) continue;
    const vt = votoDecimal(v);
    if (vt) votos[vt] += 1;
  }
  return votos['.'] > votos[','] ? '.' : ',';
}

// `sep`: { auto: true, global } | { auto: false, valor }
function parseNumeroTexto(str, sep) {
  let clean = str.replace(/[^\d.,]/g, '');
  if (!clean) return 0;
  // En auto: valor con ambos separadores -> el último es el decimal; con uno
  // solo -> si se repite es de miles, si tiene 3 dígitos tras él es ambiguo y
  // manda la decisión global del archivo; en otro caso es decimal.
  const dec = sep.auto ? (votoDecimal(clean) || sep.global) : sep.valor;
  if (dec === ',') clean = clean.replace(/\./g, '').replace(',', '.');
  else clean = clean.replace(/,/g, '');
  return parseFloat(clean) || 0;
}

function parseAmount(val, sep) {
  if (!val && val !== 0) return 0;
  // Las celdas numéricas de Excel ya traen el valor correcto; convertirlas a
  // texto y volver a parsear borraría el punto decimal real.
  if (typeof val === 'number') return Math.abs(val);
  const str = val.toString().trim();
  if (!str) return 0;
  return Math.abs(parseNumeroTexto(str, sep));
}

const esNegativo = (val) => /^\s*-|\(.*\)|-\s*$/.test((val ?? '').toString());

// ── Fechas ───────────────────────────────────────────────────────────────

const pad = (x) => String(x).padStart(2, '0');
const RE_ISO = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/;
const RE_NUM = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})(?!\d)/;
const RE_MES = /^(\d{1,2})[-/ ]+([A-Za-zñÑ]{3,})\.?[-/ ,]+(\d{2}|\d{4})(?!\d)/;

const quitarHora = (s) => s.replace(/[T\s]+\d{1,2}:\d{2}.*$/i, '').trim();

// 'dmy' | 'mdy' según los valores > 12 que aparezcan en los datos.
function detectarOrden(valores) {
  let dmy = 0;
  let mdy = 0;
  for (const v of valores) {
    if (typeof v !== 'string') continue;
    const m = RE_NUM.exec(quitarHora(cleanCell(v)));
    if (!m) continue;
    if (Number(m[1]) > 12) dmy += 1;
    else if (Number(m[2]) > 12) mdy += 1;
  }
  return mdy > dmy ? 'mdy' : 'dmy';
}

const anioCompleto = (y) => (y.length === 2 ? 2000 + Number(y) : Number(y));
const fechaValida = (y, m, d) => m >= 1 && m <= 12 && d >= 1 && d <= 31 && y >= 1900 && y <= 2200;
const salida = (y, m, d) => `${pad(d)}/${pad(m)}/${y}`;

function serialAFecha(serial) {
  // Días desde 1899-12-30 (incluye el error bisiesto 1900 de Lotus). UTC para
  // que la zona horaria local no mueva el día.
  const dt = new Date(Math.round((Math.floor(serial) - 25569) * 86400 * 1000));
  return salida(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

function formatDate(val, orden) {
  if (!val && val !== 0) return '';

  if (typeof val === 'number') {
    if (val >= 19000101 && val <= 22001231) {
      const s = String(Math.floor(val));
      return salida(s.slice(0, 4), s.slice(4, 6), s.slice(6, 8));
    }
    return serialAFecha(val);
  }

  const str = cleanCell(val);
  const sinHora = quitarHora(str);

  let m = RE_ISO.exec(sinHora);
  if (m && fechaValida(+m[1], +m[2], +m[3])) return salida(m[1], pad(m[2]), pad(m[3]));

  m = RE_NUM.exec(sinHora);
  if (m) {
    let d = Number(m[1]);
    let mes = Number(m[2]);
    if (orden === 'mdy') [d, mes] = [mes, d];
    if (mes > 12 && d <= 12) [d, mes] = [mes, d]; // el orden elegido era imposible
    const y = anioCompleto(m[3]);
    if (fechaValida(y, mes, d)) return salida(y, mes, d);
  }

  m = RE_MES.exec(sinHora);
  if (m) {
    const idx = MESES[n(m[2]).slice(0, 3)];
    if (idx !== undefined) return salida(anioCompleto(m[3]), idx + 1, Number(m[1]));
  }

  if (/^\d{8}$/.test(sinHora) && +sinHora >= 19000101) {
    return salida(sinHora.slice(0, 4), sinHora.slice(4, 6), sinHora.slice(6, 8));
  }

  // Serial de Excel que llegó como texto (ej. "45356" o "45356.5")
  if (/^\d{5}(\.\d+)?$/.test(sinHora) && +sinHora >= 20000 && +sinHora <= 80000) {
    return serialAFecha(Number(sinHora));
  }

  return str;
}

function ordenDeFormato(fmt, valores) {
  if (fmt === 'MM/dd/yyyy') return 'mdy';
  if (fmt === 'dd/MM/yyyy' || fmt === 'yyyy-MM-dd') return 'dmy';
  return detectarOrden(valores);
}

// ── Parser ───────────────────────────────────────────────────────────────

/**
 * @param {Array<Array>} rows  filas crudas (sheet_to_json header:1 o extracción de PDF)
 * @param {string} formato     preset del banco (BancoInstitucional.formato_estado_cuenta);
 *                             desconocido -> 'generico'
 * @param {object} config      BancoInstitucional.config_estado_cuenta (opcional)
 * @returns {Array<{fecha, referencia, monto, tipo, descripcion}>} fecha en dd/MM/yyyy
 */
export function parseStatement(rows, formato = FORMATO_DEFECTO, config = null) {
  if (!Array.isArray(rows) || rows.length === 0) return [];
  const preset = PRESETS[formato] ? formato : FORMATO_DEFECTO;
  const { alias, fechaFmt, sep, filasMax } = resolverConfig(preset, config);

  const headerIdx = detectarEncabezado(rows, alias, filasMax);
  const cols = columnasDeFila(rows[headerIdx], alias);
  const datos = rows.slice(headerIdx + 1).filter(Array.isArray);

  const colVals = (idx) => (idx === -1 ? [] : datos.map(r => r[idx]));
  const separador = sep === 'auto'
    ? { auto: true, global: detectarSeparador([...colVals(cols.monto), ...colVals(cols.debito), ...colVals(cols.credito)]) }
    : { auto: false, valor: sep };
  const orden = ordenDeFormato(fechaFmt, colVals(cols.fecha));

  const transactions = [];

  for (const row of datos) {
    if (row.every(c => c === '' || c === null || c === undefined)) continue;
    if (esFilaTotal(row)) continue;

    // No usar cleanCell() aquí: formatDate() distingue un number crudo (serial
    // de Excel) de un string.
    const fecha      = cols.fecha !== -1 ? row[cols.fecha] : undefined;
    const referencia = cols.referencia !== -1 ? cleanReferencia(row[cols.referencia]) : null;

    if (!fecha || !referencia || referencia.length < 3) continue;

    let monto;
    let tipo;
    if (cols.monto !== -1 && row[cols.monto] !== '' && row[cols.monto] != null) {
      monto = parseAmount(row[cols.monto], separador);
      tipo  = esNegativo(row[cols.monto]) ? 'egreso' : 'ingreso';
    } else {
      const deb = cols.debito !== -1 ? parseAmount(row[cols.debito], separador) : 0;
      const cre = cols.credito !== -1 ? parseAmount(row[cols.credito], separador) : 0;
      monto = cre || deb;
      tipo  = deb > 0 ? 'egreso' : 'ingreso';
    }

    if (!monto) continue;

    transactions.push({
      fecha:       formatDate(fecha, orden),
      referencia,
      monto,
      tipo,
      descripcion: cols.descripcion !== -1 ? cleanCell(row[cols.descripcion]) : '',
    });
  }

  return transactions;
}
