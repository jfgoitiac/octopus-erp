import { useRef } from 'react';
import { UserCheck, Loader2 } from 'lucide-react';
import GradoSelect from '../GradoSelect';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { Modal } from '../ui/Modal';

const ModalAsignarGrado = ({ alumno, nuevoGrado, setNuevoGrado, saving, onClose, onConfirmar }) => {
    const containerRef = useRef(null);
    useFocusTrap(containerRef);

    return (
        <Modal
            ref={containerRef}
            open
            onClose={onClose}
            titulo={(
                <div>
                    <div>Asignar Grado / Año</div>
                    {alumno && (
                        <p className="text-xs mt-0.5 font-normal" style={{ color: 'var(--ash)' }}>
                            {alumno.nombre} {alumno.apellido}
                        </p>
                    )}
                </div>
            )}
            size="sm"
        >
            <div className="space-y-4">
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
        </Modal>
    );
};

export default ModalAsignarGrado;
