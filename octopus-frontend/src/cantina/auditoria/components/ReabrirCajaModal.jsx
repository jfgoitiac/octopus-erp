import { useId, useState } from 'react';
import { toast } from 'react-toastify';
import { Loader2, LockOpen } from 'lucide-react';
import { Modal } from '../../../components/ui/Modal';
import { parseApiError } from '../../../utils/apiError';
import { reabrirCaja } from '../api/auditoriaApi';
import { ESTILO_CAMPO } from './CierreFormato';
import { ESTILO_BOTON_SECUNDARIO } from './BitacoraFormato';

const MAX_MOTIVO = 500;
const MIN_MOTIVO = 10;

// Modal "Reabrir caja" (§3 POST cierres/<id>/reabrir/). Crea una apertura
// nueva para el mismo cajero y área; el cierre original no se modifica.
export default function ReabrirCajaModal({ open, cierre, onClose, onReabierta }) {
  const id = useId();
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState(null);
  const [enviando, setEnviando] = useState(false);

  const cerrar = () => {
    if (enviando) return;
    setMotivo('');
    setError(null);
    onClose();
  };

  const confirmar = async () => {
    const limpio = motivo.trim();
    if (limpio.length < MIN_MOTIVO) {
      setError(`Explica el motivo (mínimo ${MIN_MOTIVO} caracteres).`);
      return;
    }
    setEnviando(true);
    try {
      const { data } = await reabrirCaja(cierre.id, { motivo: limpio });
      toast.success(data?.apertura_nueva_id
        ? `Caja reabierta: se creó la apertura #${data.apertura_nueva_id}.`
        : 'Caja reabierta.');
      setMotivo('');
      setError(null);
      onReabierta?.();
    } catch (err) {
      // 409: el cajero ya tiene una caja abierta (mensaje del backend).
      toast.error(`No se pudo reabrir la caja: ${parseApiError(err)}`);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={cerrar}
      size="md"
      titulo="Reabrir caja"
      footer={
        <>
          <button
            type="button"
            onClick={cerrar}
            disabled={enviando}
            className="min-h-[44px] px-4 rounded-xl text-sm font-medium w-full sm:w-auto disabled:opacity-50"
            style={ESTILO_BOTON_SECUNDARIO}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={confirmar}
            disabled={enviando}
            className="inline-flex items-center justify-center gap-1.5 min-h-[44px] px-4 rounded-xl text-sm font-semibold w-full sm:w-auto disabled:opacity-50"
            style={{ background: 'var(--pb)', color: '#fff' }}
          >
            {enviando ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <LockOpen size={16} aria-hidden="true" />}
            Reabrir caja
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-sm rounded-xl p-3" style={{ background: 'var(--yellow-light)', color: 'var(--amber-ink)' }}>
          Se abrirá una caja nueva para <strong>{cierre?.cajero?.nombre ?? 'el cajero'}</strong>. El cierre #{cierre?.id} se
          conserva tal cual y la reapertura queda registrada en la bitácora.
        </p>
        <div>
          <label htmlFor={`${id}-motivo`} className="block text-xs uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>
            Motivo <span style={{ color: 'var(--red)' }}>*</span>
          </label>
          <textarea
            id={`${id}-motivo`}
            value={motivo}
            onChange={(e) => { setMotivo(e.target.value); if (error) setError(null); }}
            maxLength={MAX_MOTIVO}
            rows={4}
            placeholder="Ej.: La cajera cerró antes de registrar las ventas del recreo largo."
            aria-invalid={Boolean(error)}
            aria-describedby={`${id}-ayuda`}
            className="w-full px-3 py-2 rounded-xl text-sm outline-none resize-y min-h-[96px] focus:ring-2 focus:ring-[var(--pb)]"
            style={{ ...ESTILO_CAMPO, border: error ? '0.5px solid var(--red)' : ESTILO_CAMPO.border }}
          />
          <div id={`${id}-ayuda`} className="flex justify-between gap-2 mt-1 text-xs">
            <span role={error ? 'alert' : undefined} style={{ color: error ? 'var(--red)' : 'var(--ash)' }}>
              {error ?? 'Obligatorio. Queda en la bitácora y no se puede editar.'}
            </span>
            <span className="shrink-0" style={{ color: 'var(--ash)' }}>{motivo.length}/{MAX_MOTIVO}</span>
          </div>
        </div>
      </div>
    </Modal>
  );
}

// Botón + modal, listo para la cabecera del detalle del cierre.
export function ReabrirCajaBoton({ cierre, onReabierta }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="inline-flex items-center justify-center gap-1.5 min-h-[40px] px-3 rounded-xl text-sm font-semibold whitespace-nowrap w-full sm:w-auto"
        style={ESTILO_BOTON_SECUNDARIO}
      >
        <LockOpen size={16} aria-hidden="true" style={{ color: 'var(--pb-mid)' }} />
        Reabrir caja
      </button>
      <ReabrirCajaModal
        open={abierto}
        cierre={cierre}
        onClose={() => setAbierto(false)}
        onReabierta={() => { setAbierto(false); onReabierta?.(); }}
      />
    </>
  );
}
