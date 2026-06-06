import { X, Save, GraduationCap, UserCircle, Loader2 } from 'lucide-react';
import DatePickerES from '../DatePickerES';
import GradoSelect from '../GradoSelect';

const Campo = ({ label, children }) => (
    <div>
        <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>
            {label}
        </label>
        {children}
    </div>
);

const inputStyle = {
    border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)',
};

const inputClass = "w-full px-3 py-2 rounded-lg text-sm outline-none";

const ModalEditarAlumno = ({ form, setForm, saving, onClose, onSave }) => {
    const set = (field) => (e) => setForm(prev => ({ ...prev, [field]: e.target.value }));

    return (
        <div className="fixed inset-0 backdrop-blur-sm flex items-center justify-center z-50 p-4"
             style={{ background: 'rgba(43,48,58,0.5)' }}>
            <div className="rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden animate-fadeIn max-h-[90vh] flex flex-col"
                 style={{ background: 'var(--porcelain)' }}>

                {/* Header */}
                <div className="p-6 flex justify-between items-center"
                     style={{ borderBottom: '0.5px solid var(--border)', background: 'var(--porcelain)' }}>
                    <h2 className="text-xl font-bold" style={{ color: 'var(--jet)' }}>Editar Información</h2>
                    <button onClick={onClose} aria-label="Cerrar modal" style={{ color: 'var(--ash)' }}>
                        <X size={24} />
                    </button>
                </div>

                {/* Body */}
                <div className="p-8 overflow-y-auto space-y-8">
                    {/* Datos del Estudiante */}
                    <section className="space-y-4">
                        <div className="flex items-center gap-2 border-b pb-2" style={{ borderColor: 'var(--border)' }}>
                            <GraduationCap size={20} style={{ color: 'var(--pb)' }} />
                            <h3 className="font-bold uppercase text-xs tracking-widest" style={{ color: 'var(--jet)' }}>
                                Datos del Estudiante
                            </h3>
                        </div>
                        {/* UX-4 fix: grid-cols-1 sm:grid-cols-2 */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <Campo label="Nombres">
                                <input type="text" className={inputClass} style={inputStyle}
                                    value={form.nombre} onChange={set('nombre')} />
                            </Campo>
                            <Campo label="Apellidos">
                                <input type="text" className={inputClass} style={inputStyle}
                                    value={form.apellido} onChange={set('apellido')} />
                            </Campo>
                            <Campo label="Cédula Escolar">
                                <input type="text" className={inputClass} style={inputStyle}
                                    value={form.cedula_escolar} onChange={set('cedula_escolar')} />
                            </Campo>
                            <Campo label="Grado / Año">
                                {/* Q-4 fix: GradoSelect reutilizable desde constantes */}
                                <GradoSelect
                                    value={form.grado_seccion}
                                    onChange={set('grado_seccion')}
                                    className={inputClass}
                                    style={inputStyle}
                                    incluirVacio
                                />
                            </Campo>
                            <Campo label="Fecha de Nacimiento">
                                <DatePickerES
                                    className={inputClass} style={inputStyle}
                                    value={form.fecha_nacimiento}
                                    onChange={set('fecha_nacimiento')} />
                            </Campo>
                            <Campo label="Género">
                                <select className={inputClass} style={inputStyle}
                                    value={form.genero} onChange={set('genero')}>
                                    <option value="">Seleccione...</option>
                                    <option value="masculino">Masculino</option>
                                    <option value="femenino">Femenino</option>
                                </select>
                            </Campo>
                            <Campo label="Estatus Financiero">
                                <select className={inputClass} style={inputStyle}
                                    value={form.estatus_financiero} onChange={set('estatus_financiero')}>
                                    <option value="solvente">Solvente</option>
                                    <option value="mora">Moroso</option>
                                </select>
                            </Campo>
                            <Campo label="Porcentaje Beca (%)">
                                <input type="number" min="0" max="100" className={inputClass} style={inputStyle}
                                    value={form.porcentaje_beca} onChange={set('porcentaje_beca')} />
                            </Campo>
                        </div>
                    </section>

                    {/* Datos del Representante */}
                    <section className="space-y-4">
                        <div className="flex items-center gap-2 border-b pb-2" style={{ borderColor: 'var(--border)' }}>
                            <UserCircle size={20} style={{ color: 'var(--pb)' }} />
                            <h3 className="font-bold uppercase text-xs tracking-widest" style={{ color: 'var(--jet)' }}>
                                Datos del Representante
                            </h3>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <Campo label="Nombres">
                                <input type="text" className={inputClass} style={inputStyle}
                                    value={form.rep_nombre || ''} onChange={set('rep_nombre')} />
                            </Campo>
                            <Campo label="Apellidos">
                                <input type="text" className={inputClass} style={inputStyle}
                                    value={form.rep_apellido || ''} onChange={set('rep_apellido')} />
                            </Campo>
                            <Campo label="Cédula">
                                <input type="text" className={inputClass} style={inputStyle}
                                    value={form.rep_cedula || ''} onChange={set('rep_cedula')} />
                            </Campo>
                            <Campo label="Teléfono">
                                <input type="text" className={inputClass} style={inputStyle}
                                    value={form.rep_telefono || ''} onChange={set('rep_telefono')} />
                            </Campo>
                            <div className="sm:col-span-2">
                                <Campo label="Correo Electrónico">
                                    <input type="email" className={inputClass} style={inputStyle}
                                        value={form.rep_correo || ''} onChange={set('rep_correo')} />
                                </Campo>
                            </div>
                            <div className="sm:col-span-2">
                                <Campo label="Dirección de Habitación">
                                    <textarea rows="2" className={`${inputClass} resize-none`} style={inputStyle}
                                        value={form.rep_direccion || ''} onChange={set('rep_direccion')} />
                                </Campo>
                            </div>
                        </div>
                    </section>
                </div>

                {/* Footer */}
                <div className="p-6 border-t flex gap-3"
                     style={{ background: 'var(--ash-light)', borderTop: '0.5px solid var(--border)' }}>
                    <button type="button" onClick={onClose}
                        className="flex-1 py-3 rounded-xl font-bold"
                        style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)', color: 'var(--ash)' }}>
                        Cancelar
                    </button>
                    <button type="button" onClick={onSave} disabled={saving}
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

export default ModalEditarAlumno;
