import { useState, useCallback } from 'react';
import { toast } from 'react-toastify';
import { Loader2, Paperclip, Megaphone } from 'lucide-react';
import { Modal } from '../ui/Modal';

const FIELD_STYLE = { border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)', fontSize: '16px' };
const TAMANO_MAX_MB = 5;

export default function ModalNuevaCircular({ onClose, onSubmit }) {
  const [titulo, setTitulo]       = useState('');
  const [cuerpo, setCuerpo]       = useState('');
  const [requiereConfirmacion, setRequiereConfirmacion] = useState(false);
  const [adjunto, setAdjunto]     = useState(null);
  const [guardando, setGuardando] = useState(false);

  const handleArchivo = useCallback((e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > TAMANO_MAX_MB * 1024 * 1024) {
      toast.error(`El adjunto no puede superar ${TAMANO_MAX_MB}MB.`);
      e.target.value = '';
      return;
    }
    setAdjunto(file);
  }, []);

  const handleGuardar = async () => {
    if (!titulo.trim()) { toast.warning('Escribe un título.'); return; }
    if (!cuerpo.trim()) { toast.warning('Escribe el contenido de la circular.'); return; }

    setGuardando(true);
    const ok = await onSubmit({
      titulo: titulo.trim(),
      cuerpo: cuerpo.trim(),
      requiere_confirmacion: requiereConfirmacion,
      adjunto,
    });
    setGuardando(false);
    if (ok) onClose();
  };

  const footer = (
    <>
      <button
        onClick={onClose}
        className="w-full sm:w-auto rounded-xl py-2.5 text-sm min-h-[44px]"
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
        {guardando ? <><Loader2 size={14} className="animate-spin" /> Publicando...</> : 'Publicar Circular'}
      </button>
    </>
  );

  return (
    <Modal
      open
      onClose={onClose}
      titulo={(
        <>
          <Megaphone size={17} />
          Nueva Circular
        </>
      )}
      footer={footer}
      size="md"
    >
      <div className="space-y-4">
        <div>
          <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>
            Título
          </label>
          <input
            type="text"
            placeholder="Ej. Reunión de padres — 5to grado"
            className="w-full px-3 py-2 rounded-lg text-sm outline-none min-h-[44px]"
            style={FIELD_STYLE}
            value={titulo}
            onChange={e => setTitulo(e.target.value)}
          />
        </div>

        <div>
          <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>
            Contenido
          </label>
          <textarea
            rows={5}
            placeholder="Escribe el contenido de la circular..."
            className="w-full px-3 py-2 rounded-lg text-sm outline-none resize-none"
            style={FIELD_STYLE}
            value={cuerpo}
            onChange={e => setCuerpo(e.target.value)}
          />
        </div>

        <label className="flex items-center gap-2 text-sm cursor-pointer min-h-[44px]" style={{ color: 'var(--jet)' }}>
          <input
            type="checkbox"
            className="w-4 h-4"
            checked={requiereConfirmacion}
            onChange={e => setRequiereConfirmacion(e.target.checked)}
          />
          Requiere confirmación de lectura
        </label>

        <div>
          <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>
            Adjunto (opcional, máx. {TAMANO_MAX_MB}MB)
          </label>
          {adjunto ? (
            <div className="flex items-center gap-3 text-sm" style={{ color: 'var(--jet)' }}>
              <Paperclip size={15} />
              <span className="truncate">{adjunto.name}</span>
              <button type="button" onClick={() => setAdjunto(null)} className="text-xs font-medium" style={{ color: 'var(--red)' }}>
                Quitar
              </button>
            </div>
          ) : (
            <label
              className="flex items-center justify-center gap-2 w-full py-3 rounded-lg text-sm cursor-pointer min-h-[44px]"
              style={{ border: '1px dashed var(--border-md)', color: 'var(--ash)' }}
            >
              <Paperclip size={15} />
              Adjuntar PDF o imagen
              <input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="hidden" onChange={handleArchivo} />
            </label>
          )}
        </div>
      </div>
    </Modal>
  );
}
