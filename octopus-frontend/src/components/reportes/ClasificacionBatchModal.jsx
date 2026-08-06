import { useState, useRef, useEffect } from 'react';
import { Loader2, Layers, X, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { toast } from 'react-toastify';
import { clasificarPagosBatch } from '../../api/cobranza.service';
import { fmt, MONTH_NAMES, CURRENT_YEAR, TIPO_CLASIFICACION_LABELS, getErrorMessage } from '../../constants/reportes';

/**
 * Clasifica en un solo envío varios pagos que el operador ya identificó con
 * el mismo patrón (mismo tipo/mes/nota) — evita abrir ClasificacionPagoModal
 * una vez por cada uno. A cada pago se le asigna una línea por su monto
 * PENDIENTE completo (no permite montos parciales distintos por pago; para
 * eso sigue estando el modal individual).
 */
const ClasificacionBatchModal = ({ pagos, onClose, onAplicado }) => {
    const containerRef = useRef(null);
    useFocusTrap(containerRef);

    useEffect(() => {
        const handler = (e) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, [onClose]);

    const [tipo, setTipo] = useState('inscripcion');
    const [mes, setMes] = useState(new Date().getMonth() + 1);
    const [anio, setAnio] = useState(CURRENT_YEAR);
    const [nota, setNota] = useState('');
    const [enviando, setEnviando] = useState(false);

    const totalPendiente = pagos.reduce((s, p) => s + parseFloat(p.monto_pendiente_usd ?? p.monto_usd ?? 0), 0);

    const handleSubmit = async () => {
        setEnviando(true);
        try {
            const payload = {
                pago_ids: pagos.map(p => p.id),
                tipo,
                nota: nota || undefined,
            };
            if (tipo === 'mes_atrasado') {
                payload.mes = mes;
                payload.anio = anio;
            }
            const res = await clasificarPagosBatch(payload);
            const { creadas, fallidas, resultados } = res.data;
            if (creadas > 0) {
                toast.success(`${creadas} pago${creadas !== 1 ? 's' : ''} clasificado${creadas !== 1 ? 's' : ''} correctamente.`);
            }
            if (fallidas > 0) {
                const primerError = resultados.find(r => !r.ok)?.error;
                toast.warning(`${fallidas} pago${fallidas !== 1 ? 's' : ''} no se pudo${fallidas !== 1 ? 'ieron' : ''} clasificar${primerError ? ` (${primerError})` : ''}. Revísalos manualmente.`);
            }
            onAplicado(resultados);
        } catch (err) {
            toast.error(getErrorMessage(err, 'No se pudo aplicar la clasificación masiva.'));
        } finally {
            setEnviando(false);
        }
    };

    return (
        <div className="fixed inset-0 flex items-center justify-center z-[100] p-4"
            style={{ background: 'rgba(43,48,58,0.55)' }}>
            <div
                ref={containerRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby="clasificacion-batch-modal-title"
                className="w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-2xl shadow-2xl animate-fadeInUp"
                style={{ background: '#fff' }}>
                <div className="px-6 py-4 flex items-start justify-between gap-3" style={{ borderBottom: '0.5px solid var(--border-md)', background: 'var(--porcelain)' }}>
                    <div>
                        <h3 id="clasificacion-batch-modal-title" className="text-base font-semibold flex items-center gap-2" style={{ color: 'var(--jet)' }}>
                            <Layers size={18} style={{ color: 'var(--pb)' }} />
                            Clasificar {pagos.length} pago{pagos.length !== 1 ? 's' : ''} seleccionado{pagos.length !== 1 ? 's' : ''}
                        </h3>
                        <p className="text-xs mt-0.5" style={{ color: 'var(--ash)' }}>
                            Se aplicará el mismo tipo a cada pago, por su monto pendiente completo · total ${fmt(totalPendiente)}
                        </p>
                    </div>
                    <button onClick={onClose} aria-label="Cerrar" style={{ color: 'var(--ash)' }} disabled={enviando}>
                        <X size={18} />
                    </button>
                </div>

                <div className="p-6 space-y-5">
                    <div>
                        <p className="text-[11px] uppercase tracking-widest font-medium mb-2" style={{ color: 'var(--pb)' }}>
                            Pagos seleccionados
                        </p>
                        <div className="max-h-40 overflow-y-auto space-y-1.5 rounded-lg p-2" style={{ background: 'var(--porcelain)' }}>
                            {pagos.map(p => (
                                <div key={p.id} className="flex items-center justify-between text-xs px-2 py-1.5 rounded-lg" style={{ background: '#fff' }}>
                                    <span style={{ color: 'var(--jet)' }}>
                                        {p.alumno || '—'} <span style={{ color: 'var(--ash)' }}>· {p.representante_nombre || 'sin representante'}</span>
                                    </span>
                                    <span className="font-mono font-semibold" style={{ color: '#16a34a' }}>
                                        ${fmt(p.monto_pendiente_usd ?? p.monto_usd)}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="p-4 rounded-xl" style={{ background: 'var(--porcelain)' }}>
                        <p className="text-[11px] uppercase tracking-widest font-medium mb-3" style={{ color: 'var(--pb)' }}>
                            Tipo a aplicar a todos
                        </p>
                        <div className="flex flex-wrap gap-2 mb-3">
                            <select
                                value={tipo}
                                onChange={e => setTipo(e.target.value)}
                                className="px-3 py-2 rounded-lg text-sm outline-none"
                                style={{ border: '0.5px solid var(--border-md)', background: '#fff' }}>
                                {Object.entries(TIPO_CLASIFICACION_LABELS).map(([val, label]) => (
                                    <option key={val} value={val}>{label}</option>
                                ))}
                            </select>
                            {tipo === 'mes_atrasado' && (
                                <>
                                    <select
                                        value={mes}
                                        onChange={e => setMes(parseInt(e.target.value))}
                                        className="px-3 py-2 rounded-lg text-sm outline-none"
                                        style={{ border: '0.5px solid var(--border-md)', background: '#fff' }}>
                                        {MONTH_NAMES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                                    </select>
                                    <input
                                        type="number"
                                        value={anio}
                                        onChange={e => setAnio(parseInt(e.target.value))}
                                        className="w-24 px-3 py-2 rounded-lg text-sm outline-none"
                                        style={{ border: '0.5px solid var(--border-md)', background: '#fff' }} />
                                </>
                            )}
                        </div>
                        <input
                            type="text"
                            value={nota}
                            onChange={e => setNota(e.target.value)}
                            placeholder="Nota (opcional, se aplica a todas las líneas)"
                            className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                            style={{ border: '0.5px solid var(--border-md)', background: '#fff' }} />
                        <p className="text-xs mt-2 flex items-start gap-1.5" style={{ color: 'var(--ash)' }}>
                            <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                            Si algún pago mezcla más de un concepto (ej. inscripción + mes atrasado en un solo pago), clasifícalo aparte con el modal individual — esta acción cierra cada pago con un solo tipo.
                        </p>
                    </div>

                    <button
                        onClick={handleSubmit}
                        disabled={enviando}
                        className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-sm font-medium text-white disabled:opacity-50"
                        style={{ background: 'var(--pb)' }}>
                        {enviando ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                        {enviando ? 'Aplicando…' : `Clasificar ${pagos.length} pago${pagos.length !== 1 ? 's' : ''}`}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ClasificacionBatchModal;
