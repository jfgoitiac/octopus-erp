import { useEffect, useRef } from 'react';
import { X, Save, Calendar, History, Loader2 } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { useFocusTrap } from '../../hooks/useFocusTrap';

// Q-3 fix: formatea h.fecha con date-fns en español
const formatearFechaHistorial = (fecha) => {
    try {
        return format(parseISO(fecha), "d 'de' MMM yyyy, HH:mm", { locale: es });
    } catch {
        return fecha;
    }
};

const ModalAjustarMensualidades = ({
    alumno,
    mensualidades,
    totalDeuda,
    tasa,
    loadingMensualidades,
    saving,
    onClose,
    onSave,
    onGenerarAnualidad,
    onUpdateMonto,
    onBulkUpdate,
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
         style={{ background: 'rgba(43,48,58,0.5)' }}>
        <div
            ref={containerRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-mensualidades-titulo"
            className="rounded-3xl w-full max-w-md shadow-2xl overflow-hidden animate-fadeIn"
            style={{ background: 'var(--porcelain)' }}>

            {/* Header */}
            <div className="p-6 flex justify-between items-center"
                 style={{ borderBottom: '0.5px solid var(--border)' }}>
                <div>
                    <h2 id="modal-mensualidades-titulo" className="text-xl font-bold" style={{ color: 'var(--jet)' }}>Ajustar Mensualidades</h2>
                    <div className="flex flex-wrap items-center gap-2 mt-1">
                        <p className="text-xs" style={{ color: 'var(--ash)' }}>
                            {alumno.nombre} {alumno.apellido}
                        </p>
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider"
                              style={{ background: 'var(--red-light)', color: 'var(--red)' }}>
                            Deuda: ${(Number(totalDeuda) || 0).toFixed(2)}
                            {tasa > 0 && ` / Bs. ${(Number(totalDeuda) * tasa).toLocaleString('es-VE', { minimumFractionDigits: 2 })}`}
                        </span>
                    </div>
                </div>
                <button onClick={onClose} aria-label="Cerrar modal" style={{ color: 'var(--ash)' }}>
                    <X size={24} />
                </button>
            </div>

            {/* Body */}
            <div className="p-6 max-h-[60vh] overflow-y-auto space-y-4">
                {loadingMensualidades ? (
                    // C-5 fix: skeleton mientras cargan las mensualidades
                    <div className="space-y-3">
                        {Array.from({ length: 4 }).map((_, i) => (
                            <div key={i} className="h-16 rounded-2xl animate-pulse"
                                 style={{ background: 'var(--ash-light)' }} />
                        ))}
                    </div>
                ) : (
                    <>
                        <div className="flex items-center justify-between mb-2">
                            <h3 className="text-[11px] uppercase tracking-widest" style={{ color: 'var(--ash)' }}>
                                Herramientas de Ajuste
                            </h3>
                            <button
                                onClick={() => onGenerarAnualidad(alumno)}
                                disabled={saving}
                                className="flex items-center gap-1 text-[10px] font-bold hover:underline disabled:opacity-50"
                                style={{ color: 'var(--pb)' }}>
                                <Calendar size={12} /> Generar Año Completo
                            </button>
                        </div>

                        {mensualidades.length > 0 && (
                            <div className="p-4 rounded-2xl flex items-center justify-between"
                                 style={{ background: 'var(--pb-light)', border: '1px solid var(--border-md)' }}>
                                <div>
                                    <p className="text-[10px] font-black uppercase tracking-wider" style={{ color: 'var(--pb)' }}>
                                        Monto Personalizado
                                    </p>
                                    <p className="text-[10px]" style={{ color: 'var(--ash)' }}>Cambiar todas las cuotas:</p>
                                </div>
                                <input
                                    type="number"
                                    placeholder="Ej: 30"
                                    className="w-20 px-3 py-2 rounded-lg text-sm outline-none font-bold text-center"
                                    style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)' }}
                                    onChange={(e) => onBulkUpdate(e.target.value)}
                                />
                            </div>
                        )}

                        {mensualidades.length > 0 ? (
                            mensualidades.map((m) => (
                                <div key={m.id} className="p-4 rounded-2xl"
                                     style={{ background: 'var(--ash-light)', border: '0.5px solid var(--border)' }}>
                                    <div className="flex items-center justify-between mb-2">
                                        <div>
                                            <p className="font-bold text-sm" style={{ color: 'var(--jet)' }}>
                                                {m.mes} {m.anio}
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
                                                value={m.monto_usd}
                                                onChange={(e) => onUpdateMonto(m.id, e.target.value)}
                                            />
                                        </div>
                                    </div>
                                    {m.historial?.length > 0 && (
                                        <div className="pl-4 border-l-2" style={{ borderColor: 'var(--pb)' }}>
                                            <p className="text-[9px] font-bold uppercase mb-1 flex items-center gap-1"
                                               style={{ color: 'var(--ash)' }}>
                                                <History size={10} /> Historial de cambios
                                            </p>
                                            {m.historial.map((h, i) => (
                                                <p key={i} className="text-[10px] leading-tight" style={{ color: 'var(--ash)' }}>
                                                    {/* Q-3 fix: formateo con date-fns */}
                                                    {formatearFechaHistorial(h.fecha)} -{' '}
                                                    <span className="font-bold">{h.usuario}</span>: ${h.monto_anterior} → ${h.monto_nuevo}
                                                </p>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            ))
                        ) : (
                            <p className="text-center py-10 italic" style={{ color: 'var(--ash)' }}>
                                No hay mensualidades pendientes para este alumno.
                            </p>
                        )}
                    </>
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
                    disabled={saving || mensualidades.length === 0}
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

export default ModalAjustarMensualidades;
