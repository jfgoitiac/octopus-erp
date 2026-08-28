import { useState } from 'react';
import { toast } from 'react-toastify';
import { Loader2, BookOpen, Paperclip } from 'lucide-react';
import { Modal } from '../ui/Modal';

const FIELD_STYLE = { border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)', fontSize: '16px' };
const TAMANO_MAX_MB = 5;

export default function ModalNuevoMaterial({ onClose, onSubmit }) {
  const [titulo, setTitulo] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [enlace, setEnlace] = useState('');
  const [archivo, setArchivo] = useState(null);
  const [guardando, setGuardando] = useState(false);

  const handleArchivo = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > TAMANO_MAX_MB * 1024 * 1024) {
      toast.error(`El archivo no puede superar ${TAMANO_MAX_MB}MB.`);
      e.target.value = '';
      return;
    }
    setArchivo(file);
  };

  const handleGuardar = async () => {
    if (!titulo.trim()) { toast.warning('Escribe un título.'); return; }
    if (!archivo && !enlace.trim()) { toast.warning('Adjunta un archivo o agrega un enlace.'); return; }

    setGuardando(true);
    const ok = await onSubmit({ titulo: titulo.trim(), descripcion: descripcion.trim(), enlace: enlace.trim(), archivo });
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
        {guardando ? <><Loader2 size={14} className="animate-spin" /> Publicando...</> : 'Publicar'}
      </button>
    </>
  );

  return (
    <Modal
      open
      onClose={onClose}
      titulo={(
        <>
          <BookOpen size={17} />
          Nuevo Material de Estudio
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
            placeholder="Ej. Guía de laboratorio N°3"
            className="w-full px-3 py-2 rounded-lg text-sm outline-none min-h-[44px]"
            style={FIELD_STYLE}
            value={titulo}
            onChange={e => setTitulo(e.target.value)}
          />
        </div>

        <div>
          <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>
            Descripción (opcional)
          </label>
          <textarea
            rows={2}
            className="w-full px-3 py-2 rounded-lg text-sm outline-none resize-none"
            style={FIELD_STYLE}
            value={descripcion}
            onChange={e => setDescripcion(e.target.value)}
          />
        </div>

        <div>
          <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>
            Enlace (opcional)
          </label>
          <input
            type="url"
            placeholder="https://..."
            className="w-full px-3 py-2 rounded-lg text-sm outline-none min-h-[44px]"
            style={FIELD_STYLE}
            value={enlace}
            onChange={e => setEnlace(e.target.value)}
          />
        </div>

        <div>
          <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>
            Archivo (opcional, máx. {TAMANO_MAX_MB}MB)
          </label>
          {archivo ? (
            <div className="flex items-center gap-3">
              <span className="text-sm truncate" style={{ color: 'var(--jet)' }}>{archivo.name}</span>
              <button type="button" onClick={() => setArchivo(null)} className="text-xs font-medium" style={{ color: 'var(--red)' }}>
                Quitar
              </button>
            </div>
          ) : (
            <label
              className="flex items-center justify-center gap-2 w-full py-3 rounded-lg text-sm cursor-pointer min-h-[44px]"
              style={{ border: '1px dashed var(--border-md)', color: 'var(--ash)' }}
            >
              <Paperclip size={15} />
              Adjuntar archivo
              <input type="file" className="hidden" onChange={handleArchivo} />
            </label>
          )}
        </div>
      </div>
    </Modal>
  );
}
