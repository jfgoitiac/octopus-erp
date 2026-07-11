import { useState, useRef, useMemo } from 'react';
import { X, Save, AlertCircle } from 'lucide-react';
import { parse, format, isValid, differenceInYears } from 'date-fns';
import { toast } from 'react-toastify';
import SmartDateInput from '../SmartDateInput';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { camposFaltantesAlumno, contactoEmergenciaDesdeRepresentante } from '../../utils/inscripcionValidacion';

function parseISODate(str) {
    if (!str) return null;
    const parsed = parse(str, 'yyyy-MM-dd', new Date());
    return isValid(parsed) ? parsed : null;
}

const Campo = ({ label, requerido, error, children }) => (
    <div>
        <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>
            {label} {requerido && <span className="text-red-500">*</span>}
        </label>
        {children}
        {error && <p className="text-[10px] mt-1 text-red-500">{error}</p>}
    </div>
);

const inputClass = "w-full px-3 py-2 rounded-lg text-sm outline-none";

const REQUERIDOS = ['fecha_nacimiento', 'genero', 'direccion', 'contacto_emergencia_nombre', 'contacto_emergencia_telefono', 'contacto_emergencia_parentesco'];

// Modal que fuerza a completar los datos críticos de un alumno ya existente
// antes de poder continuar con la inscripción — evita reinscribir con fichas
// incompletas (dirección, contacto de emergencia, etc.).
const ModalCompletarAlumno = ({ alumno, representante, onClose, onGuardar }) => {
    const containerRef = useRef(null);
    useFocusTrap(containerRef);
    // Solo se ofrece por defecto si el alumno no trae ya un contacto propio
    // distinto — así no se pisa un dato manual ya cargado.
    const sinContactoPropio = !alumno.contacto_emergencia_nombre?.trim()
        && !alumno.contacto_emergencia_telefono?.trim()
        && !alumno.contacto_emergencia_parentesco?.trim();
    const usarRepInicial = sinContactoPropio && !!(representante?.nombre && representante?.telefono);

    const [form, setForm] = useState(() => ({
        ...alumno,
        ...(usarRepInicial ? contactoEmergenciaDesdeRepresentante(representante) : {}),
    }));
    const [errores, setErrores] = useState({});
    const [usarRepComoContacto, setUsarRepComoContacto] = useState(usarRepInicial);

    const faltantesIniciales = useMemo(() => camposFaltantesAlumno(alumno), [alumno]);

    const handleToggleUsarRepContacto = (checked) => {
        setUsarRepComoContacto(checked);
        if (checked) {
            setForm(prev => ({ ...prev, ...contactoEmergenciaDesdeRepresentante(representante) }));
            setErrores(prev => ({ ...prev, contacto_emergencia_nombre: '', contacto_emergencia_telefono: '', contacto_emergencia_parentesco: '' }));
        }
    };

    const inputStyle = (campo) => ({
        border: `0.5px solid ${errores[campo] ? '#f87171' : 'var(--border-md)'}`,
        background: '#fff', color: 'var(--jet)',
    });

    const set = (field) => (e) => {
        setForm(prev => ({ ...prev, [field]: e.target.value }));
        if (errores[field]) setErrores(prev => ({ ...prev, [field]: '' }));
    };

    const fechaNacimientoDate = useMemo(() => parseISODate(form.fecha_nacimiento), [form.fecha_nacimiento]);
    const handleFechaNacimiento = (date) => {
        setForm(prev => ({ ...prev, fecha_nacimiento: date ? format(date, 'yyyy-MM-dd') : '' }));
        if (errores.fecha_nacimiento) setErrores(prev => ({ ...prev, fecha_nacimiento: '' }));
    };

    // Edad calculada automáticamente a partir de la fecha de nacimiento —
    // nunca se captura a mano.
    const edadCalculada = useMemo(
        () => (fechaNacimientoDate ? differenceInYears(new Date(), fechaNacimientoDate) : null),
        [fechaNacimientoDate]
    );

    const handleGuardar = () => {
        const errs = {};
        REQUERIDOS.forEach(campo => {
            if (!String(form[campo] ?? '').trim()) errs[campo] = 'Requerido';
        });
        if (Object.keys(errs).length > 0) {
            setErrores(errs);
            toast.error('Completa los campos obligatorios antes de continuar.');
            return;
        }
        onGuardar(form);
    };

    return (
        <div className="fixed inset-0 backdrop-blur-sm flex items-center justify-center z-50 p-4"
             style={{ background: 'rgba(43,48,58,0.5)' }}>
            <div
                ref={containerRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby="modal-completar-alumno-titulo"
                className="rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden animate-fadeIn max-h-[90vh] flex flex-col"
                style={{ background: 'var(--porcelain)' }}
                onClick={(e) => e.stopPropagation()}
            >
                <div className="p-6 flex justify-between items-center" style={{ borderBottom: '0.5px solid var(--border)' }}>
                    <div>
                        <h2 id="modal-completar-alumno-titulo" className="text-xl font-bold" style={{ color: 'var(--jet)' }}>
                            Completar datos del estudiante
                        </h2>
                        <p className="text-xs mt-1" style={{ color: 'var(--ash)' }}>
                            {form.nombre} {form.apellido}
                        </p>
                    </div>
                    <button onClick={onClose} aria-label="Cerrar modal" style={{ color: 'var(--ash)' }}>
                        <X size={24} />
                    </button>
                </div>

                {faltantesIniciales.length > 0 && (
                    <div className="mx-6 mt-4 p-3 rounded-xl flex items-start gap-2 text-xs"
                         style={{ background: '#fef2f2', color: '#b91c1c' }}>
                        <AlertCircle size={16} className="mt-0.5 flex-shrink-0" aria-hidden="true" />
                        <span>Este estudiante tiene datos obligatorios pendientes. Complétalos para poder inscribirlo.</span>
                    </div>
                )}

                <div className="p-6 overflow-y-auto space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Campo label="Nombre">
                            <input type="text" className={inputClass} style={inputStyle('nombre')} value={form.nombre || ''} onChange={set('nombre')} />
                        </Campo>
                        <Campo label="Apellido">
                            <input type="text" className={inputClass} style={inputStyle('apellido')} value={form.apellido || ''} onChange={set('apellido')} />
                        </Campo>
                        <Campo label="Cédula Escolar (Opcional)">
                            <input type="text" className={inputClass} style={inputStyle('cedula_escolar')} value={form.cedula_escolar || ''} onChange={set('cedula_escolar')} />
                        </Campo>
                        <Campo label="Fecha de nacimiento" requerido error={errores.fecha_nacimiento}>
                            <SmartDateInput
                                className={inputClass} style={inputStyle('fecha_nacimiento')}
                                value={fechaNacimientoDate} onChange={handleFechaNacimiento}
                                aria-label="Fecha de nacimiento"
                            />
                            {edadCalculada !== null && (
                                <p className="text-[11px] mt-1.5" style={{ color: 'var(--ash)' }}>
                                    Edad: {edadCalculada} {edadCalculada === 1 ? 'año' : 'años'}
                                </p>
                            )}
                        </Campo>
                        <Campo label="Género" requerido error={errores.genero}>
                            <select className={inputClass} style={inputStyle('genero')} value={form.genero || ''} onChange={set('genero')}>
                                <option value="">Seleccione...</option>
                                <option value="masculino">Masculino</option>
                                <option value="femenino">Femenino</option>
                            </select>
                        </Campo>
                        <div className="md:col-span-2">
                            <Campo label="Dirección del estudiante" requerido error={errores.direccion}>
                                <textarea rows="2" className={`${inputClass} resize-none`} style={inputStyle('direccion')} value={form.direccion || ''} onChange={set('direccion')} />
                            </Campo>
                        </div>
                    </div>

                    <div>
                        <h4 className="text-[11px] uppercase tracking-widest mb-3" style={{ color: 'var(--ash)' }}>
                            Contacto de emergencia
                        </h4>
                        {representante?.nombre && representante?.telefono && (
                            <div className="flex items-center gap-2 mb-3">
                                <input
                                    id="modal-usar-rep-contacto"
                                    type="checkbox"
                                    checked={usarRepComoContacto}
                                    onChange={(e) => handleToggleUsarRepContacto(e.target.checked)}
                                    className="w-4 h-4 rounded"
                                />
                                <label htmlFor="modal-usar-rep-contacto" className="text-xs" style={{ color: 'var(--ash)' }}>
                                    Usar los datos del representante ({representante.nombre} {representante.apellido}) como contacto de emergencia
                                </label>
                            </div>
                        )}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <Campo label="Nombre del contacto" requerido error={errores.contacto_emergencia_nombre}>
                                <input type="text" disabled={usarRepComoContacto} className={`${inputClass} disabled:opacity-60`} style={inputStyle('contacto_emergencia_nombre')} value={form.contacto_emergencia_nombre || ''} onChange={set('contacto_emergencia_nombre')} />
                            </Campo>
                            <Campo label="Teléfono del contacto" requerido error={errores.contacto_emergencia_telefono}>
                                <input type="tel" disabled={usarRepComoContacto} className={`${inputClass} disabled:opacity-60`} style={inputStyle('contacto_emergencia_telefono')} value={form.contacto_emergencia_telefono || ''} onChange={set('contacto_emergencia_telefono')} />
                            </Campo>
                            <div className="md:col-span-2">
                                <Campo label="Parentesco del contacto" requerido error={errores.contacto_emergencia_parentesco}>
                                    <input type="text" disabled={usarRepComoContacto} className={`${inputClass} disabled:opacity-60`} style={inputStyle('contacto_emergencia_parentesco')} value={form.contacto_emergencia_parentesco || ''} onChange={set('contacto_emergencia_parentesco')} />
                                </Campo>
                            </div>
                        </div>
                    </div>

                    <div>
                        <h4 className="text-[11px] uppercase tracking-widest mb-3" style={{ color: 'var(--ash)' }}>
                            Nacimiento, procedencia y salud (opcional)
                        </h4>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <Campo label="Lugar de nacimiento">
                                <input type="text" className={inputClass} style={inputStyle('lugar_nacimiento')} value={form.lugar_nacimiento || ''} onChange={set('lugar_nacimiento')} />
                            </Campo>
                            <Campo label="País">
                                <input type="text" className={inputClass} style={inputStyle('pais_nacimiento')} value={form.pais_nacimiento || ''} onChange={set('pais_nacimiento')} />
                            </Campo>
                            <Campo label="Estado">
                                <input type="text" className={inputClass} style={inputStyle('estado_nacimiento')} value={form.estado_nacimiento || ''} onChange={set('estado_nacimiento')} />
                            </Campo>
                            <div className="md:col-span-3">
                                <Campo label="Institución de procedencia">
                                    <input type="text" className={inputClass} style={inputStyle('institucion_procedencia')} value={form.institucion_procedencia || ''} onChange={set('institucion_procedencia')} />
                                </Campo>
                            </div>
                            <Campo label="Peso (kg)">
                                <input type="number" step="0.01" className={inputClass} style={inputStyle('peso')} value={form.peso || ''} onChange={set('peso')} />
                            </Campo>
                            <Campo label="Estatura (cm)">
                                <input type="number" step="0.01" className={inputClass} style={inputStyle('estatura')} value={form.estatura || ''} onChange={set('estatura')} />
                            </Campo>
                            <Campo label="Bautizado">
                                <select
                                    className={inputClass} style={inputStyle('bautizado')}
                                    value={form.bautizado === null || form.bautizado === undefined ? '' : String(form.bautizado)}
                                    onChange={(e) => setForm(prev => ({ ...prev, bautizado: e.target.value === '' ? null : e.target.value === 'true' }))}
                                >
                                    <option value="">No especifica</option>
                                    <option value="true">Sí</option>
                                    <option value="false">No</option>
                                </select>
                            </Campo>
                            <div className="md:col-span-3">
                                <Campo label="Alérgico a">
                                    <input type="text" className={inputClass} style={inputStyle('alergico')} value={form.alergico || ''} onChange={set('alergico')} />
                                </Campo>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="p-6 border-t flex gap-3" style={{ background: 'var(--ash-light)', borderTop: '0.5px solid var(--border)' }}>
                    <button type="button" onClick={onClose}
                        className="flex-1 py-3 rounded-xl font-bold"
                        style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)', color: 'var(--ash)' }}>
                        Cancelar
                    </button>
                    <button type="button" onClick={handleGuardar}
                        className="flex-1 py-3 rounded-xl font-bold flex items-center justify-center gap-2"
                        style={{ background: 'var(--pb)', color: '#fff' }}>
                        <Save size={18} /> Guardar y continuar
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ModalCompletarAlumno;
