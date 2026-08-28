import { useRef, useMemo } from 'react';
import { Save, GraduationCap, UserCircle, Loader2 } from 'lucide-react';
import { parse, format, isValid } from 'date-fns';
import SmartDateInput from '../SmartDateInput';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { Modal } from '../ui/Modal';

function parseISODate(str) {
    if (!str) return null;
    const parsed = parse(str, 'yyyy-MM-dd', new Date());
    return isValid(parsed) ? parsed : null;
}

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

    const set = (field) => (e) => setForm(prev => ({ ...prev, [field]: e.target.value }));

    // La dirección del alumno se captura primero en este formulario — mientras el
    // representante no tenga una dirección propia (o siga igual a la del alumno,
    // es decir aún no la editó a mano), se mantiene sincronizada con la del alumno.
    // Si el usuario edita la dirección del representante directamente, deja de sincronizarse.
    const handleDireccionAlumno = (e) => {
        const value = e.target.value;
        setForm(prev => {
            const repSincronizada = !repFound && (prev.rep_direccion === '' || prev.rep_direccion === prev.direccion);
            return {
                ...prev,
                direccion: value,
                rep_direccion: repSincronizada ? value : prev.rep_direccion,
            };
        });
    };

    const fechaNacimientoDate = useMemo(
        () => parseISODate(form.fecha_nacimiento),
        [form.fecha_nacimiento]
    );

    const handleFechaNacimiento = (date) => {
        setForm(prev => ({ ...prev, fecha_nacimiento: date ? format(date, 'yyyy-MM-dd') : '' }));
    };

    const footer = (
        <button type="submit" form="form-registrar-alumno" disabled={saving}
            className="w-full py-3 rounded-xl font-bold flex items-center justify-center gap-2 text-white disabled:opacity-50"
            style={{ background: 'var(--pb)' }}>
            {saving ? <Loader2 className="animate-spin" /> : <Save size={20} />}
            {saving ? 'Procesando...' : 'Guardar en Banco de Alumnos'}
        </button>
    );

    return (
        <Modal
            ref={containerRef}
            open
            onClose={onClose}
            titulo="Registrar en Banco Estudiantil"
            footer={footer}
            size="lg"
        >
            <form id="form-registrar-alumno" onSubmit={onSubmit} className="space-y-8">
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
                            <input type="text" placeholder="Se autogenera si se deja en blanco" className={inputClass} style={{ ...inputStyle, background: '#fff' }}
                                onChange={set('cedula_escolar')} />
                        </div>
                        <div>
                            <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>
                                Fecha Nacimiento
                            </label>
                            <SmartDateInput className={inputClass} style={{ ...inputStyle, background: '#fff' }}
                                value={fechaNacimientoDate} onChange={handleFechaNacimiento}
                                aria-label="Fecha de nacimiento" />
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
                        <div className="sm:col-span-2">
                            <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>
                                Dirección
                            </label>
                            <input type="text" className={inputClass} style={{ ...inputStyle, background: '#fff' }}
                                value={form.direccion} onChange={handleDireccionAlumno} />
                        </div>
                        <div>
                            <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>
                                Lugar de Nacimiento
                            </label>
                            <input type="text" className={inputClass} style={{ ...inputStyle, background: '#fff' }}
                                value={form.lugar_nacimiento} onChange={set('lugar_nacimiento')} />
                        </div>
                        <div>
                            <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>
                                País de Nacimiento
                            </label>
                            <input type="text" className={inputClass} style={{ ...inputStyle, background: '#fff' }}
                                value={form.pais_nacimiento} onChange={set('pais_nacimiento')} />
                        </div>
                        <div>
                            <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>
                                Estado de Nacimiento
                            </label>
                            <input type="text" className={inputClass} style={{ ...inputStyle, background: '#fff' }}
                                value={form.estado_nacimiento} onChange={set('estado_nacimiento')} />
                        </div>
                        <div>
                            <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>
                                Institución de Procedencia
                            </label>
                            <input type="text" className={inputClass} style={{ ...inputStyle, background: '#fff' }}
                                value={form.institucion_procedencia} onChange={set('institucion_procedencia')} />
                        </div>
                        <div>
                            <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>
                                Peso (kg)
                            </label>
                            <input type="number" step="0.01" className={inputClass} style={{ ...inputStyle, background: '#fff' }}
                                value={form.peso} onChange={set('peso')} />
                        </div>
                        <div>
                            <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>
                                Estatura (cm)
                            </label>
                            <input type="number" step="0.01" className={inputClass} style={{ ...inputStyle, background: '#fff' }}
                                value={form.estatura} onChange={set('estatura')} />
                        </div>
                        <div>
                            <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>
                                Bautizado
                            </label>
                            <select className={inputClass} style={{ ...inputStyle, background: '#fff' }}
                                value={form.bautizado} onChange={set('bautizado')}>
                                <option value="">No especifica</option>
                                <option value="true">Sí</option>
                                <option value="false">No</option>
                            </select>
                        </div>
                        <div className="sm:col-span-2">
                            <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>
                                Alérgico a
                            </label>
                            <input type="text" className={inputClass} style={{ ...inputStyle, background: '#fff' }}
                                value={form.alergico} onChange={set('alergico')} />
                        </div>
                        <div>
                            <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>
                                Parentesco con el Representante
                            </label>
                            <select className={inputClass} style={{ ...inputStyle, background: '#fff' }}
                                value={form.parentesco} onChange={set('parentesco')}>
                                <option value="">Seleccionar…</option>
                                <option value="padre">Padre</option>
                                <option value="madre">Madre</option>
                                <option value="tutor">Tutor</option>
                                <option value="otro">Otro</option>
                            </select>
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
                                    style={{ ...inputStyle, background: '#fff' }}
                                    required={required} value={form[field]}
                                    onChange={set(field)} />
                            </div>
                        ))}

                        <div className="sm:col-span-2">
                            <label className="block text-[11px] uppercase tracking-widest mb-1.5"
                                   style={{ color: 'var(--ash)' }}>
                                Dirección
                            </label>
                            <input type="text" className={inputClass}
                                style={{ ...inputStyle, background: '#fff' }}
                                required value={form.rep_direccion}
                                onChange={set('rep_direccion')} />
                        </div>

                        <div>
                            <label className="block text-[11px] uppercase tracking-widest mb-1.5"
                                   style={{ color: 'var(--ash)' }}>
                                Nacionalidad
                            </label>
                            <input type="text" className={inputClass}
                                style={{ ...inputStyle, background: '#fff' }}
                                value={form.rep_nacionalidad}
                                onChange={set('rep_nacionalidad')} />
                        </div>
                        <div className="sm:col-span-2">
                            <label className="block text-[11px] uppercase tracking-widest mb-1.5"
                                   style={{ color: 'var(--ash)' }}>
                                Nivel de Estudio
                            </label>
                            <input type="text" className={inputClass}
                                style={{ ...inputStyle, background: '#fff' }}
                                value={form.rep_nivel_estudio}
                                onChange={set('rep_nivel_estudio')} />
                        </div>
                    </div>
                </section>
            </form>
        </Modal>
    );
};

export default ModalRegistrarAlumno;
