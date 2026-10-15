import { useState } from 'react';
import { Tag, X } from 'lucide-react';
import DecimalInput from '../../DecimalInput';

const FIELD_STYLE = { border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)', fontSize: '16px' };

/**
 * Descuento por venta (D1 de PLAN_AUDITORIA_CANTINA.md): monto en USD
 * (≥ 0, ≤ subtotal) con motivo obligatorio cuando es > 0 — el backend lo
 * vuelve a validar (CONTRATO_AUDITORIA_CANTINA.md §8). Plegado por defecto
 * para no estorbar el cobro normal; el estado vive en CantinaPOS.
 */
export default function DescuentoVenta({
  subtotalUsd, descuento, onCambiarDescuento, motivo, onCambiarMotivo, disabled,
}) {
  const [abierto, setAbierto] = useState(false);
  const montoNum = Number(descuento) || 0;
  const visible = abierto || montoNum > 0 || motivo !== '';

  const quitar = () => {
    onCambiarDescuento('');
    onCambiarMotivo('');
    setAbierto(false);
  };

  if (!visible) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        disabled={disabled || subtotalUsd <= 0}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-40 min-h-[36px]"
        style={{ border: '0.5px dashed var(--border-md)', color: 'var(--pb)' }}
      >
        <Tag size={13} /> Aplicar descuento
      </button>
    );
  }

  const excede = montoNum > subtotalUsd;
  const faltaMotivo = montoNum > 0 && !motivo.trim();

  return (
    <div className="rounded-xl p-3 space-y-2" style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)' }}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs uppercase tracking-widest flex items-center gap-1.5" style={{ color: 'var(--ash)' }}>
          <Tag size={12} /> Descuento
        </p>
        <button
          type="button"
          onClick={quitar}
          disabled={disabled}
          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs disabled:opacity-40"
          style={{ color: 'var(--ash)' }}
          aria-label="Quitar descuento"
        >
          <X size={12} /> Quitar
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <label className="block text-xs" style={{ color: 'var(--ash)' }}>
          <span className="block mb-1">Monto (USD)</span>
          <DecimalInput
            value={descuento}
            onChange={onCambiarDescuento}
            max={subtotalUsd}
            className="w-full px-3 py-2 rounded-lg outline-none min-h-[40px]"
            style={FIELD_STYLE}
          />
        </label>
        <div className="sm:col-span-2">
          <label htmlFor="pos-descuento-motivo" className="block text-xs mb-1" style={{ color: 'var(--ash)' }}>
            Motivo {montoNum > 0 && <span style={{ color: 'var(--red)' }}>*</span>}
          </label>
          <input
            id="pos-descuento-motivo"
            type="text"
            value={motivo}
            onChange={e => onCambiarMotivo(e.target.value)}
            disabled={disabled}
            maxLength={255}
            placeholder="Ej. Producto con empaque dañado"
            className="w-full px-3 py-2 rounded-lg outline-none min-h-[40px]"
            style={{ ...FIELD_STYLE, borderColor: faltaMotivo ? 'var(--red)' : 'var(--border-md)' }}
          />
        </div>
      </div>

      {excede && (
        <p className="text-xs" style={{ color: 'var(--red)' }}>El descuento no puede superar el subtotal (${subtotalUsd.toFixed(2)}).</p>
      )}
      {faltaMotivo && (
        <p className="text-xs" style={{ color: 'var(--red)' }}>El motivo es obligatorio cuando hay descuento.</p>
      )}
    </div>
  );
}
