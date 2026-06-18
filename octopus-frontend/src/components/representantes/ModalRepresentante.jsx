import { useEffect } from 'react';
import { X, Save, Loader2 } from 'lucide-react';

const INPUT_STYLE = {
    background: 'var(--bg)', border: '0.5px solid var(--border-md)',
    borderRadius: '8px', color: 'var(--jet)', fontSize: '13px',
    padding: '7px 10px', width: '100%', outline: 'none',
};
const LABEL_STYLE = { fontSize: '11px', color: 'var(--ash)', marginBottom: '3px', display: 'block' };
const ERR_STYLE   = { fontSize: '11px', color: 'var(--red)', marginTop: '2px' };

const Field = ({ id, label, required, error, children }) => (
    <div>
        <label htmlFor={id} style={LABEL_STYLE}>{label}{required && ' *'}</label>
        {children}
        {error && <p style={ERR_STYLE}>{error}</p>}
    </div>
);

const ModalRepresentante = ({ editando, form, setForm, formErrors, saving, onSave, onClose }) => {
    // Cerrar con Escape
    useEffect(() => {
        const handler = (e) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [onClose]);

    const field = (key) => ({
        value: form[key],
        onChange: (e) => setForm(p => ({ ...p, [key]: e.target.value })),
        style: INPUT_STYLE,
    });

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center"
            style={{ background: 'rgba(0,0,0,0.45)' }}
            onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="modal-rep-titulo"
                className="rounded-2xl w-full max-w-md mx-4 flex flex-col"
                style={{ background: 'var(--porcelain)', border: '0.5px solid var(--border-md)' }}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '0.5px solid var(--border-md)' }}>
                    <h2 id="modal-rep-titulo" className="text-sm font-semibold" style={{ color: 'var(--jet)' }}>
                        {editando ? 'Editar representante' : 'Agregar representante'}
                    </h2>
                    <button onClick={onClose} aria-label="Cerrar modal" style={{ color: 'var(--ash)' }}>
                        <X size={16} />
                    </button>
                </div>

                {/* Form */}
                <form onSubmit={onSave} className="px-5 py-4 flex flex-col gap-3">
                    <div className="grid grid-cols-2 gap-3">
                        <Field id="rep-nombre" label="Nombre" required error={formErrors.nombre}>
                            <input id="rep-nombre" {...field('nombre')} />
                        </Field>
                        <Field id="rep-apellido" label="Apellido" required error={formErrors.apellido}>
                            <input id="rep-apellido" {...field('apellido')} />
                        </Field>
                    </div>

                    <Field id="rep-cedula" label="Cédula" required error={formErrors.cedula}>
                        <input
                            id="rep-cedula"
                            inputMode="numeric"
                            {...field('cedula')}
                            readOnly={!!editando}
                            style={{ ...INPUT_STYLE, ...(editando ? { opacity: 0.6, cursor: 'not-allowed' } : {}) }}
                        />
                    </Field>

                    <Field id="rep-telefono" label="Teléfono" error={formErrors.telefono}>
                        <input id="rep-telefono" inputMode="tel" {...field('telefono')} />
                    </Field>

                    <Field id="rep-correo" label="Correo" error={formErrors.correo}>
                        <input id="rep-correo" type="email" {...field('correo')} />
                    </Field>

                    <Field id="rep-direccion" label="Dirección" error={formErrors.direccion}>
                        <textarea
                            id="rep-direccion"
                            rows={2}
                            {...field('direccion')}
                            style={{ ...INPUT_STYLE, resize: 'none' }}
                        />
                    </Field>

                    <div className="flex gap-2 pt-1">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 py-2 rounded-lg text-xs font-medium"
                            style={{ border: '0.5px solid var(--border-md)', color: 'var(--ash)' }}
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={saving}
                            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium text-white"
                            style={{ background: 'var(--pb)', opacity: saving ? 0.7 : 1 }}
                        >
                            {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                            {saving ? 'Guardando…' : 'Guardar'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default ModalRepresentante;
