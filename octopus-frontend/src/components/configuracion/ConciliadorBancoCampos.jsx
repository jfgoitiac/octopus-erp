import { COLUMNAS_CONFIG } from '../../utils/configEstadoCuenta';
import { FORMATOS_ESTADO_CUENTA } from '../../utils/bankParsers';

const labelCls = 'block text-[11px] uppercase tracking-widest mb-1.5';
const inputStyle = { border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)', fontSize: '16px' };
const inputCls = 'w-full px-3 py-2 rounded-lg text-sm outline-none';

const FORMATOS_FECHA = [
  ['auto', 'Automático'],
  ['dd/MM/yyyy', 'dd/MM/yyyy (día primero)'],
  ['MM/dd/yyyy', 'MM/dd/yyyy (mes primero)'],
  ['yyyy-MM-dd', 'yyyy-MM-dd (ISO)'],
];
const SEPARADORES = [
  ['auto', 'Automático'],
  [',', 'Coma (1.234,56)'],
  ['.', 'Punto (1,234.56)'],
];

/**
 * Campos de conciliador de un banco: disponibilidad, formato, color y la
 * configuración del estado de cuenta (alias de columnas, fecha, decimal).
 * `form` y `setForm` son el estado del formulario de useBancosCobranza.
 */
export default function ConciliadorBancoCampos({ form, setForm }) {
  const cfg = form.config_form;
  const setCfg = (patch) => setForm(p => ({ ...p, config_form: { ...p.config_form, ...patch } }));
  const setAlias = (key, valor) => setCfg({ columnas: { ...cfg.columnas, [key]: valor } });

  return (
    <div className="space-y-4 rounded-lg p-3 sm:p-4" style={{ border: '0.5px solid var(--border-md)', background: 'var(--bg)' }}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium" style={{ color: 'var(--jet)' }}>Disponible en el conciliador</p>
          <p className="text-xs" style={{ color: 'var(--ash)' }}>Permite elegir este banco al cargar un estado de cuenta.</p>
        </div>
        <label className="relative inline-flex items-center cursor-pointer shrink-0">
          <input type="checkbox" className="sr-only peer" checked={Boolean(form.activo_conciliador)}
            aria-label="Disponible en el conciliador"
            onChange={e => setForm(p => ({ ...p, activo_conciliador: e.target.checked }))} />
          <div className="w-11 h-6 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all"
            style={{ background: form.activo_conciliador ? 'var(--pb)' : 'var(--ash-light)' }}></div>
        </label>
      </div>

      {form.activo_conciliador && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="banco-formato" className={labelCls} style={{ color: 'var(--ash)' }}>Formato del estado de cuenta</label>
              <select id="banco-formato" value={form.formato_estado_cuenta}
                onChange={e => setForm(p => ({ ...p, formato_estado_cuenta: e.target.value }))}
                className={inputCls} style={inputStyle}>
                {FORMATOS_ESTADO_CUENTA.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="banco-color" className={labelCls} style={{ color: 'var(--ash)' }}>Color</label>
              <div className="flex items-center gap-2">
                <input id="banco-color" type="color" value={/^#[0-9a-fA-F]{6}$/.test(form.color) ? form.color : '#64748b'}
                  onChange={e => setForm(p => ({ ...p, color: e.target.value }))}
                  className="h-10 w-12 shrink-0 rounded-lg cursor-pointer p-0.5" style={{ border: '0.5px solid var(--border-md)', background: '#fff' }} />
                <input type="text" value={form.color} placeholder="#64748b" maxLength={7} aria-label="Color en hexadecimal"
                  onChange={e => setForm(p => ({ ...p, color: e.target.value }))}
                  className={`${inputCls} font-mono min-w-0`} style={inputStyle} />
              </div>
            </div>
          </div>

          <div>
            <p className={labelCls} style={{ color: 'var(--ash)' }}>Nombres extra de columnas</p>
            <p className="text-xs mb-2" style={{ color: 'var(--ash)' }}>
              Escribe los encabezados que usa este banco, separados por comas. Se suman a los que ya reconoce el formato.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {COLUMNAS_CONFIG.map(({ key, label, ayuda }) => (
                <div key={key}>
                  <label htmlFor={`banco-col-${key}`} className="block text-xs font-medium mb-1" style={{ color: 'var(--jet)' }}>{label}</label>
                  <input id={`banco-col-${key}`} type="text" value={cfg.columnas[key] || ''}
                    onChange={e => setAlias(key, e.target.value)}
                    className={inputCls} style={inputStyle} placeholder={ayuda} />
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label htmlFor="banco-fmt-fecha" className={labelCls} style={{ color: 'var(--ash)' }}>Formato de fecha</label>
              <select id="banco-fmt-fecha" value={cfg.formato_fecha} onChange={e => setCfg({ formato_fecha: e.target.value })}
                className={inputCls} style={inputStyle}>
                {FORMATOS_FECHA.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="banco-sep-dec" className={labelCls} style={{ color: 'var(--ash)' }}>Separador decimal</label>
              <select id="banco-sep-dec" value={cfg.separador_decimal} onChange={e => setCfg({ separador_decimal: e.target.value })}
                className={inputCls} style={inputStyle}>
                {SEPARADORES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="banco-filas-enc" className={labelCls} style={{ color: 'var(--ash)' }}>Filas máx. hasta el encabezado</label>
              <input id="banco-filas-enc" type="number" inputMode="numeric" min="1" max="200" value={cfg.filas_encabezado_max}
                onChange={e => setCfg({ filas_encabezado_max: e.target.value })}
                className={inputCls} style={inputStyle} placeholder="30" />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
