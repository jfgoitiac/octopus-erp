import { useState, useRef } from 'react';
import { toast } from 'react-toastify';
import { Loader2, SlidersHorizontal } from 'lucide-react';
import { ajustarCreditoTarjeta } from '../../../api/cantina.service';
import { Modal } from '../../ui/Modal';

const FIELD_STYLE = { border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)', fontSize: '16px' };
const LABEL_STYLE = { color: 'var(--ash)' };

// Ajuste puntual del límite de crédito de UNA tarjeta (PATCH
// tarjetas/<id>/credito/). Reutilizado tanto desde la tabla de tarjetas
// (CantinaTarjetas.jsx) como desde el reporte de morosos (CantinaMorosos.jsx)
// — recibe la tarjeta y notifica al padre con la respuesta completa del
// backend para que actualice su fila local sin refetch.
export default function AjustarCreditoModal({ tarjeta, onClose, onAjustado }) {
  const [limite, setLimite] = useState(tarjeta?.limite_credito ?? '');
  const [guardando, setGuardando] = useState(false);
  const abortRef = useRef(null);

  const nombreTarjeta = tarjeta?.alumno_nombre || `Tarjeta ${tarjeta?.serial || ''}`.trim();

  const validar = () => {
    const n = parseFloat(limite);
    if (limite === '' || Number.isNaN(n) || n < 0) {
      toast.warning('Ingresa un límite de crédito válido (0 o mayor).');
      return false;
    }
    return true;
  };

  const handleGuardar = async () => {
    if (!tarjeta?.id) return;
    if (!validar()) return;
    if (guardando) return; // evita doble submit

    setGuardando(true);
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const n = parseFloat(limite);
      const res = await ajustarCreditoTarjeta(tarjeta.id, n.toFixed(2), controller.signal);
      toast.success(`Límite de crédito de ${nombreTarjeta} actualizado a $${n.toFixed(2)}.`);
      onAjustado?.(res.data);
      onClose();
    } catch (err) {
      if (err.name === 'CanceledError' || err.code === 'ERR_CANCELED') return;
      const data = err.response?.data || {};
      const msg = data.detail || data.limite_credito?.[0] || 'No se pudo ajustar el límite de crédito.';
      toast.error(msg);
    } finally {
      setGuardando(false);
    }
  };

  const handleClose = () => { if (!guardando) onClose(); };

  const footer = (
    <>
      <button
        onClick={handleClose}
        disabled={guardando}
        className="w-full sm:w-auto rounded-xl py-2.5 text-sm min-h-[44px] disabled:opacity-40"
        style={{ border: '0.5px solid var(--border-md)', color: 'var(--ash)' }}
      >
        Cancelar
      </button>
      <button
        onClick={handleGuardar}
        disabled={guardando}
        className="w-full sm:w-auto text-white rounded-xl py-2.5 text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2 min-h-[44px]"
        style={{ background: 'var(--pb)' }}
      >
        {guardando ? <><Loader2 size={14} className="animate-spin" /> Guardando...</> : 'Guardar'}
      </button>
    </>
  );

  return (
    <Modal
      open
      onClose={handleClose}
      titulo={(
        <>
          <SlidersHorizontal size={17} />
          Ajustar crédito
        </>
      )}
      footer={footer}
      size="sm"
    >
      <div className="rounded-lg px-3 py-2.5 text-sm flex items-center justify-between gap-2 mb-4" style={{ background: 'var(--pb-light, #e6f7f9)', color: 'var(--pb-mid, #0c7a86)' }}>
        <span>{nombreTarjeta}</span>
        <span className="font-semibold" style={{ color: Number(tarjeta?.saldo) < 0 ? 'var(--red, #dc2626)' : 'var(--pb-mid, #0c7a86)' }}>
          Saldo: ${Number(tarjeta?.saldo ?? 0).toFixed(2)}
        </span>
      </div>

      <div>
        <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={LABEL_STYLE}>
          Límite de crédito (USD)
        </label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold" style={{ color: 'var(--ash)' }}>$</span>
          <input
            type="number"
            min="0"
            step="0.01"
            autoFocus
            className="w-full pl-9 pr-3 py-2 rounded-lg text-sm font-semibold outline-none min-h-[44px]"
            style={FIELD_STYLE}
            value={limite}
            onChange={e => setLimite(e.target.value)}
            placeholder="5.00"
            disabled={guardando}
          />
        </div>
      </div>
    </Modal>
  );
}
