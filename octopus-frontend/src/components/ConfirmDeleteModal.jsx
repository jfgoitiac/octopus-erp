import { AlertTriangle, Trash2 } from 'lucide-react';
import { Modal } from './ui/Modal';

const ConfirmDeleteModal = ({ titulo, nombre, mensaje, labelBoton = 'Eliminar', onConfirm, onCancel }) => {
    const footer = (
        <>
            <button type="button" onClick={onCancel}
                className="w-full sm:w-auto px-4 py-2.5 rounded-lg text-sm font-medium"
                style={{ background: 'var(--bg)', color: 'var(--ash)', border: '0.5px solid var(--border-md)' }}>
                Cancelar
            </button>
            <button type="button" onClick={onConfirm}
                className="w-full sm:w-auto px-4 py-2.5 rounded-lg text-sm font-medium text-white flex items-center justify-center gap-2"
                style={{ background: 'var(--red)' }}>
                <Trash2 size={16} /> {labelBoton}
            </button>
        </>
    );

    return (
        <Modal
            open
            onClose={onCancel}
            className="z-[100]"
            footer={footer}
            size="sm"
        >
            <div className="-m-6 mb-0 p-6 flex flex-col items-center text-center"
                style={{ background: 'var(--red-light)', color: 'var(--red)' }}>
                <AlertTriangle size={28} className="mb-3" aria-hidden="true" />
                <h3 className="text-base font-bold">{titulo}</h3>
                <p className="text-sm mt-1 opacity-80">
                    {mensaje ?? <>¿Eliminar <b>{nombre}</b>? Esta acción no se puede deshacer.</>}
                </p>
            </div>
        </Modal>
    );
};

export default ConfirmDeleteModal;
