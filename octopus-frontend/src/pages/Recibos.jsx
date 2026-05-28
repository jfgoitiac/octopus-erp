import { useState, useRef } from 'react';
import { Plus, Trash2, Printer, Pencil, Check, X } from 'lucide-react';

const MESES = [
  'ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO',
  'JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE',
];

let _uid = 20;
const uid = () => ++_uid;

const DEFAULT_ASIGNACIONES = [
  { id: 1, label: 'SUELDO BASE', value: '' },
  { id: 2, label: 'OTRAS ASIGNACIONES', value: '' },
];

const DEFAULT_RETENCIONES = [
  { id: 1, label: 'F.A.O.V', value: '' },
  { id: 2, label: 'S.S.O', value: '' },
  { id: 3, label: 'S.P.F', value: '' },
  { id: 4, label: 'DEDUCCIONES', value: '' },
];

const EditableLabel = ({ value, onChange }) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  const commit = () => { onChange(draft.trim() || value); setEditing(false); };
  const cancel = () => { setDraft(value); setEditing(false); };

  if (editing) {
    return (
      <span className="flex items-center gap-1 w-full">
        <input
          autoFocus
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') cancel(); }}
          className="flex-1 border rounded px-1 py-0.5 text-xs outline-none"
          style={{ borderColor: 'var(--pb)', background: 'var(--bg)', color: 'var(--jet)' }}
        />
        <button onClick={commit} className="flex-shrink-0 text-green-600 hover:text-green-700"><Check size={12}/></button>
        <button onClick={cancel} className="flex-shrink-0 text-red-500 hover:text-red-600"><X size={12}/></button>
      </span>
    );
  }

  return (
    <span
      className="flex items-center gap-1 cursor-pointer group w-full"
      title="Clic para editar nombre"
      onClick={() => { setDraft(value); setEditing(true); }}
    >
      <span className="text-xs font-medium flex-1" style={{ color: 'var(--jet)' }}>{value}</span>
      <Pencil size={9} className="opacity-0 group-hover:opacity-40 transition-opacity flex-shrink-0" style={{ color: 'var(--ash)' }} />
    </span>
  );
};

const DynamicRows = ({ title, rows, onChangeRow, onAdd, onRemove }) => (
  <div>
    <div className="flex items-center justify-between mb-2">
      <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--jet)' }}>{title}</p>
      <button
        onClick={onAdd}
        className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg transition-all"
        style={{ background: 'var(--pb-light)', color: 'var(--pb-mid)' }}
        onMouseEnter={e => { e.currentTarget.style.opacity = '0.8'; }}
        onMouseLeave={e => { e.currentTarget.style.opacity = '1'; }}
      >
        <Plus size={11} /> Agregar
      </button>
    </div>
    <div className="space-y-1.5">
      {rows.map(row => (
        <div key={row.id} className="flex items-center gap-2">
          <div
            className="flex-1 px-2 py-1.5 rounded-lg min-w-0"
            style={{ background: 'var(--porcelain)', border: '0.5px solid var(--border-md)' }}
          >
            <EditableLabel value={row.label} onChange={v => onChangeRow(row.id, 'label', v)} />
          </div>
          <input
            type="number"
            step="0.01"
            min="0"
            placeholder="0.00"
            value={row.value}
            onChange={e => onChangeRow(row.id, 'value', e.target.value)}
            className="w-24 text-right text-xs px-2 py-1.5 rounded-lg outline-none flex-shrink-0"
            style={{ background: 'var(--porcelain)', border: '0.5px solid var(--border-md)', color: 'var(--jet)' }}
            onFocus={e => { e.currentTarget.style.borderColor = 'var(--pb)'; }}
            onBlur={e => { e.currentTarget.style.borderColor = 'var(--border-md)'; }}
          />
          <button
            onClick={() => onRemove(row.id)}
            className="flex-shrink-0 p-1.5 rounded-lg transition-all"
            style={{ color: 'var(--ash)' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--red-light)'; e.currentTarget.style.color = 'var(--red)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--ash)'; }}
          >
            <Trash2 size={12} />
          </button>
        </div>
      ))}
    </div>
  </div>
);

const Field = ({ label, children }) => (
  <div>
    <label className="block text-xs mb-1" style={{ color: 'var(--ash)' }}>{label}</label>
    {children}
  </div>
);

const inputCls = "w-full text-xs px-2.5 py-1.5 rounded-lg outline-none";
const inputStyle = { background: 'var(--porcelain)', border: '0.5px solid var(--border-md)', color: 'var(--jet)' };
const focusOn  = e => { e.currentTarget.style.borderColor = 'var(--pb)'; };
const focusOff = e => { e.currentTarget.style.borderColor = 'var(--border-md)'; };

// ── Vista previa del recibo ──────────────────────────────────────────────────
const ReceiptPreview = ({ info, asignaciones, retenciones, alimentario, calcs }) => {
  const fmt = n => (isNaN(n) || n === '' ? '' : Number(n).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

  const NAVY   = '#1e3a5f';
  const NAVY_L = '#e8eff7';
  const RED    = '#b91c1c';
  const BORDER = '#b0bec5';

  const cell = {
    border: `0.5px solid ${BORDER}`,
    padding: '5px 10px',
    fontSize: '8px',
    fontFamily: '"Arial", sans-serif',
    verticalAlign: 'middle',
    color: '#1e293b',
  };
  const c  = { ...cell, textAlign: 'center' };
  const l  = { ...cell, textAlign: 'left' };
  const r  = { ...cell, textAlign: 'right' };
  const lb = { ...l,  fontWeight: '700', textTransform: 'uppercase' };
  const rb = { ...r,  fontWeight: '700' };

  const secH = {
    ...c,
    background: NAVY,
    color: '#fff',
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    fontSize: '8.5px',
    padding: '7px 10px',
  };

  const subH = {
    ...c,
    background: NAVY_L,
    color: NAVY,
    fontWeight: '700',
    textTransform: 'uppercase',
    fontSize: '7.5px',
  };

  const red  = { ...rb, color: RED };
  const redL = { ...lb, color: RED };

  const stripe = (i) => ({ background: i % 2 === 0 ? '#fff' : '#f8fafc' });

  return (
    <div style={{ width: '100%', minHeight: '802px', fontFamily: '"Arial", sans-serif', background: '#fff', padding: '20px 26px', boxSizing: 'border-box', display: 'flex', flexDirection: 'column' }}>

      {/* Encabezado institucional */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '8px' }}>
        <tbody>
          <tr>
            <td style={{ width: '13%', border: 'none', textAlign: 'center', verticalAlign: 'middle' }}>
              {info.logoColegio
                ? <img src={info.logoColegio} alt="logo" style={{ maxWidth: 68, maxHeight: 68 }} />
                : <div style={{
                    width: 68, height: 68,
                    border: `1.5px dashed ${BORDER}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    margin: '0 auto', fontSize: '7px', color: '#94a3b8',
                    flexDirection: 'column', gap: 2, borderRadius: '4px',
                  }}>
                    <span>Logo</span><span>Colegio</span>
                  </div>
              }
            </td>
            <td style={{ border: 'none', textAlign: 'center', verticalAlign: 'middle', lineHeight: 1.1, fontFamily: '"Arial", sans-serif' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                <span style={{ fontSize: '8px', color: '#374151', fontFamily: '"Arial", sans-serif' }}>REPÚBLICA BOLIVARIANA DE VENEZUELA</span>
                <span style={{ fontSize: '7.5px', color: '#374151' }}>MINISTERIO DEL PODER POPULAR PARA LA EDUCACIÓN</span>
                <span style={{ fontSize: '7.5px', color: '#1e293b' }}>U.E. COLEGIO LOS HIJOS DE MARÍA AUXILIADORA</span>
                <span style={{ fontSize: '7px', color: '#374151' }}>AFILIADO A LA ASOCIACIÓN VENEZOLANA DE EDUCACIÓN CATÓLICA</span>
                <span style={{ fontSize: '7px', color: '#374151' }}>YARACAL ESTADO FALCÓN</span>
                <span style={{ fontSize: '7px', color: '#374151' }}>TELÉFONOS 0259 938 1347</span>
                <span style={{ fontSize: '7px', color: '#374151' }}>CÓDIGO DEA PD00131104 &nbsp;&nbsp; RIF-J-085222910</span>
              </div>
            </td>
            <td style={{ width: '13%', border: 'none', textAlign: 'center', verticalAlign: 'middle' }}>
              {info.logoAvec
                ? <img src={info.logoAvec} alt="avec" style={{ maxWidth: 68, maxHeight: 68 }} />
                : <div style={{
                    width: 68, height: 68,
                    border: `1.5px dashed ${BORDER}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    margin: '0 auto', fontSize: '7px', color: '#94a3b8',
                    flexDirection: 'column', gap: 2, borderRadius: '4px',
                  }}>
                    <span>Logo</span><span>AVEC</span>
                  </div>
              }
            </td>
          </tr>
        </tbody>
      </table>

      {/* Título */}
      <div style={{ textAlign: 'center', marginBottom: '14px' }}>
        <div style={{
          fontWeight: '800', fontSize: '9.5px', textTransform: 'uppercase',
          letterSpacing: '0.06em', color: NAVY, fontFamily: '"Arial", sans-serif',
        }}>
          RECIBO DE PAGO {info.tipoRecibo}
        </div>
        <div style={{
          fontWeight: '600', fontSize: '8.5px', fontFamily: '"Arial", sans-serif',
          color: '#374151', marginTop: '3px',
        }}>
          Mes: {info.mes} {info.año}
        </div>
      </div>

      {/* Datos del empleado */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '8px' }}>
        <tbody>
          <tr>
            <td style={{ ...subH, width: '32%' }}>Apellidos y Nombres</td>
            <td style={{ ...subH, width: '18%' }}>C.I Nº</td>
            <td style={{ ...subH, width: '32%' }}>Nº H /Sem</td>
            <td style={{ ...subH, width: '18%' }}>Cargo</td>
          </tr>
          <tr>
            <td style={c}>{info.nombre}</td>
            <td style={c}>{info.cedula}</td>
            <td style={c}>{info.horasSemana}</td>
            <td style={c}>{info.cargo}</td>
          </tr>
          <tr>
            <td style={subH}>Fecha de Ingreso</td>
            <td style={subH}>Título</td>
            <td style={subH}>Categoría Docente</td>
            <td style={subH}>NIVEL</td>
          </tr>
          <tr>
            <td style={c}>{info.fechaIngreso}</td>
            <td style={c}>{info.titulo}</td>
            <td style={c}>{info.categoriaDocente}</td>
            <td style={c}>{info.nivel}</td>
          </tr>
        </tbody>
      </table>

      {/* Asignaciones + Retenciones */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '8px' }}>
        <tbody>
          <tr>
            <td colSpan={2} style={{ ...secH, width: '50%' }}>ASIGNACIONES MENSUALES</td>
            <td colSpan={2} style={{ ...secH, width: '50%' }}>RETENCIONES</td>
          </tr>
          <tr>
            <td colSpan={2} style={{ padding: 0, verticalAlign: 'top', border: `0.5px solid ${BORDER}` }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <colgroup><col style={{ width: '70%' }}/><col style={{ width: '30%' }}/></colgroup>
                <tbody>
                  {asignaciones.map((a, i) => (
                    <tr key={a.id} style={stripe(i)}>
                      <td style={lb}>{a.label}</td>
                      <td style={r}>{a.value ? fmt(a.value) : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </td>
            <td colSpan={2} style={{ padding: 0, verticalAlign: 'top', border: `0.5px solid ${BORDER}` }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <colgroup><col style={{ width: '70%' }}/><col style={{ width: '30%' }}/></colgroup>
                <tbody>
                  {retenciones.map((ret, i) => (
                    <tr key={ret.id} style={stripe(i)}>
                      <td style={lb}>{ret.label}</td>
                      <td style={r}>{ret.value ? fmt(ret.value) : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </td>
          </tr>
          {/* Totales */}
          <tr style={{ background: NAVY_L }}>
            <td style={{ ...lb, width: '35%', color: NAVY }}>TOTAL ASIGNACIONES</td>
            <td style={{ ...rb, width: '15%', color: NAVY }}>{fmt(calcs.totalAsignaciones)}</td>
            <td style={{ ...redL, width: '35%' }}>Total Retenciones</td>
            <td style={{ ...red, width: '15%' }}>{fmt(calcs.totalRetenciones)}</td>
          </tr>
          <tr>
            <td style={lb}>MONTO PRIMERA QUINCENA</td>
            <td style={rb}>{fmt(calcs.primerQuincena)}</td>
            <td style={cell}></td>
            <td style={cell}></td>
          </tr>
          <tr style={stripe(1)}>
            <td style={lb}>MONTO SEGUNDA QUINCENA</td>
            <td style={rb}>{fmt(calcs.segundaQuincena)}</td>
            <td style={cell}></td>
            <td style={cell}></td>
          </tr>
        </tbody>
      </table>

      {/* Prima discapacidad + Neto */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '8px' }}>
        <tbody>
          <tr>
            <td colSpan={4} style={lb}>PRIMA POR DISCAPACIDAD PARA EL PERSONAL E HIJOS</td>
          </tr>
          <tr style={{ background: '#fff5f5' }}>
            <td colSpan={3} style={{ ...redL, textAlign: 'right', padding: '7px 10px', fontSize: '8.5px' }}>
              Neto a Depositar
            </td>
            <td style={{ ...red, width: '20%', padding: '7px 10px', fontSize: '9px', fontWeight: '800' }}>
              {fmt(calcs.netoDepositar)}
            </td>
          </tr>
        </tbody>
      </table>

      {/* Programa Alimentario */}
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <colgroup>
          <col style={{ width: '35%' }} />
          <col style={{ width: '15%' }} />
          <col style={{ width: '35%' }} />
          <col style={{ width: '15%' }} />
        </colgroup>
        <tbody>
          <tr>
            <td colSpan={4} style={secH}>PROGRAMA ALIMENTARIO</td>
          </tr>
          <tr>
            <td colSpan={3} style={lb}>MONTO DEL BENEFICIO DE ALIMENTACIÓN POR HORA:</td>
            <td style={rb}>{alimentario.montoPorHora ? fmt(alimentario.montoPorHora) : ''}</td>
          </tr>
          <tr style={stripe(1)}>
            <td colSpan={3} style={lb}>COSTO DIARIO DEL BENEFICIO DE ALIMENTACIÓN:</td>
            <td style={rb}>{alimentario.costoDiario ? fmt(alimentario.costoDiario) : ''}</td>
          </tr>
          <tr style={{ background: NAVY_L }}>
            <td colSpan={3} style={{ ...lb, textAlign: 'right', color: NAVY }}>TOTAL BENEFICIO DE ALIMENTACIÓN:</td>
            <td style={{ ...rb, color: NAVY }}>{alimentario.totalBeneficio ? fmt(alimentario.totalBeneficio) : ''}</td>
          </tr>
          <tr>
            <td colSpan={2} style={{ ...redL, borderBottom: 'none' }}>Nº H /MENS de inasistencia</td>
            <td colSpan={2} style={{ ...redL, borderBottom: 'none' }}>Descuento por inasistencia</td>
          </tr>
          <tr>
            <td colSpan={2} style={{ ...r, borderTop: 'none' }}>{alimentario.horasInasistencia || ''}</td>
            <td colSpan={2} style={{ ...r, borderTop: 'none' }}>{alimentario.descuentoInasistencia ? fmt(alimentario.descuentoInasistencia) : ''}</td>
          </tr>
          <tr style={{ background: '#fff5f5' }}>
            <td colSpan={3} style={{ ...redL, textAlign: 'right', padding: '7px 10px', fontSize: '8.5px' }}>
              Total Beneficio de Alimentación a Recibir
            </td>
            <td style={{ ...red, padding: '7px 10px', fontSize: '9px', fontWeight: '800' }}>
              {fmt(calcs.totalBeneficioRecibir)}
            </td>
          </tr>
        </tbody>
      </table>

      {/* Footer */}
      <div style={{
        marginTop: 'auto',
        textAlign: 'center',
        fontSize: '7px',
        fontFamily: '"Arial", sans-serif',
        color: '#64748b',
        lineHeight: 2,
        borderTop: `1.5px solid ${NAVY}`,
        paddingTop: '10px',
      }}>
        Calle el Samán, detrás de la Guardia Nacional en el Municipio Cacique Manaure, Yaracal, Estado Falcon.<br />
        Teléfonos de Contacto: 0259 938 1347 &nbsp;&nbsp; 0426 563 1569
      </div>

    </div>
  );
};

// ── Página principal ─────────────────────────────────────────────────────────
const Recibos = () => {
  const storedLogos = (() => {
    try { return JSON.parse(localStorage.getItem('octopus_logos_recibo') || '{}'); } catch { return {}; }
  })();

  const [info, setInfo] = useState({
    nombre: '', cedula: '', horasSemana: '', cargo: '',
    fechaIngreso: '', titulo: '', categoriaDocente: '', nivel: '',
    mes: MESES[new Date().getMonth()],
    año: String(new Date().getFullYear()),
    tipoRecibo: 'I, II QUINCENA Y BONO DE ALIMENTACION',
    logoColegio: storedLogos.logoColegio || null,
    logoAvec: storedLogos.logoAvec || null,
  });

  const [asignaciones, setAsignaciones] = useState(DEFAULT_ASIGNACIONES.map(r => ({ ...r })));
  const [retenciones,  setRetenciones]  = useState(DEFAULT_RETENCIONES.map(r => ({ ...r })));

  const [alimentario, setAlimentario] = useState({
    montoPorHora: '', costoDiario: '', totalBeneficio: '',
    horasInasistencia: '', descuentoInasistencia: '',
  });

  const previewRef = useRef(null);

  const totalAsignaciones    = asignaciones.reduce((s, a) => s + (parseFloat(a.value) || 0), 0);
  const primerQuincena       = totalAsignaciones / 2;
  const segundaQuincena      = totalAsignaciones / 2;
  const totalRetenciones     = retenciones.reduce((s, r) => s + (parseFloat(r.value) || 0), 0);
  const netoDepositar        = totalAsignaciones - totalRetenciones;
  const totalBeneficioRecibir = (parseFloat(alimentario.totalBeneficio) || 0)
                              - (parseFloat(alimentario.descuentoInasistencia) || 0);

  const calcs = { totalAsignaciones, primerQuincena, segundaQuincena, totalRetenciones, netoDepositar, totalBeneficioRecibir };

  const setInfoField = (field, value) => setInfo(p => ({ ...p, [field]: value }));

  const updateAsig  = (id, f, v) => setAsignaciones(rows => rows.map(r => r.id === id ? { ...r, [f]: v } : r));
  const addAsig     = () => setAsignaciones(rows => [...rows, { id: uid(), label: 'NUEVA ASIGNACIÓN', value: '' }]);
  const removeAsig  = id => setAsignaciones(rows => rows.filter(r => r.id !== id));

  const updateRet   = (id, f, v) => setRetenciones(rows => rows.map(r => r.id === id ? { ...r, [f]: v } : r));
  const addRet      = () => setRetenciones(rows => [...rows, { id: uid(), label: 'NUEVA RETENCIÓN', value: '' }]);
  const removeRet   = id => setRetenciones(rows => rows.filter(r => r.id !== id));

  const handleLogoUpload = (field, e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => setInfoField(field, ev.target.result);
    reader.readAsDataURL(file);
  };

  const handlePrint = () => {
    const el = previewRef.current;
    if (!el) return;
    const win = window.open('', '_blank', 'width=820,height=960');
    win.document.write(`<!DOCTYPE html><html><head>
      <meta charset="UTF-8"/>
      <title>Recibo – ${info.nombre || 'empleado'} – ${info.mes} ${info.año}</title>
      <style>
        *{margin:0;padding:0;box-sizing:border-box;}
        body{background:#fff;}
        @media print{@page{size:A4;margin:10mm;}body{margin:0;}}
      </style>
    </head><body>${el.innerHTML}</body></html>`);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); win.close(); }, 600);
  };

  const textInput = (field, placeholder = '') => (
    <input
      value={info[field]}
      onChange={e => setInfoField(field, e.target.value)}
      placeholder={placeholder}
      className={inputCls}
      style={inputStyle}
      onFocus={focusOn}
      onBlur={focusOff}
    />
  );

  const numInput = (field, placeholder = '0.00') => (
    <input
      type="number"
      step="0.01"
      min="0"
      value={alimentario[field]}
      onChange={e => setAlimentario(p => ({ ...p, [field]: e.target.value }))}
      placeholder={placeholder}
      className={inputCls}
      style={inputStyle}
      onFocus={focusOn}
      onBlur={focusOff}
    />
  );

  const fmt2 = n => isNaN(n) ? '0,00' : n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const card = 'p-4 rounded-xl space-y-3';
  const cardStyle = { background: 'var(--bg)', border: '0.5px solid var(--border)' };

  return (
    <div className="flex h-full" style={{ background: 'var(--bg)' }}>

      {/* ── Panel izquierdo: formulario ─────────────────────────────────── */}
      <div
        className="w-[400px] flex-shrink-0 h-full overflow-y-auto custom-scrollbar"
        style={{ borderRight: '0.5px solid var(--border-md)', background: 'var(--porcelain)' }}
      >
        <div className="p-5 space-y-4">

          <div>
            <h2 className="text-sm font-semibold" style={{ color: 'var(--jet)' }}>Recibos de Pago</h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--ash)' }}>Rellene los datos y genere el recibo</p>
          </div>

          {/* Logos */}
          <div className={card} style={cardStyle}>
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--jet)' }}>Logos</p>
              <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: 'var(--pb-light)', color: 'var(--pb-mid)' }}>
                Desde Configuración
              </span>
            </div>
            <p className="text-[10px] mb-2" style={{ color: 'var(--ash)' }}>
              Los logos se cargan desde el módulo de Configuración. Puedes sobreescribirlos solo para este recibo.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs mb-1" style={{ color: 'var(--ash)' }}>Logo Colegio</label>
                {info.logoColegio && (
                  <img src={info.logoColegio} alt="" className="w-12 h-12 object-contain mb-1 rounded border" style={{ borderColor: 'var(--border-md)' }} />
                )}
                <label className="flex items-center gap-1 text-xs px-2 py-1.5 rounded-lg cursor-pointer w-full justify-center"
                  style={{ background: 'var(--pb-light)', color: 'var(--pb-mid)', border: '0.5px dashed var(--pb)' }}>
                  {info.logoColegio ? 'Cambiar' : 'Subir logo'}
                  <input type="file" accept="image/*" className="hidden" onChange={e => handleLogoUpload('logoColegio', e)} />
                </label>
              </div>
              <div>
                <label className="block text-xs mb-1" style={{ color: 'var(--ash)' }}>Logo AVEC</label>
                {info.logoAvec && (
                  <img src={info.logoAvec} alt="" className="w-12 h-12 object-contain mb-1 rounded border" style={{ borderColor: 'var(--border-md)' }} />
                )}
                <label className="flex items-center gap-1 text-xs px-2 py-1.5 rounded-lg cursor-pointer w-full justify-center"
                  style={{ background: 'var(--pb-light)', color: 'var(--pb-mid)', border: '0.5px dashed var(--pb)' }}>
                  {info.logoAvec ? 'Cambiar' : 'Subir logo'}
                  <input type="file" accept="image/*" className="hidden" onChange={e => handleLogoUpload('logoAvec', e)} />
                </label>
              </div>
            </div>
          </div>

          {/* Período */}
          <div className={card} style={cardStyle}>
            <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--jet)' }}>Período</p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Mes">
                <select value={info.mes} onChange={e => setInfoField('mes', e.target.value)}
                  className={inputCls} style={inputStyle} onFocus={focusOn} onBlur={focusOff}>
                  {MESES.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </Field>
              <Field label="Año">{textInput('año', String(new Date().getFullYear()))}</Field>
            </div>
            <Field label="Tipo de recibo">{textInput('tipoRecibo')}</Field>
          </div>

          {/* Empleado */}
          <div className={card} style={cardStyle}>
            <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--jet)' }}>Datos del Empleado</p>
            <Field label="Apellidos y Nombres">{textInput('nombre', 'PÉREZ JUAN')}</Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="C.I Nº">{textInput('cedula', 'V-12.345.678')}</Field>
              <Field label="Nº H/Sem">{textInput('horasSemana', '36')}</Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Cargo">{textInput('cargo', 'PPH')}</Field>
              <Field label="Fecha de Ingreso">{textInput('fechaIngreso', '18/09/2017')}</Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Título">{textInput('titulo', 'LND')}</Field>
              <Field label="Nivel">{textInput('nivel', 'EMG')}</Field>
            </div>
            <Field label="Categoría Docente">{textInput('categoriaDocente', 'Docente')}</Field>
          </div>

          {/* Asignaciones */}
          <div className="p-4 rounded-xl" style={cardStyle}>
            <DynamicRows title="Asignaciones Mensuales" rows={asignaciones}
              onChangeRow={updateAsig} onAdd={addAsig} onRemove={removeAsig} />
            <div className="mt-3 pt-2 space-y-1" style={{ borderTop: '0.5px solid var(--border)' }}>
              <div className="flex justify-between text-xs">
                <span style={{ color: 'var(--ash)' }}>Total Asignaciones</span>
                <span className="font-semibold" style={{ color: 'var(--jet)' }}>{fmt2(totalAsignaciones)}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span style={{ color: 'var(--ash)' }}>1ra Quincena</span>
                <span style={{ color: 'var(--jet)' }}>{fmt2(primerQuincena)}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span style={{ color: 'var(--ash)' }}>2da Quincena</span>
                <span style={{ color: 'var(--jet)' }}>{fmt2(segundaQuincena)}</span>
              </div>
            </div>
          </div>

          {/* Retenciones */}
          <div className="p-4 rounded-xl" style={cardStyle}>
            <DynamicRows title="Retenciones" rows={retenciones}
              onChangeRow={updateRet} onAdd={addRet} onRemove={removeRet} />
            <div className="mt-3 pt-2" style={{ borderTop: '0.5px solid var(--border)' }}>
              <div className="flex justify-between text-xs">
                <span style={{ color: 'var(--ash)' }}>Total Retenciones</span>
                <span className="font-semibold" style={{ color: '#b91c1c' }}>{fmt2(totalRetenciones)}</span>
              </div>
            </div>
          </div>

          {/* Neto a Depositar */}
          <div className="px-4 py-3 rounded-xl flex justify-between items-center"
            style={{ background: 'var(--pb-light)', border: '0.5px solid var(--pb)' }}>
            <span className="text-xs font-semibold" style={{ color: 'var(--pb-mid)' }}>Neto a Depositar</span>
            <span className="text-sm font-bold" style={{ color: 'var(--pb-mid)' }}>{fmt2(netoDepositar)}</span>
          </div>

          {/* Programa Alimentario */}
          <div className={card} style={cardStyle}>
            <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--jet)' }}>Programa Alimentario</p>
            <Field label="Monto beneficio por hora">{numInput('montoPorHora')}</Field>
            <Field label="Costo diario del beneficio">{numInput('costoDiario')}</Field>
            <Field label="Total Beneficio de Alimentación">{numInput('totalBeneficio')}</Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Nº H/MENS inasistencia">
                <input type="number" step="1" min="0"
                  value={alimentario.horasInasistencia}
                  onChange={e => setAlimentario(p => ({ ...p, horasInasistencia: e.target.value }))}
                  placeholder="0" className={inputCls} style={inputStyle}
                  onFocus={focusOn} onBlur={focusOff} />
              </Field>
              <Field label="Descuento inasistencia">{numInput('descuentoInasistencia')}</Field>
            </div>
            <div className="flex justify-between text-xs pt-1" style={{ borderTop: '0.5px solid var(--border)' }}>
              <span style={{ color: 'var(--ash)' }}>Total Beneficio a Recibir</span>
              <span className="font-semibold" style={{ color: '#b91c1c' }}>{fmt2(totalBeneficioRecibir)}</span>
            </div>
          </div>

          {/* Botón imprimir */}
          <button
            onClick={handlePrint}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-opacity"
            style={{ background: 'linear-gradient(135deg, var(--pb) 0%, var(--pb-mid) 100%)', color: '#fff' }}
            onMouseEnter={e => { e.currentTarget.style.opacity = '0.88'; }}
            onMouseLeave={e => { e.currentTarget.style.opacity = '1'; }}
          >
            <Printer size={15} />
            Imprimir / Guardar PDF
          </button>

          <div className="pb-2" />
        </div>
      </div>

      {/* ── Panel derecho: vista previa ─────────────────────────────────── */}
      <div
        className="flex-1 h-full overflow-y-auto custom-scrollbar flex flex-col items-center py-8 gap-4"
        style={{ background: 'linear-gradient(160deg, #c8d6e5 0%, #b8c9d8 100%)' }}
      >
        <span className="text-xs font-medium px-3 py-1 rounded-full shadow-sm"
          style={{ background: 'rgba(30,58,95,0.18)', color: '#1e3a5f', letterSpacing: '0.04em' }}>
          Vista previa — A4
        </span>
        <div
          ref={previewRef}
          style={{
            width: 595,
            minHeight: 842,
            background: '#fff',
            boxShadow: '0 8px 40px rgba(30,58,95,0.22), 0 2px 8px rgba(30,58,95,0.10)',
            borderRadius: '2px',
          }}
        >
          <ReceiptPreview
            info={info}
            asignaciones={asignaciones}
            retenciones={retenciones}
            alimentario={alimentario}
            calcs={calcs}
          />
        </div>
      </div>
    </div>
  );
};

export default Recibos;
