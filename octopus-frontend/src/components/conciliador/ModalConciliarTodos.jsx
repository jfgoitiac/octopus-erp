import { memo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ListChecks, CheckCircle, AlertCircle, Loader2, RotateCcw, ChevronDown, ChevronRight,
  ArrowRight, Search,
} from 'lucide-react';
import { format, parseISO, isValid } from 'date-fns';
import { es } from 'date-fns/locale';
import { Modal } from '../ui/Modal';
import { Tabla } from '../ui/Tabla';
import { Bone } from '../shared/Skeleton';
import DatePickerES from '../DatePickerES';
import { claveTransaccion, DIGITOS_MIN, DIGITOS_MAX } from '../../utils/conciliacionMasiva';

const fmt = (v) =>
  Number(v || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fechaCorta = (valor) => {
  if (!valor) return '—';
  // El banco puede entregar dd/MM/yyyy; el sistema entrega ISO.
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(valor)) return valor;
  try {
    const d = parseISO(String(valor));
    return isValid(d) ? format(d, 'dd MMM yyyy', { locale: es }) : String(valor);
  } catch {
    return String(valor);
  }
};

const inputBase = {
  border: '1.5px solid var(--border-md)',
  background: 'var(--porcelain)',
  color: 'var(--jet)',
  fontSize: '16px',
};

const ESTADO_INFO = {
  exacta: { label: 'Exacta', color: 'var(--green, #16a34a)', bg: 'var(--green-light, #f0fdf4)' },
  dentro_tolerancia: { label: 'Dentro de tolerancia', color: '#a16207', bg: '#fef9c3' },
  fuera_tolerancia: { label: 'Fuera de tolerancia', color: 'var(--red)', bg: 'var(--red-light)' },
  ambigua: { label: 'Ambigua', color: '#9a3412', bg: '#ffedd5' },
  sin_banco: { label: 'Sin banco', color: 'var(--ash)', bg: 'var(--surface-sunken, #f3f4f6)' },
};

const FILTROS = [
  { key: 'todas', label: 'Todas', campo: 'total' },
  { key: 'exacta', label: 'Exactas', campo: 'exactas' },
  { key: 'dentro_tolerancia', label: 'Dentro de tolerancia', campo: 'dentro_tolerancia' },
  { key: 'fuera_tolerancia', label: 'Fuera de tolerancia', campo: 'fuera_tolerancia' },
  { key: 'ambigua', label: 'Ambiguas', campo: 'ambiguas' },
  { key: 'sin_banco', label: 'Sin banco', campo: 'sin_banco' },
];

const COLUMNAS = [
  { key: 'sel', label: '' },
  { key: 'rep', label: 'Representante / alumnos' },
  { key: 'sistema', label: 'Sistema' },
  { key: 'banco', label: 'Banco' },
  { key: 'dif', label: 'Diferencia (Bs.)', align: 'right' },
  { key: 'estado', label: 'Estado' },
];

function EstadoBadge({ e }) {
  // Una ambigua ya resuelta se muestra con el estado que le corresponde.
  const clave = e.estado === 'ambigua' && e.transaccionEfectiva
    ? (e.fueraEfectiva ? 'fuera_tolerancia' : 'dentro_tolerancia')
    : e.estado;
  const info = ESTADO_INFO[clave] || ESTADO_INFO.sin_banco;
  return (
    <div className="flex flex-col items-start gap-1">
      <span
        className="inline-block px-2 py-0.5 rounded-full text-[10px] font-medium"
        style={{ background: info.bg, color: info.color }}
      >
        {info.label}
      </span>
      {e.tipo === 'comprobante_pendiente' && (
        <span
          className="inline-block px-2 py-0.5 rounded-full text-[10px] font-medium"
          style={{ background: '#fef9c3', color: '#a16207' }}
        >
          Se aprobará al conciliar
        </span>
      )}
    </div>
  );
}

function Diferencia({ e }) {
  if (e.difEfectiva === null || e.difEfectiva === undefined) return <span style={{ color: 'var(--ash)' }}>—</span>;
  const color = e.fueraEfectiva ? 'var(--red)' : 'var(--green, #16a34a)';
  const signo = e.difEfectiva > 0 ? '+' : '';
  return <span className="font-semibold tabular-nums" style={{ color }}>{signo}{fmt(e.difEfectiva)}</span>;
}

function TextoSistema({ e }) {
  return (
    <div className="text-xs space-y-0.5">
      <p className="font-mono break-all" style={{ color: 'var(--jet)' }}>{e.referencia_sistema || '—'}</p>
      <p style={{ color: 'var(--ash)' }}>{fechaCorta(e.fecha)}</p>
      <p className="font-semibold tabular-nums" style={{ color: 'var(--jet)' }}>Bs. {fmt(e.monto_sistema_ves)}</p>
    </div>
  );
}

function TextoBanco({ t }) {
  if (!t) return <span className="text-xs" style={{ color: 'var(--ash)' }}>—</span>;
  return (
    <div className="text-xs space-y-0.5">
      <p className="font-mono break-all" style={{ color: 'var(--jet)' }}>{t.referencia}</p>
      <p style={{ color: 'var(--ash)' }}>{fechaCorta(t.fecha)}</p>
      <p className="font-semibold tabular-nums" style={{ color: 'var(--jet)' }}>Bs. {fmt(t.monto)}</p>
    </div>
  );
}

function SelectorCandidata({ e, valor, onElegir }) {
  return (
    <div>
      <label htmlFor={`cand-${e.id}`} className="block text-[11px] mb-1" style={{ color: 'var(--ash)' }}>
        Elige la transacción del banco
      </label>
      <select
        id={`cand-${e.id}`}
        value={valor || ''}
        onChange={ev => onElegir(e.id, ev.target.value)}
        className="w-full px-2 py-2 rounded-lg text-xs outline-none"
        style={inputBase}
      >
        <option value="">Seleccionar…</option>
        {(e.candidatas || []).map(c => (
          <option key={claveTransaccion(c)} value={claveTransaccion(c)}>
            {c.referencia} · {fechaCorta(c.fecha)} · Bs. {fmt(c.monto)}
          </option>
        ))}
      </select>
    </div>
  );
}

function CampoObservacion({ e, valor, onCambiar }) {
  const vacia = !String(valor || '').trim();
  return (
    <div>
      <label htmlFor={`obs-${e.id}`} className="block text-[11px] mb-1" style={{ color: 'var(--red)' }}>
        Observación obligatoria (fuera de tolerancia)
      </label>
      <input
        id={`obs-${e.id}`}
        type="text"
        value={valor || ''}
        onChange={ev => onCambiar(e.id, ev.target.value)}
        placeholder="Motivo de la diferencia"
        className="w-full px-2 py-2 rounded-lg text-xs outline-none"
        style={{ ...inputBase, borderColor: vacia ? 'var(--red)' : 'var(--border-md)' }}
      />
    </div>
  );
}

function Extras({ c, e }) {
  const ambigua = e.estado === 'ambigua';
  const error = c.erroresFila[e.id];
  if (!ambigua && !e.fueraEfectiva && !error) return null;
  return (
    <div className="space-y-2">
      {ambigua && <SelectorCandidata e={e} valor={c.elecciones[e.id]} onElegir={c.elegirCandidata} />}
      {e.fueraEfectiva && <CampoObservacion e={e} valor={c.observaciones[e.id]} onCambiar={c.cambiarObservacion} />}
      {error && (
        <p className="flex items-start gap-1 text-[11px] font-medium" style={{ color: 'var(--red)' }}>
          <AlertCircle size={12} className="mt-0.5 shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}

function CheckFila({ c, e }) {
  const disabled = !c.puedeMarcar(e);
  return (
    <input
      type="checkbox"
      aria-label={`Incluir ${e.representante || 'operación'} en la conciliación`}
      checked={Boolean(c.seleccion[e.id]) && !disabled}
      disabled={disabled}
      onChange={() => c.alternarSeleccion(e.id)}
      className="w-4 h-4 mt-0.5"
    />
  );
}

function FilasTabla({ c }) {
  return (
    <div className="hidden sm:block rounded-xl overflow-hidden" style={{ border: '0.5px solid var(--border-md)' }}>
      <Tabla columnas={COLUMNAS} minWidth={860}>
        {c.visibles.map(e => (
          <tr key={e.id} className="align-top" style={{ background: c.erroresFila[e.id] ? 'var(--red-light)' : undefined }}>
            <td className="px-3 py-3 sm:px-4"><CheckFila c={c} e={e} /></td>
            <td className="px-3 py-3 sm:px-4 text-xs min-w-[200px]">
              <p className="font-medium" style={{ color: 'var(--jet)' }}>{e.representante || '—'}</p>
              <p style={{ color: 'var(--ash)' }}>{(e.alumnos || []).join(', ')}</p>
              <div className="mt-2 empty:hidden"><Extras c={c} e={e} /></div>
            </td>
            <td className="px-3 py-3 sm:px-4"><TextoSistema e={e} /></td>
            <td className="px-3 py-3 sm:px-4"><TextoBanco t={e.transaccionEfectiva} /></td>
            <td className="px-3 py-3 sm:px-4 text-right text-xs"><Diferencia e={e} /></td>
            <td className="px-3 py-3 sm:px-4"><EstadoBadge e={e} /></td>
          </tr>
        ))}
      </Tabla>
    </div>
  );
}

function TarjetasMovil({ c }) {
  return (
    <div className="sm:hidden space-y-2">
      {c.visibles.map(e => (
        <div
          key={e.id}
          className="rounded-xl p-3 space-y-2.5"
          style={{
            border: `1.5px solid ${c.erroresFila[e.id] ? 'var(--red)' : c.seleccion[e.id] ? 'var(--pb)' : 'var(--border-md)'}`,
            background: c.seleccion[e.id] ? 'var(--pb-light)' : 'var(--porcelain)',
          }}
        >
          <div className="flex items-start gap-2.5">
            <CheckFila c={c} e={e} />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium" style={{ color: 'var(--jet)' }}>{e.representante || '—'}</p>
              <p className="text-[11px]" style={{ color: 'var(--ash)' }}>{(e.alumnos || []).join(', ')}</p>
            </div>
            <Diferencia e={e} />
          </div>
          <div className="grid grid-cols-1 gap-2">
            <div>
              <p className="text-[10px] uppercase tracking-wider mb-0.5" style={{ color: 'var(--ash)' }}>Sistema</p>
              <TextoSistema e={e} />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider mb-0.5" style={{ color: 'var(--ash)' }}>Banco</p>
              <TextoBanco t={e.transaccionEfectiva} />
            </div>
          </div>
          <EstadoBadge e={e} />
          <Extras c={c} e={e} />
        </div>
      ))}
    </div>
  );
}

function SkeletonPropuestas() {
  return (
    <div className="space-y-2" aria-busy="true" aria-label="Calculando coincidencias">
      {[0, 1, 2, 3].map(i => (
        <div key={i} className="rounded-xl p-3 space-y-2" style={{ border: '0.5px solid var(--border-md)' }}>
          <Bone className="h-3 w-1/3" />
          <Bone className="h-2.5 w-2/3" />
          <Bone className="h-2.5 w-1/2" />
        </div>
      ))}
    </div>
  );
}

function SinOperacion({ lista }) {
  const [abierto, setAbierto] = useState(false);
  if (lista.length === 0) return null;
  const Icono = abierto ? ChevronDown : ChevronRight;
  return (
    <div className="rounded-xl" style={{ border: '0.5px solid var(--border-md)' }}>
      <button
        type="button"
        onClick={() => setAbierto(v => !v)}
        aria-expanded={abierto}
        className="w-full flex items-center gap-2 px-3 py-3 text-sm font-medium text-left"
        style={{ color: 'var(--jet)' }}
      >
        <Icono size={15} />
        <span className="flex-1">Movimientos del banco sin pago en el sistema ({lista.length})</span>
      </button>
      {abierto && (
        <div className="px-3 pb-3">
          <div className="hidden sm:block">
            <Tabla
              columnas={[
                { key: 'ref', label: 'Referencia' },
                { key: 'fecha', label: 'Fecha' },
                { key: 'monto', label: 'Monto (Bs.)', align: 'right' },
              ]}
              minWidth={420}
            >
              {lista.map(t => (
                <tr key={claveTransaccion(t)}>
                  <td className="px-3 py-2 sm:px-4 font-mono text-xs" style={{ color: 'var(--jet)' }}>{t.referencia}</td>
                  <td className="px-3 py-2 sm:px-4 text-xs" style={{ color: 'var(--ash)' }}>{fechaCorta(t.fecha)}</td>
                  <td className="px-3 py-2 sm:px-4 text-right text-xs font-semibold tabular-nums" style={{ color: 'var(--jet)' }}>{fmt(t.monto)}</td>
                </tr>
              ))}
            </Tabla>
          </div>
          <ul className="sm:hidden space-y-1.5">
            {lista.map(t => (
              <li key={claveTransaccion(t)} className="rounded-lg p-2.5" style={{ border: '0.5px solid var(--border-md)' }}>
                <TextoBanco t={t} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function ResultadoConciliacion({ r, errores }) {
  if (!r) return null;
  const filasConError = Object.entries(errores);
  return (
    <div
      className="rounded-xl p-3 space-y-2 text-sm"
      style={{
        border: `1.5px solid ${r.errores ? 'var(--red)' : 'var(--green, #16a34a)'}`,
        background: r.errores ? 'var(--red-light)' : 'var(--green-light, #f0fdf4)',
        color: 'var(--jet)',
      }}
      role="status"
    >
      <p className="font-medium">
        {r.conciliadas} {r.conciliadas === 1 ? 'conciliada' : 'conciliadas'}
        {r.errores ? ` · ${r.errores} con error (siguen en la lista)` : ''}
      </p>
      {filasConError.length > 0 && (
        <ul className="text-xs list-disc pl-4 space-y-0.5" style={{ color: 'var(--red)' }}>
          {filasConError.map(([id, msg]) => <li key={id}>{msg}</li>)}
        </ul>
      )}
      {r.lote && (
        <p className="text-xs">Lote abierto: {r.lote.total_operaciones ?? '—'} operaciones.</p>
      )}
      <Link
        to="/reportes?tab=conciliacion"
        className="inline-flex items-center gap-1 text-xs font-medium"
        style={{ color: 'var(--pb)' }}
      >
        Ver en Reportes → Conciliación
        <ArrowRight size={12} />
      </Link>
    </div>
  );
}

function ModalConfirmacion({ c }) {
  const { operaciones, comprobantes, fueraTolerancia } = c.resumenSeleccion;
  const footer = (
    <>
      <button
        type="button"
        onClick={c.cancelarConfirmacion}
        disabled={c.enviando}
        className="w-full sm:w-auto px-4 py-2.5 rounded-lg text-sm font-medium disabled:opacity-40"
        style={{ border: '0.5px solid var(--border-md)', color: 'var(--jet)' }}
      >
        Volver
      </button>
      <button
        type="button"
        onClick={c.confirmar}
        disabled={c.enviando}
        className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium text-white disabled:opacity-40"
        style={{ background: 'linear-gradient(135deg, var(--pb) 0%, var(--pb-mid) 100%)' }}
      >
        {c.enviando ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
        Sí, conciliar
      </button>
    </>
  );
  return (
    <Modal open={c.confirmando} onClose={c.cancelarConfirmacion} titulo="Confirmar conciliación" footer={footer} size="sm" className="z-[60]">
      <div className="space-y-2 text-sm" style={{ color: 'var(--jet)' }}>
        <p>Se conciliarán <strong>{operaciones}</strong> {operaciones === 1 ? 'operación' : 'operaciones'}.</p>
        <p><strong>{comprobantes}</strong> {comprobantes === 1 ? 'comprobante se aprobará' : 'comprobantes se aprobarán'}.</p>
        <p style={{ color: fueraTolerancia ? 'var(--red)' : undefined }}>
          <strong>{fueraTolerancia}</strong> {fueraTolerancia === 1 ? 'operación está' : 'operaciones están'} fuera de tolerancia.
        </p>
        <p className="text-xs" style={{ color: 'var(--ash)' }}>Se agregarán al lote abierto. Esta acción aprueba pagos en el sistema.</p>
      </div>
    </Modal>
  );
}

function ModalConciliarTodosBase({ c, bankInfo, transactions, banks = [] }) {
  const titulo = (
    <div className="flex items-center gap-2.5">
      <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'var(--pb-light)' }}>
        <ListChecks size={15} style={{ color: 'var(--pb)' }} />
      </div>
      <div>
        <div className="text-sm font-semibold">Conciliar todos</div>
        <p className="text-[11px] font-normal" style={{ color: 'rgba(255,255,255,0.8)' }}>
          {bankInfo?.label || bankInfo?.nombre} · {transactions.length} movimientos cargados
        </p>
      </div>
    </div>
  );

  const footer = (
    <>
      <button
        type="button"
        onClick={c.cerrar}
        disabled={c.enviando}
        className="w-full sm:w-auto px-4 py-2.5 rounded-lg text-sm font-medium disabled:opacity-40"
        style={{ border: '0.5px solid var(--border-md)', color: 'var(--jet)' }}
      >
        Cerrar
      </button>
      <button
        type="button"
        onClick={c.pedirConfirmacion}
        disabled={c.enviables.length === 0 || c.enviando}
        className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium text-white disabled:opacity-40"
        style={{ background: 'linear-gradient(135deg, var(--pb) 0%, var(--pb-mid) 100%)' }}
      >
        <CheckCircle size={14} />
        Conciliar seleccionadas ({c.enviables.length})
      </button>
    </>
  );

  const hayPropuestas = c.buscado && c.propuestas.length > 0;
  const vacio = c.buscado && c.propuestas.length === 0 && !c.ultimoResultado;

  return (
    <>
      <Modal open={c.open} onClose={c.cerrar} titulo={titulo} footer={footer} size="xl">
        <div className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {banks.length > 0 && (
              <div className="sm:col-span-2 lg:col-span-1">
                <label htmlFor="todos-banco" className="block text-xs font-medium mb-1.5" style={{ color: 'var(--ash)' }}>
                  Banco receptor
                </label>
                <select
                  id="todos-banco"
                  value={c.bancoActivo}
                  onChange={e => c.cambiarBanco(e.target.value)}
                  disabled={c.enviando}
                  className="w-full px-3 py-2.5 rounded-lg text-sm outline-none"
                  style={inputBase}
                >
                  {banks.map(b => <option key={b.id} value={b.id}>{b.label}</option>)}
                </select>
              </div>
            )}
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--ash)' }}>Desde</label>
              <DatePickerES
                value={c.desde}
                onChange={e => c.cambiarDesde(e.target.value)}
                maxDate={c.hasta || undefined}
                className="w-full px-3 py-2.5 rounded-lg text-sm outline-none"
                style={inputBase}
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--ash)' }}>Hasta</label>
              <DatePickerES
                value={c.hasta}
                onChange={e => c.cambiarHasta(e.target.value)}
                minDate={c.desde || undefined}
                className="w-full px-3 py-2.5 rounded-lg text-sm outline-none"
                style={inputBase}
              />
            </div>
            <div>
              <label htmlFor="todos-tol" className="block text-xs font-medium mb-1.5" style={{ color: 'var(--ash)' }}>
                Tolerancia (Bs.)
              </label>
              <input
                id="todos-tol"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={c.toleranciaInput}
                onChange={e => c.cambiarTolerancia(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg text-sm outline-none"
                style={inputBase}
              />
              <button
                type="button"
                onClick={c.restablecerTolerancia}
                className="mt-1.5 inline-flex items-center gap-1.5 text-[11px]"
                style={{ color: 'var(--ash)' }}
              >
                <RotateCcw size={11} />
                Usar la global ({fmt(c.toleranciaGlobal)})
              </button>
            </div>
            <div>
              <label htmlFor="todos-dig" className="block text-xs font-medium mb-1.5" style={{ color: 'var(--ash)' }}>
                Dígitos de la referencia
              </label>
              <select
                id="todos-dig"
                value={c.digitos}
                onChange={e => c.cambiarDigitos(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg text-sm outline-none"
                style={inputBase}
              >
                {Array.from({ length: DIGITOS_MAX - DIGITOS_MIN + 1 }, (_, i) => DIGITOS_MIN + i).map(n => (
                  <option key={n} value={n}>{n} dígitos</option>
                ))}
              </select>
            </div>
            <div className="flex items-end">
              <button
                type="button"
                onClick={c.buscar}
                disabled={!c.puedeBuscar}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium text-white disabled:opacity-40"
                style={{ background: 'linear-gradient(135deg, var(--pb) 0%, var(--pb-mid) 100%)' }}
              >
                {c.buscando ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
                Buscar coincidencias
              </button>
            </div>
          </div>

          <div className="space-y-1 text-xs">
            {c.rangoInvalido && <p style={{ color: 'var(--red)' }}>La fecha inicial no puede ser posterior a la final.</p>}
            {!c.toleranciaValida && <p style={{ color: 'var(--red)' }}>Ingresa una tolerancia válida.</p>}
            {!c.rangoInvalido && c.desde && c.hasta && (
              <p style={{ color: 'var(--ash)' }}>
                {c.transaccionesEnviar.length} movimientos de ingreso entre {fechaCorta(c.desde)} y {fechaCorta(c.hasta)}.
              </p>
            )}
          </div>

          {c.buscando && <SkeletonPropuestas />}

          {!c.buscando && <ResultadoConciliacion r={c.ultimoResultado} errores={c.erroresFila} />}

          {!c.buscando && vacio && (
            <div className="rounded-xl p-3 flex items-center gap-2" style={{ background: 'var(--red-light)', border: '1.5px solid var(--red)' }}>
              <AlertCircle size={16} style={{ color: 'var(--red)' }} />
              <span className="text-sm" style={{ color: 'var(--red)' }}>No se encontraron coincidencias para ese rango.</span>
            </div>
          )}

          {!c.buscando && hayPropuestas && (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar por estado">
                {FILTROS.map(f => {
                  const activo = c.filtroEstado === f.key;
                  const n = c.resumen[f.campo] ?? 0;
                  return (
                    <button
                      key={f.key}
                      type="button"
                      onClick={() => c.setFiltroEstado(f.key)}
                      aria-pressed={activo}
                      className="px-3 py-1.5 rounded-full text-xs font-medium"
                      style={{
                        border: `1.5px solid ${activo ? 'var(--pb)' : 'var(--border-md)'}`,
                        background: activo ? 'var(--pb-light)' : 'transparent',
                        color: activo ? 'var(--pb)' : 'var(--ash)',
                      }}
                    >
                      {f.label} ({n})
                    </button>
                  );
                })}
              </div>

              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between text-xs" style={{ color: 'var(--ash)' }}>
                <label className="inline-flex items-center gap-2 cursor-pointer" style={{ color: 'var(--jet)' }}>
                  <input
                    type="checkbox"
                    checked={c.todasMarcadas}
                    onChange={c.alternarTodas}
                    disabled={c.visibles.length === 0}
                    className="w-4 h-4"
                  />
                  Seleccionar todas las visibles
                </label>
                <span>
                  Mostrando {c.visibles.length} de {c.propuestas.length} · seleccionadas {c.enviables.length}
                </span>
              </div>

              {c.visibles.length === 0 ? (
                <p className="text-sm py-4 text-center" style={{ color: 'var(--ash)' }}>No hay propuestas con ese estado.</p>
              ) : (
                <>
                  <FilasTabla c={c} />
                  <TarjetasMovil c={c} />
                </>
              )}
            </div>
          )}

          {!c.buscando && c.buscado && <SinOperacion lista={c.sinOperacion} />}
        </div>
      </Modal>
      <ModalConfirmacion c={c} />
    </>
  );
}

export default memo(ModalConciliarTodosBase);
