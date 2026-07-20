import { useEffect, useRef } from 'react';
import { XCircle, Loader2, X } from 'lucide-react';
import { useFocusTrap } from '../../hooks/useFocusTrap';

const ModalConfirmarQuitarGrado = ({ alumno, saving, onConfirmar, onCancelar }) => {
    const containerRef = useRef(null);
    useFocusTrap(containerRef);

    useEffect(() => {
        const handler = (e) => { if (e.key === 'Escape') onCancelar(); };
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, [onCancelar]);

    return (
    <div className="fixed inset-0 backdrop-blur-sm flex items-center justify-center z-[70] p-4"
         style={{ background: 'rgba(43,48,58,0.5)' }} onClick={onCancelar}>
        <div
            ref={containerRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-quitar-grado-titulo"
            className="rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden animate-fadeIn"
            style={{ background: 'var(--porcelain)' }}
            onClick={(e) => e.stopPropagation()}>

            <div className="p-6 flex justify-between items-center"
                 style={{ background: 'var(--red-light)', color: 'var(--red)' }}>
                <h3 id="modal-quitar-grado-titulo" className="font-bold flex items-center gap-2">
                    <XCircle size={18} /> Quitar Grado
                </h3>
                <button onClick={onCancelar} aria-label="Cancelar" style={{ color: 'var(--red)' }}>
                    <X size={20} />
                </button>
            </div>

            <div className="p-6 space-y-4">
                <p className="text-sm" style={{ color: 'var(--ash)' }}>
                    ¿Desea quitarle el grado{' '}
                    <span className="font-bold" style={{ color: 'var(--jet)' }}>
                        {alumno?.grado_seccion}
                    </span>{' '}a{' '}
                    <span className="font-bold" style={{ color: 'var(--jet)' }}>
                        {alumno?.nombre} {alumno?.apellido}
                    </span>?
                    Quedará como "sin inscribir" y se liberará el cupo.
                </p>
                <div className="flex gap-3">
                    <button onClick={onCancelar}
                        className="flex-1 py-3 rounded-xl font-bold"
                        style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)', color: 'var(--ash)' }}>
                        Cancelar
                    </button>
                    <button onClick={onConfirmar} disabled={saving}
                        className="flex-[2] py-3 rounded-xl font-bold flex items-center justify-center gap-2 text-white disabled:opacity-50"
                        style={{ background: 'var(--red)' }}>
                        {saving ? <Loader2 size={18} className="animate-spin" /> : <XCircle size={18} />}
                        {saving ? 'Quitando...' : 'Confirmar'}
                    </button>
                </div>
            </div>
        </div>
    </div>
    );
};

export default ModalConfirmarQuitarGrado;
