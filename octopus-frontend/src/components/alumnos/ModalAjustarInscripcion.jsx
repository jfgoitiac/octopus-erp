import { useEffect, useRef } from 'react';
import { X, Save, Loader2 } from 'lucide-react';
import { useFocusTrap } from '../../hooks/useFocusTrap';

const ModalAjustarInscripcion = ({
    alumno,
    cuotas,
    loadingCuotas,
    saving,
    onClose,
    onSave,
    onUpdateMonto,
}) => {
    const containerRef = useRef(null);
    useFocusTrap(containerRef);

    useEffect(() => {
        const handler = (e) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, [onClose]);

    return (
    <div className="fixed inset-0 backdrop-blur-sm flex items-center justify-center z-50 p-4"
         style={{ background: 'rgba(43,48,58,0.5)' }} onClick={onClose}>
        <div
            ref={containerRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-inscripcion-titulo"
            className="rounded-3xl w-full max-w-md shadow-2xl overflow-hidden animate-fadeIn"
            style={{ background: 'var(--porcelain)' }}
            onClick={(e) => e.stopPropagation()}>

            {/* Header */}
            <div className="p-6 flex justify-between items-center"
                 style={{ borderBottom: '0.5px solid var(--border)' }}>
                <div>
                    <h2 id="modal-inscripcion-titulo" className="text-xl font-bold" style={{ color: 'var(--jet)' }}>Ajustar Inscripción</h2>
                    <p className="text-xs mt-1" style={{ color: 'var(--ash)' }}>
                        {alumno.nombre} {alumno.apellido}
                    </p>
                </div>
                <button onClick={onClose} aria-label="Cerrar modal" style={{ color: 'var(--ash)' }}>
                    <X size={24} />
                </button>
            </div>

            {/* Body */}
            <div className="p-6 max-h-[60vh] overflow-y-auto space-y-4">
                {loadingCuotas ? (
                    <div className="space-y-3">
                        {Array.from({ length: 2 }).map((_, i) => (
                            <div key={i} className="h-16 rounded-2xl animate-pulse"
                                 style={{ background: 'var(--ash-light)' }} />
                        ))}
                    </div>
                ) : cuotas.length > 0 ? (
                    cuotas.map((c) => (
                        <div key={c.id} className="p-4 rounded-2xl"
                             style={{ background: 'var(--ash-light)', border: '0.5px solid var(--border)' }}>
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="font-bold text-sm" style={{ color: 'var(--jet)' }}>
                                        Período {c.periodo_escolar}
                                    </p>
                                    <p className="text-[10px] uppercase font-black" style={{ color: 'var(--ash)' }}>
                                        Monto (USD)
                                    </p>
                                </div>
                                <div className="relative">
                                    <span className="absolute left-3 top-2.5 text-slate-400 text-sm">$</span>
                                    <input
                                        type="number"
                                        step="0.01"
                                        className="w-24 pl-6 pr-3 py-2 bg-white border border-slate-200 rounded-xl outline-none text-sm font-bold text-slate-700"
                                        value={c.monto_usd}
                                        onChange={(e) => onUpdateMonto(c.id, e.target.value)}
                                    />
                                </div>
                            </div>
                        </div>
                    ))
                ) : (
                    <p className="text-center py-10 italic" style={{ color: 'var(--ash)' }}>
                        No hay cuota de inscripción pendiente para este alumno.
                    </p>
                )}
            </div>

            {/* Footer */}
            <div className="p-6 flex gap-3" style={{ background: 'var(--ash-light)' }}>
                <button
                    onClick={onClose}
                    className="flex-1 py-3 rounded-xl font-bold"
                    style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)', color: 'var(--ash)' }}>
                    Cancelar
                </button>
                <button
                    onClick={onSave}
                    disabled={saving || cuotas.length === 0}
                    className="flex-1 py-3 rounded-xl font-bold flex items-center justify-center gap-2 disabled:opacity-50"
                    style={{ background: 'var(--pb)', color: '#fff' }}>
                    {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                    {saving ? 'Guardando...' : 'Guardar Cambios'}
                </button>
            </div>
        </div>
    </div>
    );
};

export default ModalAjustarInscripcion;
