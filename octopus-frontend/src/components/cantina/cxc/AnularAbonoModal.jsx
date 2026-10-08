import { useState } from 'react';
import { toast } from 'react-toastify';
import { Modal } from '../../ui/Modal';
import { anularAbonoCxc } from '../../../api/cantina.service';
import { fmtUsd, mensajeError } from './utilsCxc';

const MOTIVO_MIN = 10;

// Confirmación con motivo obligatorio para anular una operación de abono.
// Solo se monta para administrador/director.
const AnularAbonoModal = ({ abono, onClose, onAnulado }) => {
  const [motivo, setMotivo] = useState('');
  const [guardando, setGuardando] = useState(false);

  const confirmar = async () => {
    if (motivo.trim().length < MOTIVO_MIN) {
      toast.warning(`Explica el motivo (mínimo ${MOTIVO_MIN} caracteres).`);
      return;
    }
    setGuardando(true);
    try {
      await anularAbonoCxc(abono.operacion_uuid, motivo.trim());
      toast.success('Abono anulado. La deuda fue restituida.');
      onAnulado?.();
      onClose();
    } catch (err) {
      toast.error(await mensajeError(err, 'No se pudo anular el abono.'));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Modal
      open={Boolean(abono)}
      onClose={onClose}
      titulo="Anular abono"
      size="sm"
      footer={(
        <>
          <button type="button" onClick={onClose} className="px-4 py-2.5 rounded-xl text-sm min-h-[40px]" style={{ border: '0.5px solid var(--border-md)', color: 'var(--jet)' }}>
            Cancelar
          </button>
          <button type="button" onClick={confirmar} disabled={guardando} className="px-4 py-2.5 rounded-xl text-sm font-medium text-white min-h-[40px] disabled:opacity-60" style={{ background: 'var(--red)' }}>
            {guardando ? 'Anulando…' : 'Anular abono'}
          </button>
        </>
      )}
    >
      <p className="text-sm mb-3" style={{ color: 'var(--jet)' }}>
        Se anulará el abono de <strong>{fmtUsd(abono?.total_usd)}</strong> y las deudas que cubría volverán a quedar pendientes.
      </p>
      <label htmlFor="cxc-anular-motivo" className="block text-xs uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>
        Motivo
      </label>
      <textarea
        id="cxc-anular-motivo"
        rows={3}
        value={motivo}
        onChange={e => setMotivo(e.target.value)}
        className="w-full px-3 py-2 rounded-lg text-sm outline-none"
        style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)' }}
      />
    </Modal>
  );
};

export default AnularAbonoModal;
