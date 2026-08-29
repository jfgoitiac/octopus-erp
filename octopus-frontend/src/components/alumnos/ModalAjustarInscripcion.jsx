import { useRef } from 'react';
import { Save, Loader2 } from 'lucide-react';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { Modal } from '../ui/Modal';

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

    const footer = (
        <>
            <button
                onClick={onClose}
                className="w-full sm:w-auto px-4 py-2.5 rounded-xl font-bold text-sm"
                style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)', color: 'var(--ash)' }}>
                Cancelar
            </button>
            <button
                onClick={onSave}
                disabled={saving || cuotas.length === 0}
                className="w-full sm:w-auto px-4 py-2.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 text-white disabled:opacity-50"
                style={{ background: 'var(--pb)' }}>
                {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                {saving ? 'Guardando...' : 'Guardar Cambios'}
            </button>
        </>
    );

    return (
        <Modal
            ref={containerRef}
            open
            onClose={onClose}
            titulo={(
                <div>
                    <div>Ajustar Inscripción</div>
                    <p className="text-xs mt-1 font-normal" style={{ color: 'var(--ash)' }}>
                        {alumno.nombre} {alumno.apellido}
                    </p>
                </div>
            )}
            footer={footer}
            size="sm"
        >
            <div className="space-y-4">
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
        </Modal>
    );
};

export default ModalAjustarInscripcion;
