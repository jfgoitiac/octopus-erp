import { useRef } from 'react';
import { XCircle, Loader2 } from 'lucide-react';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { Modal } from '../ui/Modal';

const ModalConfirmarQuitarGrado = ({ alumno, saving, onConfirmar, onCancelar }) => {
    const containerRef = useRef(null);
    useFocusTrap(containerRef);

    const footer = (
        <>
            <button onClick={onCancelar}
                className="w-full sm:w-auto py-2.5 rounded-xl font-bold text-sm"
                style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)', color: 'var(--ash)' }}>
                Cancelar
            </button>
            <button onClick={onConfirmar} disabled={saving}
                className="w-full sm:w-auto py-2.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 text-white disabled:opacity-50"
                style={{ background: 'var(--red)' }}>
                {saving ? <Loader2 size={16} className="animate-spin" /> : <XCircle size={16} />}
                {saving ? 'Quitando...' : 'Confirmar'}
            </button>
        </>
    );

    return (
        <Modal
            ref={containerRef}
            open
            onClose={onCancelar}
            titulo={(
                <>
                    <XCircle size={17} /> Quitar Grado
                </>
            )}
            footer={footer}
            size="sm"
        >
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
        </Modal>
    );
};

export default ModalConfirmarQuitarGrado;
