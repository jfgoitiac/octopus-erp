import { useState } from 'react';
import { toast } from 'react-toastify';
import { Loader2 } from 'lucide-react';
import { Modal } from '../../ui/Modal';
import { descartarAdjunto } from '../../../api/cobranza.service';
import { MAX_MOTIVO_DESCARTE, mensajeError } from './conversacionesUtils';

const campo = { border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)', fontSize: '16px' };

/** Contenido con su propio estado: se monta sólo con el modal abierto, así el motivo se reinicia solo. */
function ContenidoDescartar({ mensajeId, onClose, onHecho }) {
    const [motivo, setMotivo] = useState('');
    const [guardando, setGuardando] = useState(false);
    const texto = motivo.trim();

    const descartar = async () => {
        if (!texto) return;
        setGuardando(true);
        try {
            const { data } = await descartarAdjunto(mensajeId, { motivo: texto });
            toast.success('Comprobante descartado.');
            onHecho?.(data);
            onClose();
        } catch (err) {
            toast.error(mensajeError(err, 'No se pudo descartar el comprobante.'));
            setGuardando(false);
        }
    };

    return (
        <Modal open onClose={guardando ? () => {} : onClose} titulo="Descartar comprobante" size="sm" footer={
            <>
                <button type="button" onClick={onClose} disabled={guardando}
                    className="w-full sm:w-auto min-h-11 px-4 py-2 rounded-xl text-sm font-medium disabled:opacity-50"
                    style={{ border: '1px solid var(--border-md)', color: 'var(--jet)', background: 'var(--surface)' }}>
                    Cancelar
                </button>
                <button type="button" onClick={descartar} disabled={guardando || !texto}
                    className="w-full sm:w-auto min-h-11 px-4 py-2 rounded-xl text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-50"
                    style={{ background: 'var(--red)', color: '#fff' }}>
                    {guardando && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
                    Descartar
                </button>
            </>
        }>
            <div className="space-y-3">
                <p className="text-sm" style={{ color: 'var(--jet-mid)' }}>
                    El archivo no se convertirá en pago y se reanudan los recordatorios a este representante.
                </p>
                <label className="block text-sm font-medium" style={{ color: 'var(--jet)' }}>
                    Motivo
                    <textarea value={motivo} onChange={e => setMotivo(e.target.value.slice(0, MAX_MOTIVO_DESCARTE))}
                        rows={3} maxLength={MAX_MOTIVO_DESCARTE} autoFocus
                        placeholder="Ej.: Foto borrosa, no es un pago"
                        className="mt-1 w-full rounded-xl px-3 py-2 font-normal" style={campo} />
                </label>
                <p className="text-xs text-right" style={{ color: 'var(--ash)' }}>{motivo.length}/{MAX_MOTIVO_DESCARTE}</p>
            </div>
        </Modal>
    );
}

/** Pide el motivo y descarta el adjunto pendiente. `onHecho(data)` recibe `{ mensaje }`. */
export function ModalDescartarComprobante({ open, ...props }) {
    return open ? <ContenidoDescartar {...props} /> : null;
}

export default ModalDescartarComprobante;
