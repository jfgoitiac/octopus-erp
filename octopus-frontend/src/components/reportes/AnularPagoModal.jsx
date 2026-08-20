import { useState, useEffect, useRef } from 'react';
import { X, Ban, Loader2, AlertTriangle } from 'lucide-react';
import { toast } from 'react-toastify';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { anularPago } from '../../api/cobranza.service';
import { getErrorMessage, fmt } from '../../constants/reportes';

const MOTIVO_MIN_LEN = 10;

/**
 * Anula un pago ya registrado: revierte a "pendiente" la mensualidad/cuota
 * que había marcado como pagada y libera su número de referencia. No borra
 * el registro (queda en el historial, auditable). Requiere `motivo` — el
 * backend puede rechazar la anulación (cierre de caja validado, pago ligado
 * a Proyecto de Inversión, ya anulado); ese mensaje se muestra tal cual.
 */
const AnularPagoModal = ({ pago, onClose, onAnulado }) => {
    const containerRef = useRef(null);
    useFocusTrap(containerRef);

    useEffect(() => {
        const handler = (e) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, [onClose]);

    const [motivo, setMotivo] = useState('');
    const [touched, setTouched] = useState(false);
    const [anulando, setAnulando] = useState(false);

    const motivoInvalido = motivo.trim().length < MOTIVO_MIN_LEN;

    const handleAnular = async () => {
        setTouched(true);
        if (motivoInvalido) {
            toast.warning(`Explica el motivo de la anulación (mínimo ${MOTIVO_MIN_LEN} caracteres).`);
            return;
        }
        setAnulando(true);
        try {
            await anularPago(pago.id, motivo.trim());
            onAnulado();
        } catch (err) {
            toast.error(getErrorMessage(err, 'No se pudo anular el pago.'));
        } finally {
            setAnulando(false);
        }
    };

    return (
        <div className="fixed inset-0 flex items-center justify-center z-[100] p-4"
            style={{ background: 'rgba(43,48,58,0.6)' }}
            role="dialog" aria-modal="true" aria-labelledby="anular-pago-title">
            <div
                ref={containerRef}
                className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl shadow-2xl animate-fadeInUp"
                style={{ background: '#fff' }}>
                {/* Encabezado */}
                <div className="px-6 py-4 flex items-start justify-between gap-3"
                    style={{ borderBottom: '0.5px solid var(--border-md)', background: 'var(--porcelain)' }}>
                    <div>
                        <h3 id="anular-pago-title" className="text-base font-semibold flex items-center gap-2" style={{ color: 'var(--jet)' }}>
                            <Ban size={18} style={{ color: 'var(--red)' }} />
                            Anular Pago
                        </h3>
                        <p className="text-xs mt-0.5" style={{ color: 'var(--ash)' }}>
                            {`${pago.nombre_alumno || ''} ${pago.apellido_alumno || ''}`.trim() || pago.alumno || '—'}
                            {' · '}${fmt(pago.monto_usd)} · Ref. {pago.referencia || '—'}
                        </p>
                    </div>
                    <button onClick={onClose} aria-label="Cerrar" style={{ color: 'var(--ash)' }}
                        className="flex items-center justify-center p-2 rounded-lg min-h-[44px] min-w-[44px]">
                        <X size={18} />
                    </button>
                </div>

                <div className="p-6 space-y-4">
                    <div className="flex items-start gap-2.5 px-3.5 py-3 rounded-lg"
                        style={{ background: '#fef2f2', border: '0.5px solid #fecaca' }}>
                        <AlertTriangle size={16} className="shrink-0 mt-0.5" style={{ color: 'var(--red)' }} />
                        <p className="text-xs leading-relaxed" style={{ color: '#991b1b' }}>
                            Esta acción marca el pago como anulado y devuelve la mensualidad o cuota
                            asociada a "pendiente" (vuelve a aparecer como deuda). No se puede
                            deshacer — si fue un error, habrá que registrar el pago de nuevo.
                        </p>
                    </div>

                    <div>
                        <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--jet)' }}>
                            Motivo de la anulación <span style={{ color: 'var(--red)' }}>*</span>
                        </label>
                        <textarea
                            value={motivo}
                            onChange={e => setMotivo(e.target.value)}
                            rows={3}
                            placeholder="Ej: reverso bancario confirmado, pago duplicado, error de caja…"
                            className="w-full px-3 py-2 rounded-lg text-sm outline-none resize-none"
                            style={{ border: `0.5px solid ${touched && motivoInvalido ? 'var(--red)' : 'var(--border-md)'}`, color: 'var(--jet)' }}
                        />
                        {touched && motivoInvalido && (
                            <p className="text-[10px] mt-1" style={{ color: 'var(--red)' }}>
                                Escribe al menos {MOTIVO_MIN_LEN} caracteres explicando el motivo.
                            </p>
                        )}
                    </div>
                </div>

                {/* Footer */}
                <div className="px-6 py-4 flex justify-end gap-2"
                    style={{ borderTop: '0.5px solid var(--border-md)', background: 'var(--porcelain)' }}>
                    <button onClick={onClose}
                        className="px-4 py-2 rounded-lg text-sm font-medium"
                        style={{ border: '0.5px solid var(--border-md)', color: 'var(--ash)' }}>
                        Cancelar
                    </button>
                    <button
                        onClick={handleAnular}
                        disabled={anulando}
                        className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
                        style={{ background: 'var(--red)' }}>
                        {anulando ? <Loader2 size={15} className="animate-spin" /> : <Ban size={15} />}
                        Anular pago
                    </button>
                </div>
            </div>
        </div>
    );
};

export default AnularPagoModal;
