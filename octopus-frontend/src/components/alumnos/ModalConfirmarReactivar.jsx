import { useRef } from 'react';
import { RefreshCcw, Loader2 } from 'lucide-react';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { Modal } from '../ui/Modal';

// UX-3 fix: reemplaza window.confirm para la acción de reactivar
const ModalConfirmarReactivar = ({ alumno, saving, onConfirmar, onCancelar }) => {
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
                style={{ background: '#16a34a' }}>
                {saving ? <Loader2 size={16} className="animate-spin" /> : <RefreshCcw size={16} />}
                {saving ? 'Reactivando...' : 'Confirmar'}
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
                    <RefreshCcw size={17} /> Reactivar Alumno
                </>
            )}
            footer={footer}
            size="sm"
        >
            <p className="text-sm" style={{ color: 'var(--ash)' }}>
                ¿Desea reactivar a{' '}
                <span className="font-bold" style={{ color: 'var(--jet)' }}>
                    {alumno?.nombre} {alumno?.apellido}
                </span>?
                Se le asignará un cupo nuevamente.
            </p>
        </Modal>
    );
};

export default ModalConfirmarReactivar;
