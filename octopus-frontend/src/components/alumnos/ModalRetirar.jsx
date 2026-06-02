import { X, Trash2, Loader2 } from 'lucide-react';

const ModalRetirar = ({ alumno, motivo, setMotivo, saving, onClose, onConfirmar }) => (
    <div className="fixed inset-0 backdrop-blur-sm flex items-center justify-center z-50 p-4"
         style={{ background: 'rgba(43,48,58,0.5)' }}>
        <div className="rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden animate-fadeIn"
             style={{ background: 'var(--porcelain)' }}>

            <div className="p-6 flex justify-between items-center"
                 style={{ background: 'var(--red-light)', color: 'var(--red)' }}>
                <h3 className="font-bold">Procesar Retiro</h3>
                <button onClick={onClose} aria-label="Cerrar modal" style={{ color: 'var(--red)' }}>
                    <X size={20} />
                </button>
            </div>

            <div className="p-6 space-y-4">
                <p className="text-sm" style={{ color: 'var(--ash)' }}>
                    ¿Está seguro de retirar a{' '}
                    <span className="font-bold" style={{ color: 'var(--jet)' }}>{alumno?.nombre}</span>?
                    El cupo en su sección será liberado.
                </p>
                <div>
                    <label className="block text-[11px] uppercase tracking-widest mb-1.5"
                           style={{ color: 'var(--ash)' }}>
                        Motivo del retiro <span style={{ color: 'var(--red)' }}>*</span>
                    </label>
                    <textarea
                        className="w-full px-3 py-2 rounded-lg text-sm outline-none resize-none"
                        style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)' }}
                        placeholder="Motivo del retiro..."
                        rows="3"
                        value={motivo}
                        onChange={(e) => setMotivo(e.target.value)}
                    />
                </div>
                {/* UX-5 fix: botón deshabilitado si no hay motivo */}
                <button
                    onClick={onConfirmar}
                    disabled={saving || !motivo.trim()}
                    className="w-full py-4 rounded-2xl font-bold flex items-center justify-center gap-2 text-white disabled:opacity-50"
                    style={{ background: 'var(--red)' }}>
                    {saving ? <Loader2 className="animate-spin" /> : <Trash2 size={18} />}
                    Confirmar Retiro
                </button>
            </div>
        </div>
    </div>
);

export default ModalRetirar;
