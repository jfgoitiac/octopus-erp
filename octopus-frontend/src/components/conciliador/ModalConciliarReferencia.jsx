import { memo } from 'react';
import { Link2, CheckCircle, AlertCircle, Lock, RotateCcw, Loader2 } from 'lucide-react';
import { format, parseISO, isValid } from 'date-fns';
import { es } from 'date-fns/locale';
import { Modal } from '../ui/Modal';
import { Tabla } from '../ui/Tabla';
import DatePickerES from '../DatePickerES';
import { Bone } from '../shared/Skeleton';
import { claveCandidato } from '../../hooks/useConciliacionSemiauto';

const fmt = (v) =>
  Number(v || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fechaLarga = (iso) => {
  if (!iso) return '—';
  try {
    const d = parseISO(String(iso));
    return isValid(d) ? format(d, "dd MMM yyyy", { locale: es }) : String(iso);
  } catch {
    return String(iso);
  }
};

const CANDIDATOS_COLUMNAS = [
  { key: 'sel', label: '' },
  { key: 'ref', label: 'Referencia' },
  { key: 'fecha', label: 'Fecha' },
  { key: 'rep', label: 'Representante / alumnos' },
  { key: 'monto', label: 'Monto (Bs.)', align: 'right' },
  { key: 'estado', label: 'Estado' },
];

const inputBase = {
  border: '1.5px solid var(--border-md)',
  background: 'var(--porcelain)',
  color: 'var(--jet)',
  fontSize: '16px',
};

function EstadoCandidato({ c }) {
  if (c.conciliado) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-medium" style={{ color: 'var(--ash)' }}>
        <Lock size={12} />
        Conciliado{c.lote_id ? ` · Lote #${c.lote_id}` : ''}
      </span>
    );
  }
  if (c.se_aprobara || c.tipo === 'comprobante_pendiente') {
    return (
      <span
        className="inline-block px-2 py-0.5 rounded-full text-[10px] font-medium"
        style={{ background: '#fef9c3', color: '#a16207' }}
      >
        Se aprobará al conciliar
      </span>
    );
  }
  return (
    <span
      className="inline-block px-2 py-0.5 rounded-full text-[10px] font-medium"
      style={{ background: 'var(--green-light, #f0fdf4)', color: 'var(--green, #16a34a)' }}
    >
      Pago registrado
    </span>
  );
}

const alumnosTexto = (c) => (c.alumnos || []).join(', ');

function SkeletonCandidatos() {
  return (
    <div className="space-y-2" aria-busy="true" aria-label="Cargando candidatos">
      {[0, 1].map(i => (
        <div key={i} className="rounded-xl p-3 space-y-2" style={{ border: '0.5px solid var(--border-md)' }}>
          <Bone className="h-3 w-1/3" />
          <Bone className="h-2.5 w-2/3" />
          <Bone className="h-2.5 w-1/2" />
        </div>
      ))}
    </div>
  );
}

function PasoTitulo({ n, children }) {
  return (
    <p className="text-[11px] font-medium uppercase tracking-wider mb-2" style={{ color: 'var(--ash)' }}>
      {n} · {children}
    </p>
  );
}

function PasoTransacciones({ matches, txSel, onSelect }) {
  if (matches.length === 0) {
    return (
      <div className="rounded-xl p-3 flex items-center gap-2" style={{ background: 'var(--red-light)', border: '1.5px solid var(--red)' }}>
        <AlertCircle size={16} style={{ color: 'var(--red)' }} />
        <span className="text-sm" style={{ color: 'var(--red)' }}>
          Ninguna transacción del estado de cuenta termina en esos dígitos.
        </span>
      </div>
    );
  }
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      {matches.map((tx, i) => {
        const activo = txSel === tx;
        return (
          <label
            key={`${tx.referencia}-${i}`}
            className="flex items-start gap-2.5 rounded-xl p-3 cursor-pointer"
            style={{
              border: `1.5px solid ${activo ? 'var(--pb)' : 'var(--border-md)'}`,
              background: activo ? 'var(--pb-light)' : 'var(--porcelain)',
            }}
          >
            <input
              type="radio"
              name="conciliar-tx"
              checked={activo}
              onChange={() => onSelect(tx)}
              className="mt-1"
            />
            <div className="min-w-0 flex-1">
              <p className="font-mono text-xs break-all" style={{ color: 'var(--jet)' }}>{tx.referencia}</p>
              <p className="text-[11px]" style={{ color: 'var(--ash)' }}>{tx.fecha}</p>
              {tx.descripcion && (
                <p className="text-[11px] truncate" style={{ color: 'var(--ash)' }} title={tx.descripcion}>{tx.descripcion}</p>
              )}
              <p className="text-sm font-bold" style={{ color: 'var(--pb)' }}>Bs. {fmt(tx.monto)}</p>
            </div>
          </label>
        );
      })}
    </div>
  );
}

function PasoCandidatos({ candidatos, loading, candSel, onSelect }) {
  if (loading) return <SkeletonCandidatos />;
  if (candidatos.length === 0) {
    return (
      <div className="rounded-xl p-3 flex items-center gap-2" style={{ background: 'var(--red-light)', border: '1.5px solid var(--red)' }}>
        <AlertCircle size={16} style={{ color: 'var(--red)' }} />
        <span className="text-sm" style={{ color: 'var(--red)' }}>
          No hay pagos ni comprobantes de este banco con esa referencia.
        </span>
      </div>
    );
  }
  return (
    <>
      {/* Tablet y escritorio: tabla con scroll interno */}
      <div className="hidden sm:block rounded-xl overflow-hidden" style={{ border: '0.5px solid var(--border-md)' }}>
        <Tabla columnas={CANDIDATOS_COLUMNAS} minWidth={680}>
          {candidatos.map(c => {
            const k = claveCandidato(c);
            return (
              <tr key={k} style={{ opacity: c.conciliado ? 0.55 : 1 }}>
                <td className="px-3 py-2.5 sm:px-4">
                  <input
                    type="radio"
                    name="conciliar-cand"
                    aria-label={`Seleccionar referencia ${c.referencia}`}
                    disabled={c.conciliado}
                    checked={candSel === k}
                    onChange={() => onSelect(k)}
                  />
                </td>
                <td className="px-3 py-2.5 sm:px-4 font-mono text-xs" style={{ color: 'var(--jet)' }}>{c.referencia}</td>
                <td className="px-3 py-2.5 sm:px-4 text-xs whitespace-nowrap" style={{ color: 'var(--ash)' }}>{fechaLarga(c.fecha)}</td>
                <td className="px-3 py-2.5 sm:px-4 text-xs" style={{ color: 'var(--jet)' }}>
                  <p className="font-medium">{c.representante || '—'}</p>
                  <p style={{ color: 'var(--ash)' }}>{alumnosTexto(c)}</p>
                </td>
                <td className="px-3 py-2.5 sm:px-4 text-right text-xs font-semibold tabular-nums" style={{ color: 'var(--jet)' }}>{fmt(c.monto_ves)}</td>
                <td className="px-3 py-2.5 sm:px-4"><EstadoCandidato c={c} /></td>
              </tr>
            );
          })}
        </Tabla>
      </div>

      {/* Móvil: tarjetas apiladas */}
      <div className="sm:hidden space-y-2">
        {candidatos.map(c => {
          const k = claveCandidato(c);
          const activo = candSel === k;
          return (
            <label
              key={k}
              className="flex items-start gap-2.5 rounded-xl p-3"
              style={{
                border: `1.5px solid ${activo ? 'var(--pb)' : 'var(--border-md)'}`,
                background: activo ? 'var(--pb-light)' : 'var(--porcelain)',
                opacity: c.conciliado ? 0.55 : 1,
                cursor: c.conciliado ? 'not-allowed' : 'pointer',
              }}
            >
              <input
                type="radio"
                name="conciliar-cand-movil"
                disabled={c.conciliado}
                checked={activo}
                onChange={() => onSelect(k)}
                className="mt-1"
              />
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs break-all" style={{ color: 'var(--jet)' }}>{c.referencia}</span>
                  <span className="text-sm font-bold shrink-0" style={{ color: 'var(--pb)' }}>Bs. {fmt(c.monto_ves)}</span>
                </div>
                <p className="text-[11px]" style={{ color: 'var(--ash)' }}>{fechaLarga(c.fecha)}</p>
                <p className="text-xs font-medium" style={{ color: 'var(--jet)' }}>{c.representante || '—'}</p>
                <p className="text-[11px]" style={{ color: 'var(--ash)' }}>{alumnosTexto(c)}</p>
                <EstadoCandidato c={c} />
              </div>
            </label>
          );
        })}
      </div>
    </>
  );
}

function Comparacion({ comparacion, c }) {
  const { montoBanco, montoSistema, diferencia, fuera } = comparacion;
  const colorDif = fuera ? 'var(--red)' : 'var(--green, #16a34a)';
  const signo = diferencia > 0 ? '+' : '';
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
      <div className="rounded-xl p-3" style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)' }}>
        <p className="text-[11px] uppercase tracking-wider" style={{ color: 'var(--ash)' }}>Monto del banco</p>
        <p className="text-base sm:text-lg font-bold tabular-nums" style={{ color: 'var(--jet)' }}>Bs. {fmt(montoBanco)}</p>
      </div>
      <div className="rounded-xl p-3" style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)' }}>
        <p className="text-[11px] uppercase tracking-wider" style={{ color: 'var(--ash)' }}>Monto en el sistema</p>
        <p className="text-base sm:text-lg font-bold tabular-nums" style={{ color: 'var(--jet)' }}>Bs. {fmt(montoSistema)}</p>
        <p className="text-[11px]" style={{ color: 'var(--ash)' }}>{fechaLarga(c.fecha)}</p>
      </div>
      <div
        className="rounded-xl p-3"
        style={{ border: `1.5px solid ${colorDif}`, background: fuera ? 'var(--red-light)' : 'var(--green-light, #f0fdf4)' }}
      >
        <p className="text-[11px] uppercase tracking-wider" style={{ color: colorDif }}>
          {fuera ? 'Fuera de tolerancia' : 'Dentro de tolerancia'}
        </p>
        <p className="text-base sm:text-lg font-bold tabular-nums" style={{ color: colorDif }}>
          {signo}{fmt(diferencia)} Bs.
        </p>
      </div>
    </div>
  );
}

function ModalConciliarReferenciaBase({ c, bankInfo, transactions, banks = [] }) {
  const {
    open, cerrar, bancoActivo, cambiarBanco, ref, cambiarRef, buscar, buscado,
    desde, hasta, cambiarDesde, cambiarHasta, rangoInvalido, puedeBuscar,
    matches, txSel, setTxSel,
    candidatos, loadingCand, candSel, setCandSel, candidatoSel,
    toleranciaInput, cambiarTolerancia, restablecerTolerancia, toleranciaGlobal, toleranciaValida,
    observacion, setObservacion, observacionRequerida,
    comparacion, puedeConfirmar, enviando, confirmar,
  } = c;

  const titulo = (
    <div className="flex items-center gap-2.5">
      <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'var(--pb-light)' }}>
        <Link2 size={15} style={{ color: 'var(--pb)' }} />
      </div>
      <div>
        <div className="text-sm font-semibold">Conciliar referencia</div>
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
        onClick={cerrar}
        className="w-full sm:w-auto px-4 py-2.5 rounded-lg text-sm font-medium"
        style={{ border: '0.5px solid var(--border-md)', color: 'var(--jet)' }}
      >
        Cancelar
      </button>
      <button
        type="button"
        onClick={confirmar}
        disabled={!puedeConfirmar}
        className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium text-white disabled:opacity-40"
        style={{ background: 'linear-gradient(135deg, var(--pb) 0%, var(--pb-mid) 100%)' }}
      >
        {enviando ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
        Confirmar conciliación
      </button>
    </>
  );

  const mostrarPasos = buscado;

  return (
    <Modal open={open} onClose={cerrar} titulo={titulo} footer={footer} size="xl">
      <div className="space-y-5">
        {banks.length > 1 && (
          <div>
            <label htmlFor="conciliar-banco" className="block text-xs font-medium mb-1.5" style={{ color: 'var(--ash)' }}>
              Banco receptor
            </label>
            <select
              id="conciliar-banco"
              value={bancoActivo}
              onChange={e => cambiarBanco(e.target.value)}
              disabled={enviando}
              className="w-full sm:w-72 px-3 py-2.5 rounded-lg text-sm outline-none"
              style={inputBase}
            >
              {banks.map(b => <option key={b.id} value={b.id}>{b.label}</option>)}
            </select>
            {bancoActivo !== String(bankInfo?.id) && (
              <p className="text-[11px] mt-1" style={{ color: 'var(--ash)' }}>
                Distinto al banco del estado de cuenta cargado: los candidatos se buscan en el banco elegido.
              </p>
            )}
          </div>
        )}

        <div>
          <label htmlFor="conciliar-ref" className="block text-xs font-medium mb-1.5" style={{ color: 'var(--ash)' }}>
            Últimos 4 a 6 dígitos de la referencia
          </label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              id="conciliar-ref"
              type="text"
              inputMode="numeric"
              value={ref}
              onChange={e => cambiarRef(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && puedeBuscar && buscar()}
              placeholder="ej. 1234 a 123456"
              maxLength={6}
              autoFocus
              className="w-full sm:flex-1 px-3 py-2.5 rounded-lg text-sm font-mono tracking-[0.3em] outline-none"
              style={inputBase}
            />
            <button
              type="button"
              onClick={buscar}
              disabled={!puedeBuscar || loadingCand}
              className="w-full sm:w-auto px-4 py-2.5 rounded-lg text-sm font-medium text-white disabled:opacity-40"
              style={{ background: 'linear-gradient(135deg, var(--pb) 0%, var(--pb-mid) 100%)' }}
            >
              Buscar
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3 sm:max-w-md">
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--ash)' }}>Desde (opcional)</label>
              <DatePickerES
                value={desde}
                onChange={e => cambiarDesde(e.target.value)}
                maxDate={hasta || undefined}
                className="w-full px-3 py-2.5 rounded-lg text-sm outline-none"
                style={inputBase}
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--ash)' }}>Hasta (opcional)</label>
              <DatePickerES
                value={hasta}
                onChange={e => cambiarHasta(e.target.value)}
                minDate={desde || undefined}
                className="w-full px-3 py-2.5 rounded-lg text-sm outline-none"
                style={inputBase}
              />
            </div>
          </div>
          {rangoInvalido ? (
            <p className="text-xs mt-1.5" style={{ color: 'var(--red)' }}>La fecha inicial no puede ser posterior a la final.</p>
          ) : (
            <p className="text-[11px] mt-1.5" style={{ color: 'var(--ash)' }}>
              Con un rango de fechas puedes buscar sin dígitos de referencia.
            </p>
          )}
        </div>

        {mostrarPasos && (
          <>
            <div>
              <PasoTitulo n={1}>Estado de cuenta</PasoTitulo>
              <PasoTransacciones matches={matches} txSel={txSel} onSelect={setTxSel} />
            </div>
            <div>
              <PasoTitulo n={2}>Base de datos</PasoTitulo>
              <PasoCandidatos
                candidatos={candidatos}
                loading={loadingCand}
                candSel={candSel}
                onSelect={setCandSel}
              />
            </div>
          </>
        )}

        {comparacion && candidatoSel && (
          <div className="space-y-3">
            <PasoTitulo n={3}>Comparación</PasoTitulo>
            <Comparacion comparacion={comparacion} c={candidatoSel} />

            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:gap-3">
              <div className="w-full sm:w-48">
                <label htmlFor="conciliar-tol" className="block text-xs font-medium mb-1.5" style={{ color: 'var(--ash)' }}>
                  Tolerancia (Bs.)
                </label>
                <input
                  id="conciliar-tol"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  value={toleranciaInput}
                  onChange={e => cambiarTolerancia(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-lg text-sm outline-none"
                  style={inputBase}
                />
              </div>
              <button
                type="button"
                onClick={restablecerTolerancia}
                className="w-full sm:w-auto flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg text-xs"
                style={{ border: '0.5px solid var(--border-md)', color: 'var(--ash)' }}
              >
                <RotateCcw size={12} />
                Usar la global ({fmt(toleranciaGlobal)})
              </button>
            </div>
            {!toleranciaValida && (
              <p className="text-xs" style={{ color: 'var(--red)' }}>Ingresa una tolerancia válida.</p>
            )}

            <div>
              <label htmlFor="conciliar-obs" className="block text-xs font-medium mb-1.5" style={{ color: 'var(--ash)' }}>
                Observación{observacionRequerida ? ' (obligatoria: la diferencia supera la tolerancia)' : ' (opcional)'}
              </label>
              <textarea
                id="conciliar-obs"
                rows={3}
                value={observacion}
                onChange={e => setObservacion(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg text-sm outline-none resize-y"
                style={{
                  ...inputBase,
                  borderColor: observacionRequerida && !observacion.trim() ? 'var(--red)' : 'var(--border-md)',
                }}
              />
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

export default memo(ModalConciliarReferenciaBase);
