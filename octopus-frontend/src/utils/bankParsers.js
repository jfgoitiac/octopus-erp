export const BANKS = [
  { id: 'bancaribe', label: 'Bancaribe',        color: '#005baa' },
  { id: 'banesco',   label: 'Banesco',           color: '#c8102e' },
  { id: 'tesoro',    label: 'Banco del Tesoro',  color: '#1a3a5c' },
];

const n = (s = '') => s.toString().toLowerCase().trim();

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

function parseAmount(val) {
  if (!val && val !== 0) return 0;
  const str = val.toString().trim();
  if (!str) return 0;
  let clean = str.replace(/[Bs.$\s%]/g, '');
  const lastComma = clean.lastIndexOf(',');
  const lastDot   = clean.lastIndexOf('.');
  if (lastComma > lastDot) {
    clean = clean.replace(/\./g, '').replace(',', '.');
  } else {
    clean = clean.replace(/,/g, '');
  }
  return Math.abs(parseFloat(clean) || 0);
}

function formatDate(val) {
  if (!val && val !== 0) return '';
  if (typeof val === 'number') {
    const d = new Date(Math.round((val - 25569) * 86400 * 1000));
    return d.toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }
  const str = val.toString().trim();
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(str)) return str;
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
    const [y, m, d] = str.split(/[-T]/);
    return `${d}/${m}/${y}`;
  }
  if (/^\d{2}-\d{2}-\d{4}$/.test(str)) return str.replace(/-/g, '/');
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

    const fecha      = row[fechaIdx];
    const referencia = refIdx !== -1 ? row[refIdx]?.toString().trim() : null;

    if (!fecha || !referencia || referencia.length < 3) continue;

    let monto = 0;
    if (montoIdx !== -1 && row[montoIdx] !== '' && row[montoIdx] != null) {
      monto = parseAmount(row[montoIdx]);
    } else {
      const deb = parseAmount(row[debitoIdx]);
      const cre = parseAmount(row[creditoIdx]);
      monto = cre || deb;
    }

    if (monto === 0) continue;

    transactions.push({
      fecha:       formatDate(fecha),
      referencia,
      monto,
      descripcion: descIdx !== -1 ? (row[descIdx]?.toString().trim() || '') : '',
      banco:       bankId,
    });
  }

  return transactions;
}

export function parseStatement(rows, bankId) {
  return genericParse(rows, bankId);
}
