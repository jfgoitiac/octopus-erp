import { useRef } from 'react';
import { Trash2, Loader2 } from 'lucide-react';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { Modal } from '../ui/Modal';

const ModalRetirar = ({ alumno, motivo, setMotivo, saving, onClose, onConfirmar }) => {
    const containerRef = useRef(null);
    useFocusTrap(containerRef);

    return (
        <Modal
            ref={containerRef}
            open
            onClose={onClose}
            titulo="Procesar Retiro"
            size="sm"
        >
            <div className="space-y-4">
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
        </Modal>
    );
};

export default ModalRetirar;
