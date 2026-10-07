// Conversión entre config_estado_cuenta (API) y el estado editable del formulario
// de bancos (alias como texto separado por comas).

export const COLUMNAS_CONFIG = [
  { key: 'referencia',  label: 'Referencia',  ayuda: 'Ej. Nro. Operación, Serial' },
  { key: 'fecha',       label: 'Fecha',       ayuda: 'Ej. Fec. Mov.' },
  { key: 'descripcion', label: 'Descripción', ayuda: 'Ej. Glosa, Detalle' },
  { key: 'debito',      label: 'Débito',      ayuda: 'Ej. Retiros, Cargos' },
  { key: 'credito',     label: 'Crédito',     ayuda: 'Ej. Depósitos, Abonos' },
  { key: 'monto',       label: 'Monto (con signo)', ayuda: 'Si el banco usa una sola columna de importe' },
];

export const CONFIG_FORM_VACIA = {
  columnas: {}, formato_fecha: 'auto', separador_decimal: 'auto', filas_encabezado_max: '',
};

export function textoAAlias(texto) {
  const vistos = new Set();
  return (texto || '')
    .split(/[,;\n]/)
    .map(a => a.trim())
    .filter(a => a && !vistos.has(a.toLowerCase()) && vistos.add(a.toLowerCase()));
}

export function configAFormulario(cfg) {
  const c = cfg && typeof cfg === 'object' ? cfg : {};
  const columnas = {};
  for (const { key } of COLUMNAS_CONFIG) {
    const v = c.columnas?.[key];
    columnas[key] = Array.isArray(v) ? v.join(', ') : '';
  }
  return {
    columnas,
    formato_fecha: c.formato_fecha || 'auto',
    separador_decimal: c.separador_decimal || 'auto',
    filas_encabezado_max: c.filas_encabezado_max ? String(c.filas_encabezado_max) : '',
  };
}

// Solo envía lo que el operador definió; {} equivale a "sin configuración extra".
export function formularioAConfig(form) {
  const f = form || CONFIG_FORM_VACIA;
  const cfg = {};
  const columnas = {};
  for (const { key } of COLUMNAS_CONFIG) {
    const alias = textoAAlias(f.columnas?.[key]);
    if (alias.length) columnas[key] = alias;
  }
  if (Object.keys(columnas).length) cfg.columnas = columnas;
  if (f.formato_fecha && f.formato_fecha !== 'auto') cfg.formato_fecha = f.formato_fecha;
  if (f.separador_decimal && f.separador_decimal !== 'auto') cfg.separador_decimal = f.separador_decimal;
  const max = Number.parseInt(f.filas_encabezado_max, 10);
  if (Number.isFinite(max) && max > 0) cfg.filas_encabezado_max = max;
  return cfg;
}

// Primer mensaje legible de un error DRF ({campo: [msg]} anidado o detail).
export function primerMensajeError(data, fallback) {
  const buscar = (v) => {
    if (!v) return null;
    if (typeof v === 'string') return v;
    if (Array.isArray(v)) return v.map(buscar).find(Boolean) || null;
    if (typeof v === 'object') {
      for (const [k, val] of Object.entries(v)) {
        const m = buscar(val);
        if (m) return k === 'detail' || k === 'non_field_errors' ? m : `${k}: ${m}`;
      }
    }
    return null;
  };
  return buscar(data) || fallback;
}
