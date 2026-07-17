import { useEffect, useRef, useState } from 'react';
import { X, AlertTriangle, Loader2, Trash2 } from 'lucide-react';
import { useFocusTrap } from '../../hooks/useFocusTrap';

// TODO-TEMPORAL: quitar junto con LimpiezaDatosTab tras limpieza de datos de prueba.
// Borrado físico real (no soft-delete) — exige escribir la cédula exacta para confirmar.
const ModalEliminarDefinitivo = ({ tipo, registro, saving, onClose, onConfirmar }) => {
    const containerRef = useRef(null);
    useFocusTrap(containerRef);
    const [confirmacion, setConfirmacion] = useState('');

    useEffect(() => {
        const handler = (e) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, [onClose]);

    const cedula = tipo === 'alumno' ? registro?.cedula_escolar : registro?.cedula;
    const nombreCompleto = `${registro?.nombre || ''} ${registro?.apellido || ''}`.trim();
    const habilitado = confirmacion.trim() === cedula;

    const detalleCascada = tipo === 'alumno'
        ? 'sus pagos, inscripciones, mensualidades, cuotas, notas y asistencia'
        : 'todos sus alumnos (con sus pagos, inscripciones, notas y asistencia), su solvencia y, si tiene, su cuenta de acceso al portal';

    return (
    <div className="fixed inset-0 backdrop-blur-sm flex items-center justify-center z-50 p-4"
         style={{ background: 'rgba(43,48,58,0.5)' }}>
        <div
            ref={containerRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-eliminar-definitivo-titulo"
            className="rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden animate-fadeIn"
            style={{ background: 'var(--porcelain)' }}
            onClick={(e) => e.stopPropagation()}>

            <div className="p-6 flex justify-between items-center"
                 style={{ background: 'var(--red-light)', color: 'var(--red)' }}>
                <h3 id="modal-eliminar-definitivo-titulo" className="font-bold flex items-center gap-2">
                    <AlertTriangle size={18} /> Eliminación definitiva
                </h3>
                <button onClick={onClose} aria-label="Cerrar modal" style={{ color: 'var(--red)' }}>
                    <X size={20} />
                </button>
            </div>

            <div className="p-6 space-y-4">
                <p className="text-sm" style={{ color: 'var(--ash)' }}>
                    Esta acción borrará de forma <span className="font-bold" style={{ color: 'var(--red)' }}>permanente e irreversible</span> a{' '}
                    <span className="font-bold" style={{ color: 'var(--jet)' }}>{nombreCompleto}</span>, junto con {detalleCascada}.
                    No es lo mismo que retirar/desactivar — no queda ningún registro.
                </p>
                <div>
                    <label className="block text-[11px] uppercase tracking-widest mb-1.5"
                           style={{ color: 'var(--ash)' }}>
                        Escribe la cédula <span className="font-bold" style={{ color: 'var(--jet)' }}>{cedula}</span> para confirmar
                    </label>
                    <input
                        type="text"
                        className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                        style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)' }}
                        placeholder="Cédula..."
                        value={confirmacion}
                        onChange={(e) => setConfirmacion(e.target.value)}
                        autoComplete="off"
                    />
                </div>
                <button
                    onClick={onConfirmar}
                    disabled={saving || !habilitado}
                    className="w-full py-4 rounded-2xl font-bold flex items-center justify-center gap-2 text-white disabled:opacity-50"
                    style={{ background: 'var(--red)' }}>
                    {saving ? <Loader2 className="animate-spin" /> : <Trash2 size={18} />}
                    Eliminar definitivamente
                </button>
            </div>
        </div>
    </div>
    );
};

export default ModalEliminarDefinitivo;
