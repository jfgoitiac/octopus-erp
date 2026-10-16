import { useId, useState } from 'react';
import { toast } from 'react-toastify';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { Modal } from '../../../components/ui/Modal';
import { parseApiError } from '../../../utils/apiError';
import { atenderAlerta } from '../api/auditoriaApi';
import { ESTILO_CAMPO } from './CierreFormato';
import { ESTILO_BOTON_PRIMARIO, ESTILO_BOTON_SECUNDARIO, SEVERIDADES_ALERTA } from './BitacoraFormato';

const MAX_NOTA = 500;

// Modal "Atender alerta" (§6 POST alertas/<id>/atender/). La nota es
// obligatoria y queda en la bitácora como `alerta_atendida`.
export default function AlertaAtenderModal({ alerta, onClose, onAtendida }) {
  const id = useId();
  const [nota, setNota] = useState('');
  const [error, setError] = useState(null);
  const [enviando, setEnviando] = useState(false);

  const cerrar = () => {
    if (enviando) return;
    setNota('');
    setError(null);
    onClose();
  };

  const confirmar = async () => {
    const limpia = nota.trim();
    if (!limpia) { setError('Escribe una nota que explique cómo se atendió la alerta.'); return; }
    setEnviando(true);
    try {
      await atenderAlerta(alerta.id, { nota: limpia });
      toast.success('Alerta atendida.');
      setNota('');
      setError(null);
      onAtendida?.();
    } catch (err) {
      toast.error(`No se pudo atender la alerta: ${parseApiError(err)}`);
      // 409: otra persona ya la atendió; se refresca la lista igual.
      if (err.response?.status === 409) onAtendida?.();
    } finally {
      setEnviando(false);
    }
  };

  const sev = SEVERIDADES_ALERTA[alerta?.severidad] ?? SEVERIDADES_ALERTA.info;

  return (
    <Modal
      open={Boolean(alerta)}
      onClose={cerrar}
      size="md"
      titulo="Atender alerta"
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
            style={ESTILO_BOTON_PRIMARIO}
          >
            {enviando ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <CheckCircle2 size={16} aria-hidden="true" />}
            Marcar como atendida
          </button>
        </>
      }
    >
      {alerta && (
        <div className="flex flex-col gap-4">
          <div className="rounded-xl p-3 flex flex-col gap-1" style={{ background: sev.fondo }}>
            <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: sev.color }}>
              {sev.texto} · {alerta.tipo_etiqueta ?? alerta.tipo}
            </span>
            <p className="text-sm font-medium [overflow-wrap:anywhere]" style={{ color: 'var(--jet)' }}>{alerta.titulo}</p>
          </div>
          <div>
            <label htmlFor={`${id}-nota`} className="block text-xs uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>
              Nota de atención <span style={{ color: 'var(--red)' }}>*</span>
            </label>
            <textarea
              id={`${id}-nota`}
              value={nota}
              onChange={(e) => { setNota(e.target.value); if (error) setError(null); }}
              maxLength={MAX_NOTA}
              rows={4}
              placeholder="Ej.: Conversado con la cajera; las anulaciones fueron por error del escáner."
              aria-invalid={Boolean(error)}
              aria-describedby={`${id}-ayuda`}
              className="w-full px-3 py-2 rounded-xl text-sm outline-none resize-y min-h-[96px] focus:ring-2 focus:ring-[var(--pb)]"
              style={{ ...ESTILO_CAMPO, border: error ? '0.5px solid var(--red)' : ESTILO_CAMPO.border }}
            />
            <div id={`${id}-ayuda`} className="flex justify-between gap-2 mt-1 text-xs">
              <span role={error ? 'alert' : undefined} style={{ color: error ? 'var(--red)' : 'var(--ash)' }}>
                {error ?? 'Queda registrada en la bitácora y no se puede editar.'}
              </span>
              <span className="shrink-0" style={{ color: 'var(--ash)' }}>{nota.length}/{MAX_NOTA}</span>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
