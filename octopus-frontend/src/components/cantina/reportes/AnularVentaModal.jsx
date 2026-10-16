import { useState } from 'react';
import { toast } from 'react-toastify';
import { Ban, Loader2 } from 'lucide-react';
import { Modal } from '../../ui/Modal';
import { anularVenta } from '../../../api/cantina.service';

const MOTIVO_MIN = 5;

// Confirmación con motivo obligatorio para anular una venta del POS
// (CONTRATO_AUDITORIA_CANTINA.md §8). El backend reversa stock y saldo de
// tarjeta, y deja el motivo en la bitácora de auditoría.
export default function AnularVentaModal({ venta, onClose, onAnulada }) {
  const [motivo, setMotivo] = useState('');
  const [guardando, setGuardando] = useState(false);
  const motivoCorto = motivo.trim().length < MOTIVO_MIN;

  const confirmar = async () => {
    if (motivoCorto) {
      toast.warning(`Explica el motivo de la anulación (mínimo ${MOTIVO_MIN} caracteres).`);
      return;
    }
    setGuardando(true);
    try {
      await anularVenta(venta.id, motivo.trim());
      toast.success(`Venta #${venta.id} anulada.`);
      onAnulada?.();
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.error || err.response?.data?.detail || 'No se pudo anular la venta.');
    } finally {
      setGuardando(false);
    }
  };

  const footer = (
    <>
      <button
        type="button"
        onClick={onClose}
        className="w-full sm:w-auto px-4 rounded-xl py-2.5 text-sm min-h-[44px]"
        style={{ border: '0.5px solid var(--border-md)', color: 'var(--ash)' }}
      >
        Cancelar
      </button>
      <button
        type="button"
        onClick={confirmar}
        disabled={guardando}
        className="w-full sm:w-auto px-4 text-white rounded-xl py-2.5 text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2 min-h-[44px]"
        style={{ background: 'var(--red)' }}
      >
        {guardando ? <><Loader2 size={14} className="animate-spin" /> Anulando…</> : 'Anular venta'}
      </button>
    </>
  );

  return (
    <Modal
      open={Boolean(venta)}
      onClose={onClose}
      titulo={(
        <>
          <Ban size={17} />
          Anular venta #{venta?.id}
        </>
      )}
      footer={footer}
      size="sm"
    >
      <p className="text-sm mb-1" style={{ color: 'var(--jet)' }}>
        Se anulará la venta de <strong>${Number(venta?.total_usd ?? 0).toFixed(2)}</strong>
        {venta?.alumno_nombre ? <> de {venta.alumno_nombre}</> : null}.
      </p>
      <p className="text-xs mb-4" style={{ color: 'var(--ash)' }}>
        El stock vuelve al inventario y, si se pagó con tarjeta, el saldo se reintegra. Esta acción queda registrada y no se puede deshacer.
      </p>
      <label htmlFor="anular-venta-motivo" className="block text-xs uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>
        Motivo <span style={{ color: 'var(--red)' }}>*</span>
      </label>
      <textarea
        id="anular-venta-motivo"
        rows={3}
        maxLength={500}
        value={motivo}
        onChange={e => setMotivo(e.target.value)}
        placeholder="Ej. Cobro duplicado, el alumno devolvió el producto…"
        className="w-full px-3 py-2 rounded-lg outline-none resize-none"
        style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)', fontSize: '16px' }}
      />
    </Modal>
  );
}
