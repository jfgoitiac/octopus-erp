import { useState } from 'react';
import { Wand2, Loader2 } from 'lucide-react';
import { Modal } from '../ui/Modal';

// La jornada (bloques, recesos, duración de clase) ya está definida a nivel
// de paquete — ver EditorBloques.jsx — así que este modal ya no la configura
// aquí. Solo dispara el generador para el paquete actual.
export const ModalGenerador = ({ generando, onClose, onGenerar, onGeneradoOk }) => {
  const [reemplazarExistente, setReemplazarExistente] = useState(false);

  const handleGenerar = async () => {
    const result = await onGenerar({ reemplazar_existente: reemplazarExistente });
    if (!result.ok) return;
    onGeneradoOk(result.data);
  };

  // Bloqueado mientras genera para no perder el estado intermedio
  const handleClose = () => { if (!generando) onClose(); };

  const footer = (
    <>
      <button type="button" onClick={handleClose} disabled={generando}
        className="w-full sm:w-auto px-4 py-2.5 rounded-xl font-bold text-sm disabled:opacity-50"
        style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)', color: 'var(--ash)' }}>
        Cancelar
      </button>
      <button type="button" onClick={handleGenerar}
        disabled={generando}
        className="w-full sm:w-auto px-4 py-2.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 text-white disabled:opacity-50"
        style={{ background: 'var(--pb)' }}>
        {generando ? <Loader2 size={16} className="animate-spin" /> : <Wand2 size={16} />}
        {generando ? 'Generando...' : 'Generar'}
      </button>
    </>
  );

  return (
    <Modal
      open
      onClose={handleClose}
      titulo={(
        <>
          <Wand2 size={18} />
          Generar horario automático
        </>
      )}
      footer={footer}
      size="sm"
    >
      <div className="space-y-5">
        <p className="text-sm" style={{ color: 'var(--ash)' }}>
          El generador usará la jornada de bloques ya definida para este paquete
          (horas de clase y recesos) y respetará las clases pineadas en la
          grilla — no las moverá.
        </p>

        {/* Reemplazar existente */}
        <div className="rounded-xl p-4" style={{
          background: reemplazarExistente ? '#fef2f2' : 'var(--porcelain)',
          border: `0.5px solid ${reemplazarExistente ? '#fca5a5' : 'var(--border-md)'}`,
        }}>
          <label className="flex items-start gap-3 cursor-pointer">
            <input type="checkbox" className="mt-0.5 w-4 h-4 rounded"
              checked={reemplazarExistente}
              onChange={e => setReemplazarExistente(e.target.checked)} />
            <div>
              <span className="text-sm font-medium" style={{ color: 'var(--jet)' }}>
                Reemplazar horario existente
              </span>
              {reemplazarExistente && (
                <p className="text-xs mt-1" style={{ color: '#dc2626' }}>
                  Esto eliminará las clases actuales del grado (salvo las pineadas) y generará un horario nuevo.
                </p>
              )}
            </div>
          </label>
        </div>
      </div>
    </Modal>
  );
};
