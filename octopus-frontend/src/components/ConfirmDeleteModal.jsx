import { useEffect } from 'react';
import { AlertTriangle, Trash2 } from 'lucide-react';

const ConfirmDeleteModal = ({ titulo, nombre, onConfirm, onCancel }) => {
    useEffect(() => {
        const handler = (e) => { if (e.key === 'Escape') onCancel(); };
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, [onCancel]);

    return (
        <div className="fixed inset-0 flex items-center justify-center z-[100] p-4"
            style={{ background: 'rgba(43,48,58,0.55)' }}>
            <div className="w-full max-w-sm rounded-2xl overflow-hidden shadow-2xl animate-fadeInUp"
                style={{ background: 'var(--porcelain)' }}>
                <div className="p-6 flex flex-col items-center text-center"
                    style={{ background: 'var(--red-light)', color: 'var(--red)' }}>
                    <AlertTriangle size={28} className="mb-3" />
                    <h3 className="text-base font-bold">{titulo}</h3>
                    <p className="text-sm mt-1 opacity-80">
                        ¿Eliminar <b>{nombre}</b>? Esta acción no se puede deshacer.
                    </p>
                </div>
                <div className="flex gap-3 p-6">
                    <button type="button" onClick={onCancel}
                        className="flex-1 py-2.5 rounded-lg text-sm font-medium"
                        style={{ background: 'var(--bg)', color: 'var(--ash)', border: '0.5px solid var(--border-md)' }}>
                        Cancelar
                    </button>
                    <button type="button" onClick={onConfirm}
                        className="flex-[2] py-2.5 rounded-lg text-sm font-medium text-white flex items-center justify-center gap-2"
                        style={{ background: 'var(--red)' }}>
                        <Trash2 size={16} /> Eliminar
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ConfirmDeleteModal;
