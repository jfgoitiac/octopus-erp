import { CheckCircle2, Lock, Loader2, AlertTriangle, RefreshCcw } from 'lucide-react';
import { Modal } from '../ui/Modal';

const CONCEPTO_LABELS = {
    mensualidad: 'Mensualidad',
    inscripcion: 'Inscripción',
    proyecto_inversion: 'Proyecto de Inversión',
};

const filaStyle = { border: '0.5px solid var(--border-md)', background: 'var(--bg)' };
const textoAsh = { color: 'var(--ash)' };

/**
 * Confirmación previa a aplicar un cambio de monto por defecto (mensualidad,
 * inscripción o proyecto de inversión). Muestra el preview (dry_run) devuelto
 * por cobranza/configuracion/ antes de que el usuario aplique el cambio real
 * — ver useAlumnos.js::handlePreviewConfig / handleSaveConfig.
 */
export default function ModalConfirmarPropagacionMontos({ open, onClose, onConfirmar, preview, confirmando }) {
    const conceptos = preview ? Object.keys(preview).filter(k => CONCEPTO_LABELS[k]) : [];

    return (
        <Modal
            open={open}
            onClose={onClose}
            titulo="Confirmar cambio de montos"
            size="md"
            footer={(
                <>
                    <button type="button" onClick={onClose}
                        className="w-full sm:w-auto px-4 py-2.5 rounded-lg text-sm font-medium"
                        style={{ background: 'var(--bg)', color: 'var(--ash)', border: '0.5px solid var(--border-md)' }}>
                        Cancelar
                    </button>
                    <button type="button" onClick={onConfirmar} disabled={confirmando}
                        className="w-full sm:w-auto px-4 py-2.5 rounded-lg text-sm font-medium text-white flex items-center justify-center gap-2 disabled:opacity-50 min-h-[44px]"
                        style={{ background: 'var(--pb)' }}>
                        {confirmando ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                        {confirmando ? 'Aplicando...' : 'Confirmar y aplicar'}
                    </button>
                </>
            )}
        >
            <div className="space-y-3">
                <p className="text-sm sm:text-base" style={textoAsh}>
                    Este cambio de monto se aplicará a las cuotas ya generadas. Revisa cuántas se verán afectadas antes de continuar.
                </p>

                {conceptos.length === 0 && (
                    <p className="text-sm" style={textoAsh}>No hay cambios pendientes por aplicar.</p>
                )}

                {conceptos.map((clave) => {
                    const datos = preview[clave] || {};
                    const actualizadas = datos.actualizadas ?? 0;
                    const respetadas = datos.respetadas_por_override ?? 0;
                    const excluidas = datos.excluidas_por_vencidas ?? 0;
                    return (
                        <div key={clave} className="rounded-lg p-3 sm:p-4 space-y-2" style={filaStyle}>
                            <p className="text-sm sm:text-base font-semibold" style={{ color: 'var(--jet)' }}>
                                {CONCEPTO_LABELS[clave]}
                            </p>
                            <div className="flex items-start gap-2">
                                <RefreshCcw size={16} className="shrink-0 mt-0.5" style={{ color: 'var(--pb)' }} />
                                <p className="text-sm sm:text-base" style={textoAsh}>
                                    <strong style={{ color: 'var(--jet)' }}>{actualizadas}</strong> se actualizarán al nuevo monto
                                </p>
                            </div>
                            <div className="flex items-start gap-2">
                                <Lock size={16} className="shrink-0 mt-0.5" style={textoAsh} />
                                <p className="text-sm sm:text-base" style={textoAsh}>
                                    <strong style={{ color: 'var(--jet)' }}>{respetadas}</strong> se respetan por tener monto asignado manualmente
                                </p>
                            </div>
                            <div className="flex items-start gap-2">
                                <AlertTriangle size={16} className="shrink-0 mt-0.5" style={textoAsh} />
                                <p className="text-sm sm:text-base" style={textoAsh}>
                                    <strong style={{ color: 'var(--jet)' }}>{excluidas}</strong> quedan excluidas por estar vencidas
                                </p>
                            </div>
                        </div>
                    );
                })}
            </div>
        </Modal>
    );
}
