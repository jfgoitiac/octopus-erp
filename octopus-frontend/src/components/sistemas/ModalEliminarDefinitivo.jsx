import { useState } from 'react';
import { AlertTriangle, Loader2, Trash2 } from 'lucide-react';
import { Modal } from '../ui/Modal';

// TODO-TEMPORAL: quitar junto con LimpiezaDatosTab tras limpieza de datos de prueba.
// Borrado físico real (no soft-delete) — exige escribir la cédula exacta para confirmar.
const ModalEliminarDefinitivo = ({ tipo, registro, saving, onClose, onConfirmar }) => {
    const [confirmacion, setConfirmacion] = useState('');

    const cedula = tipo === 'alumno' ? registro?.cedula_escolar : registro?.cedula;
    const nombreCompleto = `${registro?.nombre || ''} ${registro?.apellido || ''}`.trim();
    const habilitado = confirmacion.trim() === cedula;

    const detalleCascada = tipo === 'alumno'
        ? 'sus pagos, inscripciones, mensualidades, cuotas, notas y asistencia'
        : 'todos sus alumnos (con sus pagos, inscripciones, notas y asistencia), su solvencia y, si tiene, su cuenta de acceso al portal';

    return (
        <Modal
            open
            onClose={onClose}
            titulo={(
                <>
                    <AlertTriangle size={17} /> Eliminación definitiva
                </>
            )}
            size="sm"
        >
            <div className="space-y-4">
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
        </Modal>
    );
};

export default ModalEliminarDefinitivo;
