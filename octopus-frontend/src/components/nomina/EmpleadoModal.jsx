import { Loader2, X } from 'lucide-react';
import { EmpleadoForm } from './EmpleadoForm';
import { useEscape } from '../../hooks/useEscape';

/**
 * Modal unificado para registrar y editar empleados.
 * El componente padre controla visibilidad: renderiza condicionalmente
 * (solo monta cuando showRegisterModal o showEditModal es true).
 */
export function EmpleadoModal({
    title,
    data,
    onChange,
    bancosNomina,
    onSubmit,
    onClose,
    isBusy,
    submitLabel,
    submitIcon: SubmitIcon,
    showTipoSelect = false,
}) {
    useEscape(true, onClose);

    return (
        <div className="fixed inset-0 flex items-center justify-center z-50 p-4"
            style={{ background: 'rgba(43,48,58,0.5)' }}
            role="dialog" aria-modal="true" aria-labelledby="emp-modal-title">

            <div className="w-full max-w-lg rounded-2xl overflow-hidden shadow-2xl flex flex-col"
                style={{ background: 'var(--porcelain)', maxHeight: '92vh' }}>

                <div className="flex justify-between items-center px-5 py-4 flex-shrink-0"
                    style={{ borderBottom: '0.5px solid var(--border)', background: 'var(--porcelain)' }}>
                    <h3 id="emp-modal-title" className="text-sm font-medium" style={{ color: 'var(--jet)' }}>
                        {title}
                    </h3>
                    <button onClick={onClose} style={{ color: 'var(--ash)' }} aria-label="Cerrar modal">
                        <X size={18} />
                    </button>
                </div>

                <form onSubmit={onSubmit} className="p-5 overflow-y-auto flex-1">
                    <EmpleadoForm
                        data={data}
                        onChange={onChange}
                        bancosNomina={bancosNomina}
                        showTipoSelect={showTipoSelect}
                        autoFocusNombre
                    />
                    <div className="flex gap-2 pt-4">
                        <button type="button" onClick={onClose}
                            className="flex-1 py-2 rounded-lg text-sm font-medium"
                            style={{ border: '0.5px solid var(--border-md)', color: 'var(--ash)' }}>
                            Cancelar
                        </button>
                        <button type="submit" disabled={isBusy}
                            className="flex-1 py-2 rounded-lg text-sm font-medium text-white flex items-center justify-center gap-2 disabled:opacity-50"
                            style={{ background: 'var(--pb)' }}>
                            {isBusy
                                ? <><Loader2 className="animate-spin" size={15} /> Guardando...</>
                                : <><SubmitIcon size={15} /> {submitLabel}</>
                            }
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
