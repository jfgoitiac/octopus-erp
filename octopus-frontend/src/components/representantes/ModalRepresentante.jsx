import { Save, Loader2 } from 'lucide-react';
import { Modal } from '../ui/Modal';

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
    const field = (key) => ({
        value: form[key],
        onChange: (e) => setForm(p => ({ ...p, [key]: e.target.value })),
        style: INPUT_STYLE,
    });

    const footer = (
        <>
            <button
                type="button"
                onClick={onClose}
                className="w-full sm:w-auto py-2 rounded-lg text-xs font-medium"
                style={{ border: '0.5px solid var(--border-md)', color: 'var(--ash)' }}
            >
                Cancelar
            </button>
            <button
                type="submit"
                form="form-representante"
                disabled={saving}
                className="w-full sm:w-auto flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium text-white"
                style={{ background: 'var(--pb)', opacity: saving ? 0.7 : 1 }}
            >
                {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                {saving ? 'Guardando…' : 'Guardar'}
            </button>
        </>
    );

    return (
        <Modal
            open
            onClose={onClose}
            titulo={editando ? 'Editar representante' : 'Agregar representante'}
            footer={footer}
            size="sm"
        >
            <form id="form-representante" onSubmit={onSave} className="flex flex-col gap-3">
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

                {editando && (
                    <Field
                        id="rep-monto-proyecto-inversion"
                        label="Proyecto de Inversión del período activo (USD)"
                        error={formErrors.monto_proyecto_inversion}
                    >
                        <input
                            id="rep-monto-proyecto-inversion"
                            type="number"
                            min="0"
                            step="0.01"
                            {...field('monto_proyecto_inversion')}
                        />
                    </Field>
                )}
            </form>
        </Modal>
    );
};

export default ModalRepresentante;
