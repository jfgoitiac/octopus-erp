import React, { useState, useEffect, useCallback } from 'react';
import { UserPlus, ArrowRight, ArrowLeft, AlertCircle } from 'lucide-react';
import { toast } from 'react-toastify';
import DatePickerES from '../DatePickerES';
import { fetchAlumnosPorRepresentante } from '../../api/inscripciones.service';
import { SkeletonCard } from './SkeletonCard';

const LABELS_ALUMNO = {
    nombre:         'Nombre',
    apellido:       'Apellido',
    cedula_escolar: 'Cédula Escolar',
};

export const PasoAlumno = ({ datos, setDatos, onContinuar, onVolver }) => {
    const [alumnos,      setAlumnos]      = useState([]);
    const [loading,      setLoading]      = useState(true);
    const [showFormNuevo, setShowFormNuevo] = useState(false);
    const [errores,      setErrores]      = useState({});

    const fetchAlumnos = useCallback(async (signal) => {
        setLoading(true);
        try {
            const cedula = datos.representante?.cedula ?? '';
            const res    = await fetchAlumnosPorRepresentante(cedula, signal);
            setAlumnos(res.data || []);
        } catch (err) {
            if (err.name !== 'CanceledError') toast.error('Error al cargar alumnos vinculados');
        } finally {
            setLoading(false);
        }
    }, [datos.representante?.cedula]);

    useEffect(() => {
        const controller = new AbortController();
        fetchAlumnos(controller.signal);
        return () => controller.abort();
    }, [fetchAlumnos]);

    const handleNewAlumnoChange = (e) => {
        const { name, value } = e.target;
        setDatos(prev => ({ ...prev, alumno: { ...prev.alumno, [name]: value } }));
        if (errores[name]) setErrores(prev => ({ ...prev, [name]: '' }));
    };

    const handleSelectExistente = (alu) => {
        setDatos(prev => ({ ...prev, alumno: alu, esAlumnoNuevo: false }));
        setShowFormNuevo(false);
    };

    const handleActivarNuevo = () => {
        setDatos(prev => ({
            ...prev,
            alumno: {
                nombre: '', apellido: '', cedula_escolar: '',
                fecha_nacimiento: '', genero: 'masculino',
            },
            esAlumnoNuevo: true,
        }));
        setShowFormNuevo(true);
    };

    const handleContinuar = () => {
        if (!datos.alumno) return;
        if (!datos.esAlumnoNuevo) { onContinuar(); return; }

        const errs = {};
        if (!datos.alumno.nombre?.trim())           errs.nombre           = 'Requerido';
        if (!datos.alumno.apellido?.trim())          errs.apellido         = 'Requerido';
        if (!datos.alumno.fecha_nacimiento)          errs.fecha_nacimiento = 'Requerido';
        if (!datos.alumno.genero)                    errs.genero           = 'Requerido';

        if (Object.keys(errs).length > 0) {
            setErrores(errs);
            return;
        }
        onContinuar();
    };

    return (
        <div className="max-w-4xl mx-auto space-y-8 animate-fadeIn">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">

                {/* Tarjeta "alumno nuevo" — button para accesibilidad de teclado */}
                <button
                    type="button"
                    onClick={handleActivarNuevo}
                    aria-pressed={showFormNuevo}
                    className="p-6 rounded-2xl border-2 border-dashed flex flex-col items-center justify-center text-center gap-3 transition-all"
                    style={{
                        borderColor: showFormNuevo ? 'var(--pb)' : 'var(--border-md)',
                        background:  showFormNuevo ? 'var(--pb-light)' : 'transparent',
                    }}
                >
                    <UserPlus size={32} style={{ color: 'var(--pb)' }} aria-hidden="true" />
                    <p className="text-xs font-medium uppercase tracking-widest" style={{ color: 'var(--pb)' }}>
                        Inscribir alumno nuevo
                    </p>
                </button>

                {loading
                    ? Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)
                    : alumnos.map(alu => {
                        const isSelected  = datos.alumno?.id === alu.id && !showFormNuevo;
                        const yaInscrito  = alu.estado_inscripcion === 'inscrito';
                        return (
                            <button
                                key={alu.id}
                                type="button"
                                disabled={yaInscrito}
                                onClick={() => handleSelectExistente(alu)}
                                aria-pressed={isSelected}
                                className={`p-6 rounded-2xl transition-all relative overflow-hidden text-left w-full
                                    ${yaInscrito ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                                style={{
                                    border:     isSelected ? '2px solid var(--pb)' : '0.5px solid var(--border-md)',
                                    background: isSelected ? 'var(--pb-light)' : 'var(--porcelain)',
                                }}
                            >
                                <p className="font-medium" style={{ color: 'var(--jet)' }}>
                                    {alu.nombre} {alu.apellido}
                                </p>
                                <p className="text-[10px] font-mono mt-1" style={{ color: 'var(--ash)' }}>
                                    {alu.cedula_escolar || 'Sin Cédula Escolar'}
                                </p>
                                <div className="mt-4 flex items-center justify-between">
                                    <span
                                        className="text-[10px] px-2 py-0.5 rounded-md"
                                        style={{ background: 'var(--border)', color: 'var(--ash)' }}
                                    >
                                        {(alu.grado_seccion || 'No inscrito').split(' - ')[0]}
                                    </span>
                                    {yaInscrito && (
                                        <span className="flex items-center gap-1 text-[10px] font-medium text-amber-600">
                                            <AlertCircle size={12} aria-hidden="true" /> Ya inscrito
                                        </span>
                                    )}
                                </div>
                            </button>
                        );
                    })
                }
            </div>

            {showFormNuevo && (
                <div
                    className="p-8 rounded-2xl space-y-6 animate-fadeIn"
                    style={{ background: 'var(--porcelain)', border: '0.5px solid var(--border-md)' }}
                >
                    <h3 className="text-sm font-medium" style={{ color: 'var(--jet)' }}>
                        Datos del Nuevo Estudiante
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {['nombre', 'apellido', 'cedula_escolar'].map(field => (
                            <div key={field}>
                                <label
                                    htmlFor={`alu-${field}`}
                                    className="block text-[11px] uppercase tracking-widest mb-1.5"
                                    style={{ color: 'var(--ash)' }}
                                >
                                    {LABELS_ALUMNO[field]}
                                    {field !== 'cedula_escolar' && <span className="text-red-500"> *</span>}
                                </label>
                                <input
                                    id={`alu-${field}`}
                                    type="text"
                                    name={field}
                                    className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                                    style={{
                                        border: `0.5px solid ${errores[field] ? '#f87171' : 'var(--border-md)'}`,
                                        background: 'var(--porcelain)',
                                        color: 'var(--jet)',
                                    }}
                                    value={datos.alumno[field] || ''}
                                    onChange={handleNewAlumnoChange}
                                    aria-invalid={!!errores[field]}
                                />
                                {errores[field] && (
                                    <p className="text-[10px] mt-1 text-red-500">{errores[field]}</p>
                                )}
                            </div>
                        ))}

                        <div>
                            <label
                                htmlFor="alu-fecha_nacimiento"
                                className="block text-[11px] uppercase tracking-widest mb-1.5"
                                style={{ color: 'var(--ash)' }}
                            >
                                Fecha de Nacimiento <span className="text-red-500">*</span>
                            </label>
                            <DatePickerES
                                name="fecha_nacimiento"
                                className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                                style={{
                                    border: `0.5px solid ${errores.fecha_nacimiento ? '#f87171' : 'var(--border-md)'}`,
                                    background: 'var(--porcelain)',
                                    color: 'var(--jet)',
                                }}
                                value={datos.alumno.fecha_nacimiento || ''}
                                onChange={handleNewAlumnoChange}
                            />
                            {errores.fecha_nacimiento && (
                                <p className="text-[10px] mt-1 text-red-500">{errores.fecha_nacimiento}</p>
                            )}
                        </div>

                        <div>
                            <label
                                htmlFor="alu-genero"
                                className="block text-[11px] uppercase tracking-widest mb-1.5"
                                style={{ color: 'var(--ash)' }}
                            >
                                Género <span className="text-red-500">*</span>
                            </label>
                            <select
                                id="alu-genero"
                                name="genero"
                                className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                                style={{
                                    border:     `0.5px solid ${errores.genero ? '#f87171' : 'var(--border-md)'}`,
                                    background: 'var(--porcelain)',
                                    color:      'var(--jet)',
                                }}
                                value={datos.alumno.genero}
                                onChange={handleNewAlumnoChange}
                            >
                                <option value="masculino">Masculino</option>
                                <option value="femenino">Femenino</option>
                            </select>
                            {errores.genero && (
                                <p className="text-[10px] mt-1 text-red-500">{errores.genero}</p>
                            )}
                        </div>
                    </div>
                </div>
            )}

            <div className="flex justify-between items-center pt-6">
                <button
                    type="button"
                    onClick={onVolver}
                    className="flex items-center gap-2 text-sm font-medium"
                    style={{ color: 'var(--ash)' }}
                >
                    <ArrowLeft size={16} aria-hidden="true" /> Volver
                </button>
                <button
                    type="button"
                    disabled={!datos.alumno}
                    onClick={handleContinuar}
                    className="px-10 py-4 rounded-2xl text-sm font-medium text-white flex items-center gap-2 transition-all disabled:opacity-50"
                    style={{ background: 'var(--pb)' }}
                >
                    Continuar <ArrowRight size={16} aria-hidden="true" />
                </button>
            </div>
        </div>
    );
};
