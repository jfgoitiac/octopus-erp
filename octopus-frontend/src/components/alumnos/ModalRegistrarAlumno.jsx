import { useEffect, useRef } from 'react';
import { X, Save, GraduationCap, UserCircle, Loader2 } from 'lucide-react';
import DatePickerES from '../DatePickerES';
import { useFocusTrap } from '../../hooks/useFocusTrap';

const inputClass = "w-full px-3 py-2 rounded-lg text-sm outline-none";
const inputStyle = { border: '0.5px solid var(--border-md)', color: 'var(--jet)' };

const ModalRegistrarAlumno = ({
    form,
    setForm,
    checkingRep,
    repFound,
    saving,
    onClose,
    onSubmit,
    onLimpiarRep,
}) => {
    const containerRef = useRef(null);
    useFocusTrap(containerRef);

    useEffect(() => {
        const handler = (e) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, [onClose]);

    const set = (field) => (e) => setForm(prev => ({ ...prev, [field]: e.target.value }));

    return (
        <div className="fixed inset-0 backdrop-blur-sm flex items-center justify-center z-50 p-4"
             style={{ background: 'rgba(43,48,58,0.5)' }}>
            <div
                ref={containerRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby="modal-registrar-titulo"
                className="rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden animate-fadeIn max-h-[90vh] flex flex-col"
                style={{ background: 'var(--porcelain)' }}>

                {/* Header */}
                <div className="p-6 flex justify-between items-center"
                     style={{ borderBottom: '0.5px solid var(--border)', background: 'var(--pb)', color: '#fff' }}>
                    <h2 id="modal-registrar-titulo" className="text-xl font-bold">Registrar en Banco Estudiantil</h2>
                    <button onClick={onClose} aria-label="Cerrar modal" style={{ color: '#fff' }}>
                        <X size={24} />
                    </button>
                </div>

                <form onSubmit={onSubmit} className="p-8 overflow-y-auto space-y-8">
                    {/* Datos del Estudiante */}
                    <section className="space-y-4">
                        <h3 className="text-xs font-black uppercase tracking-widest border-b pb-2 flex items-center gap-2"
                            style={{ borderColor: 'var(--border)' }}>
                            <GraduationCap size={16} style={{ color: 'var(--pb)' }} />
                            <span style={{ color: 'var(--jet)' }}>Datos del Estudiante</span>
                        </h3>
                        {/* UX-4 fix: grid responsive */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>
                                    Nombres
                                </label>
                                <input type="text" className={inputClass} style={{ ...inputStyle, background: '#fff' }}
                                    required onChange={set('nombre')} />
                            </div>
                            <div>
                                <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>
                                    Apellidos
                                </label>
                                <input type="text" className={inputClass} style={{ ...inputStyle, background: '#fff' }}
                                    required onChange={set('apellido')} />
                            </div>
                            <div>
                                <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>
                                    Cédula (Opcional)
                                </label>
                                <input type="text" className={inputClass} style={{ ...inputStyle, background: '#fff' }}
                                    onChange={set('cedula_escolar')} />
                            </div>
                            <div>
                                <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>
                                    Fecha Nacimiento
                                </label>
                                <DatePickerES className={inputClass} style={{ ...inputStyle, background: '#fff' }}
                                    value={form.fecha_nacimiento} required onChange={set('fecha_nacimiento')} />
                            </div>
                            <div>
                                <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>
                                    Género
                                </label>
                                <select className={inputClass} style={{ ...inputStyle, background: '#fff' }}
                                    value={form.genero} onChange={set('genero')}>
                                    <option value="masculino">Masculino</option>
                                    <option value="femenino">Femenino</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>
                                    Porcentaje Beca (%)
                                </label>
                                <input type="number" min="0" max="100" className={inputClass}
                                    style={{ ...inputStyle, background: '#fff' }}
                                    value={form.porcentaje_beca} onChange={set('porcentaje_beca')} />
                            </div>
                        </div>
                    </section>

                    {/* Datos del Representante */}
                    <section className="space-y-4">
                        <h3 className="text-xs font-black uppercase tracking-widest border-b pb-2 flex items-center gap-2"
                            style={{ borderColor: 'var(--border)' }}>
                            <UserCircle size={16} style={{ color: 'var(--pb)' }} />
                            <span style={{ color: 'var(--jet)' }}>Datos del Representante</span>
                        </h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {/* Cédula con autocomplete */}
                            <div className="sm:col-span-2">
                                <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>
                                    Cédula
                                </label>
                                <div className="relative">
                                    <input type="text" inputMode="numeric" className={inputClass}
                                        style={{ ...inputStyle, background: repFound ? 'var(--porcelain)' : '#fff' }}
                                        required value={form.rep_cedula} readOnly={repFound}
                                        onChange={set('rep_cedula')} />
                                    {checkingRep && (
                                        <Loader2 size={16} className="absolute right-3 top-2.5 animate-spin"
                                                 style={{ color: 'var(--pb)' }} />
                                    )}
                                    {repFound && (
                                        <button type="button" onClick={onLimpiarRep}
                                            className="absolute right-2 top-1.5 px-2 py-1 text-[10px] font-bold rounded-md"
                                            style={{ background: 'var(--red-light)', color: 'var(--red)' }}>
                                            Limpiar
                                        </button>
                                    )}
                                </div>
                            </div>

                            {[
                                { label: 'Nombres', field: 'rep_nombre', type: 'text', required: true },
                                { label: 'Apellidos', field: 'rep_apellido', type: 'text', required: true },
                                { label: 'Teléfono', field: 'rep_telefono', type: 'tel', inputMode: 'tel', required: true },
                                { label: 'Correo', field: 'rep_correo', type: 'email', required: true },
                            ].map(({ label, field, type, inputMode, required }) => (
                                <div key={field}>
                                    <label className="block text-[11px] uppercase tracking-widest mb-1.5"
                                           style={{ color: 'var(--ash)' }}>
                                        {label}
                                    </label>
                                    <input type={type} inputMode={inputMode} className={inputClass}
                                        style={{ ...inputStyle, background: repFound ? 'var(--porcelain)' : '#fff' }}
                                        required={required} value={form[field]} readOnly={repFound}
                                        onChange={set(field)} />
                                </div>
                            ))}

                            <div className="sm:col-span-2">
                                <label className="block text-[11px] uppercase tracking-widest mb-1.5"
                                       style={{ color: 'var(--ash)' }}>
                                    Dirección
                                </label>
                                <input type="text" className={inputClass}
                                    style={{ ...inputStyle, background: repFound ? 'var(--porcelain)' : '#fff' }}
                                    required value={form.rep_direccion} readOnly={repFound}
                                    onChange={set('rep_direccion')} />
                            </div>
                        </div>
                    </section>

                    <button type="submit" disabled={saving}
                        className="w-full py-4 rounded-2xl font-bold flex items-center justify-center gap-2 text-white disabled:opacity-50"
                        style={{ background: 'var(--pb)' }}>
                        {saving ? <Loader2 className="animate-spin" /> : <Save size={20} />}
                        {saving ? 'Procesando...' : 'Guardar en Banco de Alumnos'}
                    </button>
                </form>
            </div>
        </div>
    );
};

export default ModalRegistrarAlumno;
