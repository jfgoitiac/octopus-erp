import { useState } from 'react';
import {
  METODOS_COBRANZA, esMetodoBancario, esMetodoVes, esPuntoDeVenta,
  normalizarReferencia, normalizarLote, validarMetodoPago, valorInicialMetodo,
} from './metodoPagoUtils';

// Campos de un método de pago de cobranza. Lo usan el modal de abono CxC y
// el POS. Controlado: `value` tiene la forma de `valorInicialMetodo()`
// ({ metodo_pago, monto, banco_receptor, banco_procedencia, referencia,
// numero_lote }) y `onChange(nuevoValue)` recibe el objeto completo.
//
// Props fijas del contrato: { value, onChange, bancos, tasa, metodosPermitidos }
//  - bancos: catálogo de GET cantina/bancos/ ([{ id, nombre, tipos }]); se
//    filtra por los que aceptan el método elegido.
//  - tasa: tasa BCV (número) para el equivalente USD⇄VES.
//  - metodosPermitidos: lista de values; por defecto los 6 de cobranza.
// Props opcionales (no cambian el contrato): `ocultarMonto` (POS: el monto es
// el total del carrito), `ocultarSelector` (POS: el método ya se eligió en el
// carrito), `mostrarErrores` (fuerza mostrar errores sin esperar
// el blur) y `disabled`.

const FIELD_STYLE = { border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)', fontSize: '16px' };
const LABEL_CLASS = 'block text-[11px] uppercase tracking-widest mb-1.5';
const INPUT_CLASS = 'w-full px-3 py-2 rounded-lg text-sm outline-none min-h-[44px]';
const ACTIVE_STYLE = { border: '1.5px solid var(--pb)', color: 'var(--pb)', background: 'var(--pb-light, #e6f7f9)' };
const IDLE_STYLE = { border: '0.5px solid var(--border-md)', color: 'var(--ash)', background: '#fff' };

function Campo({ label, error, children }) {
  return (
    <div className="min-w-0">
      <label className={LABEL_CLASS} style={{ color: 'var(--ash)' }}>{label}</label>
      {children}
      {error && <p className="text-[11px] mt-1" style={{ color: '#ef4444' }}>{error}</p>}
    </div>
  );
}

const estiloCampo = (error) => (error ? { ...FIELD_STYLE, border: '1px solid #ef4444' } : FIELD_STYLE);

export default function MetodoPagoFields({
  value, onChange, bancos = [], tasa = 0, metodosPermitidos,
  ocultarMonto = false, ocultarSelector = false, mostrarErrores = false, disabled = false,
}) {
  const [tocado, setTocado] = useState({});
  const v = value ?? valorInicialMetodo();
  const metodo = v.metodo_pago;

  const metodos = METODOS_COBRANZA.filter(m => !metodosPermitidos || metodosPermitidos.includes(m.value));
  const bancosDelMetodo = bancos.filter(b => Array.isArray(b.tipos) && b.tipos.includes(metodo));

  const errores = validarMetodoPago(v, { conMonto: !ocultarMonto });
  const err = (campo) => (mostrarErrores || tocado[campo] ? errores[campo] : undefined);
  const tocar = (campo) => () => setTocado(p => ({ ...p, [campo]: true }));
  const set = (cambios) => onChange({ ...v, ...cambios });

  const cambiarMetodo = (nuevo) => {
    if (nuevo === metodo) return;
    setTocado({});
    // Cambiar de moneda invalida el monto tipeado; los datos bancarios
    // tampoco se arrastran entre métodos (cada uno tiene su formato).
    onChange({ ...valorInicialMetodo(nuevo), monto: esMetodoVes(nuevo) === esMetodoVes(metodo) ? v.monto : '' });
  };

  const enVes = esMetodoVes(metodo);
  const montoNum = parseFloat(v.monto);
  const equivalente = !Number.isNaN(montoNum) && montoNum > 0 && tasa > 0
    ? (enVes ? `≈ $${(montoNum / tasa).toFixed(2)} USD` : `≈ Bs. ${(montoNum * tasa).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`)
    : null;

  return (
    <div className="space-y-3">
      {!ocultarSelector && (
        <div>
          <label className={LABEL_CLASS} style={{ color: 'var(--ash)' }}>Método de pago</label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
            {metodos.map(m => (
              <button
                key={m.value}
                type="button"
                onClick={() => cambiarMetodo(m.value)}
                disabled={disabled}
                aria-pressed={metodo === m.value}
                className="py-2 px-2 rounded-lg text-xs font-medium min-h-[44px] disabled:opacity-50"
                style={metodo === m.value ? ACTIVE_STYLE : IDLE_STYLE}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {!ocultarMonto && (
        <Campo label={enVes ? 'Monto (Bs.)' : 'Monto (USD)'} error={err('monto')}>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold" style={{ color: 'var(--ash)' }}>
              {enVes ? 'Bs.' : '$'}
            </span>
            <input
              type="number"
              min="0.01"
              step="0.01"
              inputMode="decimal"
              className={`${INPUT_CLASS} pl-10 font-semibold`}
              style={estiloCampo(err('monto'))}
              value={v.monto}
              onChange={e => set({ monto: e.target.value })}
              onBlur={tocar('monto')}
              placeholder="0.00"
              disabled={disabled}
            />
          </div>
          {enVes && !(tasa > 0) ? (
            <p className="text-[11px] mt-1" style={{ color: '#b45309' }}>No hay tasa vigente: no se puede convertir a USD.</p>
          ) : equivalente && (
            <p className="text-[11px] mt-1" style={{ color: 'var(--ash)' }}>{equivalente} · tasa {Number(tasa).toFixed(2)}</p>
          )}
        </Campo>
      )}

      {esMetodoBancario(metodo) && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Campo label="Banco receptor" error={err('banco_receptor')}>
              <select
                className={INPUT_CLASS}
                style={estiloCampo(err('banco_receptor'))}
                value={v.banco_receptor}
                onChange={e => set({ banco_receptor: e.target.value })}
                onBlur={tocar('banco_receptor')}
                disabled={disabled}
              >
                <option value="">Seleccionar banco…</option>
                {bancosDelMetodo.map(b => <option key={b.id} value={b.id}>{b.nombre}</option>)}
              </select>
              {bancosDelMetodo.length === 0 && (
                <p className="text-[11px] mt-1" style={{ color: '#b45309' }}>No hay bancos configurados para este método.</p>
              )}
            </Campo>
            <Campo label="Banco de procedencia">
              <input
                className={INPUT_CLASS}
                style={FIELD_STYLE}
                value={v.banco_procedencia}
                onChange={e => set({ banco_procedencia: e.target.value })}
                placeholder="Banco del representante"
                maxLength={100}
                disabled={disabled}
              />
            </Campo>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Campo
              label={metodo === 'zelle' ? 'Confirmación Zelle' : `Referencia (${esPuntoDeVenta(metodo) ? 4 : 6} dígitos)`}
              error={err('referencia')}
            >
              <input
                type="text"
                inputMode={metodo === 'zelle' ? 'text' : 'numeric'}
                className={INPUT_CLASS}
                style={estiloCampo(err('referencia'))}
                value={v.referencia}
                onChange={e => set({ referencia: normalizarReferencia(metodo, e.target.value) })}
                onBlur={tocar('referencia')}
                placeholder={metodo === 'zelle' ? 'N.º de confirmación' : 'Ej: 123456'}
                disabled={disabled}
              />
            </Campo>
            {esPuntoDeVenta(metodo) && (
              <Campo label="Lote (4 dígitos)" error={err('numero_lote')}>
                <input
                  type="text"
                  inputMode="numeric"
                  className={INPUT_CLASS}
                  style={estiloCampo(err('numero_lote'))}
                  value={v.numero_lote}
                  onChange={e => set({ numero_lote: normalizarLote(e.target.value) })}
                  onBlur={tocar('numero_lote')}
                  placeholder="0000"
                  disabled={disabled}
                />
              </Campo>
            )}
          </div>
        </>
      )}
    </div>
  );
}
