import { Loader2 } from 'lucide-react';
import { EmpleadoForm } from './EmpleadoForm';
import { Modal } from '../ui/Modal';

/**
 * Modal unificado para registrar y editar empleados.
 * El componente padre controla visibilidad: renderiza condicionalmente
 * (solo monta cuando showRegisterModal o showEditModal es true).
 */
export function EmpleadoModal({
    title,
    data,
    onChange,
    errors = {},
    bancosNomina,
    onSubmit,
    onClose,
    isBusy,
    submitLabel,
    submitIcon: SubmitIcon,
    showTipoSelect = false,
    convenioNomina = 'avec_ve',
}) {
    const footer = (
        <>
            <button type="button" onClick={onClose}
                className="w-full sm:w-auto px-4 py-2 rounded-lg text-sm font-medium"
                style={{ border: '0.5px solid var(--border-md)', color: 'var(--ash)' }}>
                Cancelar
            </button>
            <button type="submit" form="form-empleado" disabled={isBusy}
                className="w-full sm:w-auto px-4 py-2 rounded-lg text-sm font-medium text-white flex items-center justify-center gap-2 disabled:opacity-50"
                style={{ background: 'var(--pb)' }}>
                {isBusy
                    ? <><Loader2 className="animate-spin" size={15} /> Guardando...</>
                    : <><SubmitIcon size={15} /> {submitLabel}</>
                }
            </button>
        </>
    );

    return (
        <Modal
            open
            onClose={onClose}
            titulo={title}
            footer={footer}
            size="md"
        >
            <form id="form-empleado" onSubmit={onSubmit}>
                <EmpleadoForm
                    data={data}
                    onChange={onChange}
                    errors={errors}
                    bancosNomina={bancosNomina}
                    showTipoSelect={showTipoSelect}
                    autoFocusNombre
                    convenioNomina={convenioNomina}
                />
            </form>
        </Modal>
    );
}
