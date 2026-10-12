import { AlertTriangle } from 'lucide-react';
import { Modal } from '../ui/Modal';

/** Lista de avisos del control de envíos (no bloquean). */
export const ListaAvisosCobro = ({ avisos }) => (
    <ul className="flex flex-col gap-2">
        {avisos.map((a) => (
            <li
                key={a.codigo}
                className="flex gap-2 rounded-lg p-3 text-sm"
                style={{ background: '#fffbeb', border: '0.5px solid #fcd34d', color: '#92400e' }}
            >
                <AlertTriangle className="mt-0.5 shrink-0" size={16} />
                <span>{a.mensaje}</span>
            </li>
        ))}
    </ul>
);

/** Modal de confirmación cuando el control de envíos exige un "sí" explícito. */
const ConfirmarAvisosCobro = ({ open, avisos, enviando = false, onConfirmar, onCancelar }) => (
    <Modal
        open={open}
        onClose={onCancelar}
        size="md"
        className="z-[60]"
        titulo="Confirmar envío de cobro"
        footer={
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:justify-end">
                <button
                    type="button"
                    onClick={onCancelar}
                    className="min-h-[44px] w-full rounded-lg px-4 py-2 text-sm font-medium sm:w-auto"
                    style={{ border: '0.5px solid var(--border-md)', color: 'var(--jet)' }}
                >
                    Cancelar
                </button>
                <button
                    type="button"
                    disabled={enviando}
                    onClick={onConfirmar}
                    className="min-h-[44px] w-full rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 sm:w-auto"
                    style={{ background: 'var(--pb)' }}
                >
                    {enviando ? 'Enviando…' : 'Enviar de todas formas'}
                </button>
            </div>
        }
    >
        <div className="flex flex-col gap-3">
            <p className="text-sm" style={{ color: 'var(--jet)' }}>
                Antes de enviar ten en cuenta lo siguiente:
            </p>
            <ListaAvisosCobro avisos={avisos} />
        </div>
    </Modal>
);

export default ConfirmarAvisosCobro;
