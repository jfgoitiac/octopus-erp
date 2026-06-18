import { useEffect, useRef } from 'react';
import { X, UserCheck, Loader2 } from 'lucide-react';
import GradoSelect from '../GradoSelect';
import { useFocusTrap } from '../../hooks/useFocusTrap';

const ModalAsignarGrado = ({ alumno, nuevoGrado, setNuevoGrado, saving, onClose, onConfirmar }) => {
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
            aria-labelledby="modal-grado-titulo"
            className="rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden animate-fadeIn"
            style={{ background: 'var(--porcelain)' }}>

            <div className="p-6 flex justify-between items-center"
                 style={{ borderBottom: '0.5px solid var(--border)' }}>
                <div>
                    <h3 id="modal-grado-titulo" className="font-bold" style={{ color: 'var(--jet)' }}>Asignar Grado / Año</h3>
                    {alumno && (
                        <p className="text-xs mt-0.5" style={{ color: 'var(--ash)' }}>
                            {alumno.nombre} {alumno.apellido}
                        </p>
                    )}
                </div>
                <button onClick={onClose} aria-label="Cerrar modal" style={{ color: 'var(--ash)' }}>
                    <X size={20} />
                </button>
            </div>

            <div className="p-6 space-y-4">
                <label className="block text-[11px] uppercase tracking-widest mb-1.5"
                       style={{ color: 'var(--ash)' }}>
                    Seleccione Nivel Escolar
                </label>
                {/* Q-4 fix: GradoSelect compartido */}
                <GradoSelect
                    value={nuevoGrado}
                    onChange={(e) => setNuevoGrado(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                    style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)' }}
                    incluirVacio
                />
                <button
                    onClick={onConfirmar}
                    disabled={saving || !nuevoGrado}
                    className="w-full py-4 rounded-2xl font-bold flex items-center justify-center gap-2 disabled:opacity-50 text-white"
                    style={{ background: '#16a34a' }}>
                    {saving ? <Loader2 className="animate-spin" /> : <UserCheck size={18} />}
                    Confirmar Asignación
                </button>
            </div>
        </div>
    </div>
    );
};

export default ModalAsignarGrado;
