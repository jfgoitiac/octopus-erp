import { useState } from 'react';
import { AlertTriangle, Loader2, Trash2 } from 'lucide-react';
import { Modal } from '../ui/Modal';

const FRASE_CONFIRMACION = 'ELIMINAR TODOS LOS ALUMNOS';

// TODO-TEMPORAL: quitar junto con LimpiezaDatosTab tras limpieza de datos de prueba.
// Borrado físico masivo (no soft-delete) — exige escribir una frase exacta para confirmar.
const ModalEliminarTodosAlumnos = ({ saving, onClose, onConfirmar }) => {
    const [confirmacion, setConfirmacion] = useState('');

    const habilitado = confirmacion.trim() === FRASE_CONFIRMACION;

    return (
        <Modal
            open
            onClose={onClose}
            titulo={(
                <>
                    <AlertTriangle size={17} /> Eliminar TODOS los alumnos
                </>
            )}
            size="sm"
        >
            <div className="space-y-4">
                <p className="text-sm" style={{ color: 'var(--ash)' }}>
                    Esta acción borrará de forma <span className="font-bold" style={{ color: 'var(--red)' }}>permanente e irreversible</span> a{' '}
                    <span className="font-bold" style={{ color: 'var(--jet)' }}>todos los alumnos</span> del sistema,
                    junto con sus pagos, inscripciones, mensualidades, cuotas, notas y asistencia.
                    No es lo mismo que retirar/desactivar — no queda ningún registro.
                </p>
                <div>
                    <label className="block text-[11px] uppercase tracking-widest mb-1.5"
                           style={{ color: 'var(--ash)' }}>
                        Escribe <span className="font-bold" style={{ color: 'var(--jet)' }}>{FRASE_CONFIRMACION}</span> para confirmar
                    </label>
                    <input
                        type="text"
                        className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                        style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)' }}
                        placeholder="Escribe la frase de confirmación..."
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
                    Eliminar todos definitivamente
                </button>
            </div>
        </Modal>
    );
};

export default ModalEliminarTodosAlumnos;
