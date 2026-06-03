import { useRef, useCallback, useState } from 'react';
import { Plus, Trash2, Printer, Pencil, Check, X, Receipt } from 'lucide-react';
import { getYear } from 'date-fns';

import { useRecibo }       from '../hooks/useRecibo';
import { imprimirRecibo }  from '../utils/imprimirRecibo';
import ReceiptPreview      from '../components/nomina/ReceiptPreview';
import { MESES }           from '../constants/recibo';

// ── Estilos de formulario ────────────────────────────────────────────────────
const inputCls   = 'w-full text-xs px-2.5 py-1.5 rounded-lg outline-none';
const inputStyle = { background: 'var(--porcelain)', border: '0.5px solid var(--border-md)', color: 'var(--jet)' };
const focusOn    = e => { e.currentTarget.style.borderColor = 'var(--pb)'; };
const focusOff   = e => { e.currentTarget.style.borderColor = 'var(--border-md)'; };
const hoverOp    = {
  onMouseEnter: e => (e.currentTarget.style.opacity = '0.8'),
  onMouseLeave: e => (e.currentTarget.style.opacity = '1'),
};

const fmt2 = n =>
  isNaN(n) ? '0,00' : n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ── Componentes de formulario ────────────────────────────────────────────────
const Field = ({ label, children }) => (
  <div>
    <label className="block text-xs mb-1" style={{ color: 'var(--ash)' }}>{label}</label>
    {children}
  </div>
);

const TextInput = ({ value, onChange, placeholder = '' }) => (
  <input
    value={value}
    onChange={onChange}
    placeholder={placeholder}
    className={inputCls}
    style={inputStyle}
    onFocus={focusOn}
    onBlur={focusOff}
  />
);

const NumInput = ({ value, onChange, placeholder = '0.00', step = '0.01' }) => (
  <input
    type="number"
    step={step}
    min="0"
    value={value}
    onChange={onChange}
    placeholder={placeholder}
    className={inputCls}
    style={inputStyle}
    onFocus={focusOn}
    onBlur={focusOff}
  />
);

// ── EditableLabel ────────────────────────────────────────────────────────────
const EditableLabel = ({ value, onChange }) => {
  const [editing, setEditing] = useState(false);
  const [draft,   setDraft]   = useState(value);

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
        <button onClick={commit} aria-label="Confirmar" className="flex-shrink-0 text-green-600 hover:text-green-700">
          <Check size={12} />
        </button>
        <button onClick={cancel} aria-label="Cancelar" className="flex-shrink-0 text-red-500 hover:text-red-600">
          <X size={12} />
        </button>
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

// ── DynamicRows ───────────────────────────────────────────────────────────────
const DynamicRows = ({ title, rows, onChangeRow, onAdd, onRemove }) => {
  const handleRemove = (id, label) => {
    if (!window.confirm(`¿Eliminar "${label}"?`)) return;
    onRemove(id);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--jet)' }}>{title}</p>
        <button
          onClick={onAdd}
          className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg transition-all"
          style={{ background: 'var(--pb-light)', color: 'var(--pb-mid)' }}
          {...hoverOp}
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
              onFocus={focusOn}
              onBlur={focusOff}
            />
            <button
              onClick={() => handleRemove(row.id, row.label)}
              aria-label={`Eliminar ${row.label}`}
              className="flex-shrink-0 p-1.5 rounded-lg transition-all"
              style={{ color: 'var(--ash)' }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--red-light)'; e.currentTarget.style.color = 'var(--red)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent';       e.currentTarget.style.color = 'var(--ash)'; }}
            >
              <Trash2 size={12} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

// ── Página principal ──────────────────────────────────────────────────────────
const card      = 'p-4 rounded-xl space-y-3';
const cardStyle = { background: 'var(--bg)', border: '0.5px solid var(--border)' };

const Recibos = () => {
  const previewRef = useRef(null);

  const {
    info,        setInfoField,   handleLogoUpload,
    asignaciones, updateAsig,   addAsig,  removeAsig,
    retenciones,  updateRet,    addRet,   removeRet,
    alimentario,  setAlimentarioField,
    calcs,
  } = useRecibo();

  const handlePrint = useCallback(
    () => imprimirRecibo(previewRef, info.nombre),
    [info.nombre],
  );

  return (
    <div className="flex h-full" style={{ background: 'var(--bg)' }}>

      {/* ── Panel izquierdo: formulario ──────────────────────────────────── */}
      <div
        className="w-[400px] flex-shrink-0 h-full overflow-y-auto custom-scrollbar"
        style={{ borderRight: '0.5px solid var(--border-md)', background: 'var(--porcelain)' }}
      >
        <div className="p-5 space-y-4">

          {/* Cabecera */}
          <div>
            <h2 className="text-sm font-semibold flex items-center gap-2" style={{ color: 'var(--jet)' }}>
              <Receipt size={15} style={{ color: 'var(--pb)' }} />
              Recibos de Pago
            </h2>
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
              {[
                { field: 'logoColegio', label: 'Logo Colegio' },
                { field: 'logoAvec',    label: 'Logo AVEC'    },
              ].map(({ field, label }) => (
                <div key={field}>
                  <label className="block text-xs mb-1" style={{ color: 'var(--ash)' }}>{label}</label>
                  {info[field] && (
                    <img src={info[field]} alt="" className="w-12 h-12 object-contain mb-1 rounded border" style={{ borderColor: 'var(--border-md)' }} />
                  )}
                  <label
                    className="flex items-center gap-1 text-xs px-2 py-1.5 rounded-lg cursor-pointer w-full justify-center"
                    style={{ background: 'var(--pb-light)', color: 'var(--pb-mid)', border: '0.5px dashed var(--pb)' }}
                  >
                    {info[field] ? 'Cambiar' : 'Subir logo'}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={e => handleLogoUpload(field, e)}
                    />
                  </label>
                </div>
              ))}
            </div>
          </div>

          {/* Período */}
          <div className={card} style={cardStyle}>
            <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--jet)' }}>Período</p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Mes">
                <select
                  value={info.mes}
                  onChange={e => setInfoField('mes', e.target.value)}
                  className={inputCls}
                  style={inputStyle}
                  onFocus={focusOn}
                  onBlur={focusOff}
                >
                  {MESES.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </Field>
              <Field label="Año">
                <input
                  type="number"
                  min="2000"
                  max="2100"
                  value={info.año}
                  onChange={e => setInfoField('año', e.target.value)}
                  placeholder={String(getYear(new Date()))}
                  className={inputCls}
                  style={inputStyle}
                  onFocus={focusOn}
                  onBlur={focusOff}
                />
              </Field>
            </div>
            <Field label="Tipo de recibo">
              <TextInput
                value={info.tipoRecibo}
                onChange={e => setInfoField('tipoRecibo', e.target.value)}
              />
            </Field>
          </div>

          {/* Datos del empleado */}
          <div className={card} style={cardStyle}>
            <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--jet)' }}>Datos del Empleado</p>
            <Field label="Apellidos y Nombres">
              <TextInput value={info.nombre}    onChange={e => setInfoField('nombre', e.target.value)}    placeholder="PÉREZ JUAN" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="C.I Nº">
                <TextInput value={info.cedula}       onChange={e => setInfoField('cedula', e.target.value)}       placeholder="V-12.345.678" />
              </Field>
              <Field label="Nº H/Sem">
                <TextInput value={info.horasSemana}  onChange={e => setInfoField('horasSemana', e.target.value)}  placeholder="36" />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Cargo">
                <TextInput value={info.cargo}        onChange={e => setInfoField('cargo', e.target.value)}        placeholder="PPH" />
              </Field>
              <Field label="Fecha de Ingreso">
                <TextInput value={info.fechaIngreso} onChange={e => setInfoField('fechaIngreso', e.target.value)} placeholder="18/09/2017" />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Título">
                <TextInput value={info.titulo}  onChange={e => setInfoField('titulo', e.target.value)}  placeholder="LND" />
              </Field>
              <Field label="Nivel">
                <TextInput value={info.nivel}   onChange={e => setInfoField('nivel', e.target.value)}   placeholder="EMG" />
              </Field>
            </div>
            <Field label="Categoría Docente">
              <TextInput value={info.categoriaDocente} onChange={e => setInfoField('categoriaDocente', e.target.value)} placeholder="Docente" />
            </Field>
          </div>

          {/* Asignaciones */}
          <div className="p-4 rounded-xl" style={cardStyle}>
            <DynamicRows
              title="Asignaciones Mensuales"
              rows={asignaciones}
              onChangeRow={updateAsig}
              onAdd={addAsig}
              onRemove={removeAsig}
            />
            <div className="mt-3 pt-2 space-y-1" style={{ borderTop: '0.5px solid var(--border)' }}>
              <div className="flex justify-between text-xs">
                <span style={{ color: 'var(--ash)' }}>Total Asignaciones</span>
                <span className="font-semibold" style={{ color: 'var(--jet)' }}>{fmt2(calcs.totalAsignaciones)}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span style={{ color: 'var(--ash)' }}>1ra Quincena</span>
                <span style={{ color: 'var(--jet)' }}>{fmt2(calcs.primerQuincena)}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span style={{ color: 'var(--ash)' }}>2da Quincena</span>
                <span style={{ color: 'var(--jet)' }}>{fmt2(calcs.segundaQuincena)}</span>
              </div>
            </div>
          </div>

          {/* Retenciones */}
          <div className="p-4 rounded-xl" style={cardStyle}>
            <DynamicRows
              title="Retenciones"
              rows={retenciones}
              onChangeRow={updateRet}
              onAdd={addRet}
              onRemove={removeRet}
            />
            <div className="mt-3 pt-2" style={{ borderTop: '0.5px solid var(--border)' }}>
              <div className="flex justify-between text-xs">
                <span style={{ color: 'var(--ash)' }}>Total Retenciones</span>
                <span className="font-semibold" style={{ color: '#b91c1c' }}>{fmt2(calcs.totalRetenciones)}</span>
              </div>
            </div>
          </div>

          {/* Neto a Depositar */}
          <div
            className="px-4 py-3 rounded-xl flex justify-between items-center"
            style={{ background: 'var(--pb-light)', border: '0.5px solid var(--pb)' }}
          >
            <span className="text-xs font-semibold" style={{ color: 'var(--pb-mid)' }}>Neto a Depositar</span>
            <span className="text-sm font-bold"     style={{ color: 'var(--pb-mid)' }}>{fmt2(calcs.netoDepositar)}</span>
          </div>

          {/* Programa Alimentario */}
          <div className={card} style={cardStyle}>
            <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--jet)' }}>Programa Alimentario</p>
            <Field label="Monto beneficio por hora">
              <NumInput value={alimentario.montoPorHora} onChange={e => setAlimentarioField('montoPorHora', e.target.value)} />
            </Field>
            <Field label="Costo diario del beneficio (auto)">
              <div
                className={`${inputCls} text-right`}
                style={{ ...inputStyle, color: 'var(--ash)', cursor: 'default' }}
              >
                {fmt2(calcs.costoDiario)}
              </div>
              <p className="text-[10px] mt-0.5" style={{ color: 'var(--ash)' }}>
                = Monto/hora × H/día — configura H/día en Pagos → Cesta Ticket
              </p>
            </Field>
            <Field label="Total Beneficio de Alimentación">
              <NumInput value={alimentario.totalBeneficio}       onChange={e => setAlimentarioField('totalBeneficio',       e.target.value)} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Nº H/MENS inasistencia">
                <NumInput
                  step="1"
                  placeholder="0"
                  value={alimentario.horasInasistencia}
                  onChange={e => setAlimentarioField('horasInasistencia', e.target.value)}
                />
              </Field>
              <Field label="Descuento inasistencia">
                <NumInput value={alimentario.descuentoInasistencia} onChange={e => setAlimentarioField('descuentoInasistencia', e.target.value)} />
              </Field>
            </div>
            <div className="flex justify-between text-xs pt-1" style={{ borderTop: '0.5px solid var(--border)' }}>
              <span style={{ color: 'var(--ash)' }}>Total Beneficio a Recibir</span>
              <span className="font-semibold" style={{ color: '#b91c1c' }}>{fmt2(calcs.totalBeneficioRecibir)}</span>
            </div>
          </div>

          {/* Botón imprimir */}
          <button
            onClick={handlePrint}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-opacity"
            style={{ background: 'linear-gradient(135deg, var(--pb) 0%, var(--pb-mid) 100%)', color: '#fff' }}
            {...hoverOp}
          >
            <Printer size={15} />
            Imprimir / Guardar PDF
          </button>

          <div className="pb-2" />
        </div>
      </div>

      {/* ── Panel derecho: vista previa A4 ──────────────────────────────── */}
      <div
        className="flex-1 h-full overflow-y-auto custom-scrollbar flex flex-col items-center py-8 gap-4"
        style={{ background: 'linear-gradient(160deg, #c8d6e5 0%, #b8c9d8 100%)' }}
      >
        <span
          className="text-xs font-medium px-3 py-1 rounded-full shadow-sm"
          style={{ background: 'rgba(30,58,95,0.18)', color: '#1e3a5f', letterSpacing: '0.04em' }}
        >
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
