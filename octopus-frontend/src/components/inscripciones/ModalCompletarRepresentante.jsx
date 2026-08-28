import { useState, useMemo } from 'react';
import { Save, AlertCircle } from 'lucide-react';
import { toast } from 'react-toastify';
import { camposFaltantesRepresentante, PARENTESCO_OPTIONS } from '../../utils/inscripcionValidacion';
import { Modal } from '../ui/Modal';

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

const REQUERIDOS = ['nombre', 'apellido', 'telefono', 'correo', 'direccion'];

// Modal que fuerza a completar los datos críticos de un representante ya
// existente (encontrado por cédula) antes de poder continuar la inscripción.
const ModalCompletarRepresentante = ({ representante, onClose, onGuardar }) => {
    const [form, setForm] = useState(() => ({ ...representante }));
    const [errores, setErrores] = useState({});

    const faltantesIniciales = useMemo(() => camposFaltantesRepresentante(representante), [representante]);

    const inputStyle = (campo) => ({
        border: `0.5px solid ${errores[campo] ? '#f87171' : 'var(--border-md)'}`,
        background: '#fff', color: 'var(--jet)',
    });

    const set = (field) => (e) => {
        setForm(prev => ({ ...prev, [field]: e.target.value }));
        if (errores[field]) setErrores(prev => ({ ...prev, [field]: '' }));
    };

    const handleGuardar = () => {
        const errs = {};
        REQUERIDOS.forEach(campo => {
            if (!String(form[campo] ?? '').trim()) errs[campo] = 'Requerido';
        });
        if (form.correo?.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.correo)) {
            errs.correo = 'Correo inválido';
        }
        if (Object.keys(errs).length > 0) {
            setErrores(errs);
            toast.error('Completa los campos obligatorios antes de continuar.');
            return;
        }
        onGuardar(form);
    };

    const footer = (
        <>
            <button type="button" onClick={onClose}
                className="w-full sm:w-auto py-3 rounded-xl font-bold"
                style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)', color: 'var(--ash)' }}>
                Cancelar
            </button>
            <button type="button" onClick={handleGuardar}
                className="w-full sm:w-auto py-3 rounded-xl font-bold flex items-center justify-center gap-2"
                style={{ background: 'var(--pb)', color: '#fff' }}>
                <Save size={18} /> Guardar y continuar
            </button>
        </>
    );

    return (
        <Modal
            open
            onClose={onClose}
            titulo={(
                <div>
                    <div>Completar datos del representante</div>
                    <p className="text-xs mt-1 font-normal" style={{ color: 'rgba(255,255,255,0.8)' }}>{form.cedula}</p>
                </div>
            )}
            footer={footer}
            size="md"
        >
            {faltantesIniciales.length > 0 && (
                <div className="mb-4 p-3 rounded-xl flex items-start gap-2 text-xs"
                     style={{ background: '#fef2f2', color: '#b91c1c' }}>
                    <AlertCircle size={16} className="mt-0.5 flex-shrink-0" aria-hidden="true" />
                    <span>Este representante tiene datos obligatorios pendientes. Complétalos para poder inscribir a su representado.</span>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Campo label="Nombre" requerido error={errores.nombre}>
                    <input type="text" className={inputClass} style={inputStyle('nombre')} value={form.nombre || ''} onChange={set('nombre')} />
                </Campo>
                <Campo label="Apellido" requerido error={errores.apellido}>
                    <input type="text" className={inputClass} style={inputStyle('apellido')} value={form.apellido || ''} onChange={set('apellido')} />
                </Campo>
                <Campo label="Teléfono" requerido error={errores.telefono}>
                    <input type="tel" className={inputClass} style={inputStyle('telefono')} value={form.telefono || ''} onChange={set('telefono')} />
                </Campo>
                <Campo label="Correo electrónico" requerido error={errores.correo}>
                    <input type="email" className={inputClass} style={inputStyle('correo')} value={form.correo || ''} onChange={set('correo')} />
                </Campo>
                <div className="md:col-span-2">
                    <Campo label="Dirección de habitación" requerido error={errores.direccion}>
                        <textarea rows="2" className={`${inputClass} resize-none`} style={inputStyle('direccion')} value={form.direccion || ''} onChange={set('direccion')} />
                    </Campo>
                </div>
                <Campo label="Parentesco">
                    <select className={inputClass} style={inputStyle('parentesco')} value={form.parentesco || ''} onChange={set('parentesco')}>
                        <option value="">Seleccionar…</option>
                        {PARENTESCO_OPTIONS.map(opt => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                    </select>
                </Campo>
                <Campo label="Nacionalidad">
                    <input type="text" className={inputClass} style={inputStyle('nacionalidad')} value={form.nacionalidad || ''} onChange={set('nacionalidad')} />
                </Campo>
                <div className="md:col-span-2">
                    <Campo label="Nivel de estudio">
                        <input type="text" className={inputClass} style={inputStyle('nivel_estudio')} value={form.nivel_estudio || ''} onChange={set('nivel_estudio')} />
                    </Campo>
                </div>
            </div>
        </Modal>
    );
};

export default ModalCompletarRepresentante;
