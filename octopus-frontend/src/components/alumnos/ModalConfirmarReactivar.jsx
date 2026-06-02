import { RefreshCcw, Loader2, X } from 'lucide-react';

// UX-3 fix: reemplaza window.confirm para la acción de reactivar
const ModalConfirmarReactivar = ({ alumno, saving, onConfirmar, onCancelar }) => (
    <div className="fixed inset-0 backdrop-blur-sm flex items-center justify-center z-[70] p-4"
         style={{ background: 'rgba(43,48,58,0.5)' }}>
        <div className="rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden animate-fadeIn"
             style={{ background: 'var(--porcelain)' }}>

            <div className="p-6 flex justify-between items-center"
                 style={{ background: '#dcfce7', color: '#16a34a' }}>
                <h3 className="font-bold flex items-center gap-2">
                    <RefreshCcw size={18} /> Reactivar Alumno
                </h3>
                <button onClick={onCancelar} aria-label="Cancelar" style={{ color: '#16a34a' }}>
                    <X size={20} />
                </button>
            </div>

            <div className="p-6 space-y-4">
                <p className="text-sm" style={{ color: 'var(--ash)' }}>
                    ¿Desea reactivar a{' '}
                    <span className="font-bold" style={{ color: 'var(--jet)' }}>
                        {alumno?.nombre} {alumno?.apellido}
                    </span>?
                    Se le asignará un cupo nuevamente.
                </p>
                <div className="flex gap-3">
                    <button onClick={onCancelar}
                        className="flex-1 py-3 rounded-xl font-bold"
                        style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)', color: 'var(--ash)' }}>
                        Cancelar
                    </button>
                    <button onClick={onConfirmar} disabled={saving}
                        className="flex-[2] py-3 rounded-xl font-bold flex items-center justify-center gap-2 text-white disabled:opacity-50"
                        style={{ background: '#16a34a' }}>
                        {saving ? <Loader2 size={18} className="animate-spin" /> : <RefreshCcw size={18} />}
                        {saving ? 'Reactivando...' : 'Confirmar'}
                    </button>
                </div>
            </div>
        </div>
    </div>
);

export default ModalConfirmarReactivar;
