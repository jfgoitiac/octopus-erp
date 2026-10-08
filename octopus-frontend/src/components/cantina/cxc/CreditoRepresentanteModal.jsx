import { useState } from 'react';
import { toast } from 'react-toastify';
import { Modal } from '../../ui/Modal';
import { actualizarCreditoCxc } from '../../../api/cantina.service';
import { mensajeError, fmtUsd } from './utilsCxc';

const FIELD_STYLE = { border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)', fontSize: '15px' };

// Edita el límite de crédito (vacío = usa el default del colegio) y el bloqueo.
// Solo se monta para administrador/director.
const CreditoRepresentanteModal = ({ open, onClose, representanteId, limiteUsd, limitePersonalizado, bloqueado, onGuardado }) => {
  const inicial = limitePersonalizado && limiteUsd != null ? String(limiteUsd) : '';
  const [limite, setLimite] = useState(inicial);
  const [bloq, setBloq] = useState(Boolean(bloqueado));
  const [guardando, setGuardando] = useState(false);

  const guardar = async () => {
    const texto = limite.trim().replace(',', '.');
    if (texto !== '' && (Number.isNaN(Number(texto)) || Number(texto) < 0)) {
      toast.warning('El límite debe ser un monto en USD de 0 o más.');
      return;
    }
    setGuardando(true);
    try {
      const payload = { bloqueado: bloq };
      // Solo se envía el límite si cambió (null = volver al límite general).
      if (limite.trim().replace(',', '.') !== inicial) {
        payload.limite_usd = texto === '' ? null : Number(texto).toFixed(2);
      }
      await actualizarCreditoCxc(representanteId, payload);
      toast.success('Crédito del representante actualizado.');
      onGuardado?.();
      onClose();
    } catch (err) {
      toast.error(await mensajeError(err, 'No se pudo actualizar el crédito.'));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      titulo="Límite de crédito"
      size="sm"
      footer={(
        <>
          <button type="button" onClick={onClose} className="px-4 py-2.5 rounded-xl text-sm min-h-[40px]" style={{ border: '0.5px solid var(--border-md)', color: 'var(--jet)' }}>
            Cancelar
          </button>
          <button type="button" onClick={guardar} disabled={guardando} className="px-4 py-2.5 rounded-xl text-sm font-medium text-white min-h-[40px] disabled:opacity-60" style={{ background: 'var(--pb)' }}>
            {guardando ? 'Guardando…' : 'Guardar'}
          </button>
        </>
      )}
    >
      <div className="flex flex-col gap-4">
        <div>
          <label htmlFor="cxc-limite" className="block text-xs uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>
            Límite en USD
          </label>
          <input
            id="cxc-limite"
            type="text"
            inputMode="decimal"
            value={limite}
            onChange={e => setLimite(e.target.value)}
            placeholder={!limitePersonalizado && limiteUsd != null ? `Usa el límite general: ${fmtUsd(limiteUsd)}` : 'Usa el límite general'}
            className="w-full px-3 py-2 rounded-lg outline-none min-h-[40px]"
            style={FIELD_STYLE}
          />
        </div>
        <label className="flex items-start gap-2 text-sm cursor-pointer" style={{ color: 'var(--jet)' }}>
          <input type="checkbox" checked={bloq} onChange={e => setBloq(e.target.checked)} className="mt-0.5 h-4 w-4" />
          <span>Bloquear ventas a crédito a este representante</span>
        </label>
      </div>
    </Modal>
  );
};

export default CreditoRepresentanteModal;
