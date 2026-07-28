import { useState } from 'react';
import { toast } from 'react-toastify';
import { X, Loader2, BookOpen, Paperclip } from 'lucide-react';

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

  const handleKeyDown = (e) => { if (e.key === 'Escape') onClose(); };

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
      onKeyDown={handleKeyDown}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-material-titulo"
      tabIndex={-1}
    >
      <div className="bg-white rounded-2xl p-6 w-full max-w-lg shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 id="modal-material-titulo" className="font-bold flex items-center gap-2" style={{ color: 'var(--jet)' }}>
            <BookOpen size={18} style={{ color: 'var(--pb)' }} />
            Nuevo Material de Estudio
          </h3>
          <button onClick={onClose} className="p-1 rounded-lg" style={{ color: 'var(--ash)' }} aria-label="Cerrar modal">
            <X size={18} />
          </button>
        </div>

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

        <div className="flex gap-2 mt-6">
          <button
            onClick={onClose}
            className="flex-1 rounded-xl py-2.5 text-sm min-h-[44px]"
            style={{ border: '0.5px solid var(--border-md)', color: 'var(--ash)' }}
          >
            Cancelar
          </button>
          <button
            onClick={handleGuardar}
            disabled={guardando}
            className="flex-1 text-white rounded-xl py-2.5 text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2 min-h-[44px]"
            style={{ background: 'var(--pb)' }}
          >
            {guardando ? <><Loader2 size={14} className="animate-spin" /> Publicando...</> : 'Publicar'}
          </button>
        </div>
      </div>
    </div>
  );
}
