import React, { useState, useEffect } from 'react';
import { Search, Loader2, CheckCircle2, ArrowRight, AlertCircle } from 'lucide-react';
import { toast } from 'react-toastify';
import { buscarRepresentante } from '../../api/inscripciones.service';
import ModalCompletarRepresentante from './ModalCompletarRepresentante';
import { camposFaltantesRepresentante } from '../../utils/inscripcionValidacion';

const LABELS = {
    nombre:   'Nombre',
    apellido: 'Apellido',
    telefono: 'Teléfono',
    correo:   'Correo electrónico',
};

const INPUT_TYPES = {
    nombre:   'text',
    apellido: 'text',
    telefono: 'tel',
    correo:   'email',
};

const AUTOCOMPLETE = {
    nombre:   'given-name',
    apellido: 'family-name',
    telefono: 'tel',
    correo:   'email',
};

const PARENTESCO_OPTIONS = [
    { value: 'padre', label: 'Padre' },
    { value: 'madre', label: 'Madre' },
    { value: 'tutor', label: 'Tutor' },
    { value: 'otro',  label: 'Otro' },
];

export const PasoRepresentante = ({ datos, setDatos, onContinuar }) => {
    const [loading,      setLoading]      = useState(false);
    const [repBuscado,   setRepBuscado]   = useState(false);
    const [cedulaInput,  setCedulaInput]  = useState(datos.representante?.cedula || '');
    const [errores,      setErrores]      = useState({});
    const [modalCompletar, setModalCompletar] = useState(false);

    // Debounce con AbortController — evita race condition entre requests en vuelo
    useEffect(() => {
        setRepBuscado(false);
        if (cedulaInput.length <= 6) return;

        const controller = new AbortController();
        const timeoutId  = setTimeout(async () => {
            setLoading(true);
            try {
                const res = await buscarRepresentante(cedulaInput, controller.signal);
                if (res.data.existe) {
                    setDatos(prev => ({
                        ...prev,
                        representante:       res.data,
                        esRepresentanteNuevo: false,
                    }));
                    if (camposFaltantesRepresentante(res.data).length > 0) setModalCompletar(true);
                } else {
                    setDatos(prev => ({
                        ...prev,
                        representante: {
                            cedula: cedulaInput, nombre: '', apellido: '',
                            telefono: '', correo: '', direccion: '',
                            parentesco: '', nacionalidad: '', nivel_estudio: '',
                        },
                        esRepresentanteNuevo: true,
                    }));
                }
                setRepBuscado(true);
            } catch (err) {
                if (err.name !== 'CanceledError') toast.error('Error al consultar representante');
            } finally {
                setLoading(false);
            }
        }, 600);

        return () => {
            clearTimeout(timeoutId);
            controller.abort();
        };
    }, [cedulaInput, setDatos]);

    const handleFormChange = (e) => {
        const { name, value } = e.target;
        setDatos(prev => ({
            ...prev,
            representante: { ...prev.representante, [name]: value },
        }));
        if (errores[name]) setErrores(prev => ({ ...prev, [name]: '' }));
    };

    const handleContinuar = () => {
        const r    = datos.representante;
        const errs = {};

        if (!r?.cedula) errs.cedula = 'Requerido';
        if (datos.esRepresentanteNuevo) {
            if (!r.nombre?.trim())   errs.nombre   = 'Requerido';
            if (!r.apellido?.trim()) errs.apellido = 'Requerido';
            if (!r.telefono?.trim()) errs.telefono = 'Requerido';
            if (!r.correo?.trim()) {
                errs.correo = 'Requerido';
            } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.correo)) {
                errs.correo = 'Correo inválido';
            }
            if (!r.direccion?.trim()) errs.direccion = 'Requerido';
        }

        if (Object.keys(errs).length > 0) {
            setErrores(errs);
            return;
        }

        if (!datos.esRepresentanteNuevo && camposFaltantesRepresentante(r).length > 0) {
            setModalCompletar(true);
            return;
        }

        onContinuar();
    };

    return (
        <div className="space-y-8 animate-fadeIn">
            <div className="max-w-md mx-auto text-center">
                <label
                    htmlFor="cedula-search"
                    className="block text-[11px] uppercase tracking-widest mb-1.5"
                    style={{ color: 'var(--ash)' }}
                >
                    Documento de Identidad
                </label>
                <div className="relative">
                    <Search
                        className="absolute left-4 top-1/2 -translate-y-1/2"
                        style={{ color: 'var(--ash)' }}
                        size={20}
                        aria-hidden="true"
                    />
                    <input
                        id="cedula-search"
                        type="text"
                        inputMode="text"
                        placeholder="V-12345678"
                        autoComplete="off"
                        className="w-full pl-12 pr-4 py-4 rounded-2xl text-lg font-bold outline-none transition-all"
                        style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)', color: 'var(--jet)' }}
                        value={cedulaInput}
                        onChange={(e) => setCedulaInput(e.target.value)}
                        aria-busy={loading}
                    />
                    {loading && (
                        <Loader2
                            className="absolute right-4 top-1/2 -translate-y-1/2 animate-spin"
                            size={20}
                            style={{ color: 'var(--pb)' }}
                            aria-label="Buscando representante…"
                        />
                    )}
                </div>
            </div>

            {repBuscado && !loading && (
                <div className="max-w-2xl mx-auto">
                    {datos.esRepresentanteNuevo ? (
                        <div
                            className="p-8 rounded-2xl space-y-6"
                            style={{ background: 'var(--porcelain)', border: '0.5px solid var(--border-md)' }}
                        >
                            <div className="flex justify-between items-center">
                                <h3 className="text-sm font-medium" style={{ color: 'var(--jet)' }}>
                                    Registrar Nuevo Representante
                                </h3>
                                <span
                                    className="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-tighter"
                                    style={{ background: 'var(--pb-light)', color: 'var(--pb)' }}
                                >
                                    Nuevo
                                </span>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {['nombre', 'apellido', 'telefono', 'correo'].map(field => (
                                    <div key={field}>
                                        <label
                                            htmlFor={`rep-${field}`}
                                            className="block text-[11px] uppercase tracking-widest mb-1.5"
                                            style={{ color: 'var(--ash)' }}
                                        >
                                            {LABELS[field]} <span className="text-red-500">*</span>
                                        </label>
                                        <input
                                            id={`rep-${field}`}
                                            type={INPUT_TYPES[field]}
                                            name={field}
                                            autoComplete={AUTOCOMPLETE[field]}
                                            className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                                            style={{
                                                border: `0.5px solid ${errores[field] ? '#f87171' : 'var(--border-md)'}`,
                                                background: 'var(--porcelain)',
                                                color: 'var(--jet)',
                                            }}
                                            value={datos.representante[field] || ''}
                                            onChange={handleFormChange}
                                            aria-invalid={!!errores[field]}
                                            aria-describedby={errores[field] ? `err-${field}` : undefined}
                                        />
                                        {errores[field] && (
                                            <p id={`err-${field}`} className="text-[10px] mt-1 text-red-500">
                                                {errores[field]}
                                            </p>
                                        )}
                                    </div>
                                ))}

                                <div>
                                    <label
                                        htmlFor="rep-parentesco"
                                        className="block text-[11px] uppercase tracking-widest mb-1.5"
                                        style={{ color: 'var(--ash)' }}
                                    >
                                        Parentesco
                                    </label>
                                    <select
                                        id="rep-parentesco"
                                        name="parentesco"
                                        className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                                        style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)', color: 'var(--jet)' }}
                                        value={datos.representante.parentesco || ''}
                                        onChange={handleFormChange}
                                    >
                                        <option value="">Seleccionar…</option>
                                        {PARENTESCO_OPTIONS.map(opt => (
                                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                                        ))}
                                    </select>
                                </div>

                                <div>
                                    <label
                                        htmlFor="rep-nacionalidad"
                                        className="block text-[11px] uppercase tracking-widest mb-1.5"
                                        style={{ color: 'var(--ash)' }}
                                    >
                                        Nacionalidad
                                    </label>
                                    <input
                                        id="rep-nacionalidad"
                                        type="text"
                                        name="nacionalidad"
                                        autoComplete="off"
                                        className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                                        style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)', color: 'var(--jet)' }}
                                        value={datos.representante.nacionalidad || ''}
                                        onChange={handleFormChange}
                                    />
                                </div>

                                <div className="md:col-span-2">
                                    <label
                                        htmlFor="rep-nivel_estudio"
                                        className="block text-[11px] uppercase tracking-widest mb-1.5"
                                        style={{ color: 'var(--ash)' }}
                                    >
                                        Nivel de estudio
                                    </label>
                                    <input
                                        id="rep-nivel_estudio"
                                        type="text"
                                        name="nivel_estudio"
                                        autoComplete="off"
                                        className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                                        style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)', color: 'var(--jet)' }}
                                        value={datos.representante.nivel_estudio || ''}
                                        onChange={handleFormChange}
                                    />
                                </div>

                                <div className="md:col-span-2">
                                    <label
                                        htmlFor="rep-direccion"
                                        className="block text-[11px] uppercase tracking-widest mb-1.5"
                                        style={{ color: 'var(--ash)' }}
                                    >
                                        Dirección de habitación <span className="text-red-500">*</span>
                                    </label>
                                    <textarea
                                        id="rep-direccion"
                                        name="direccion"
                                        rows="2"
                                        className="w-full p-3 rounded-xl text-sm outline-none resize-none"
                                        style={{
                                            border: `0.5px solid ${errores.direccion ? '#f87171' : 'var(--border-md)'}`,
                                            background: 'var(--porcelain)',
                                            color: 'var(--jet)',
                                        }}
                                        value={datos.representante.direccion || ''}
                                        onChange={handleFormChange}
                                        aria-invalid={!!errores.direccion}
                                    />
                                    {errores.direccion && (
                                        <p className="text-[10px] mt-1 text-red-500">{errores.direccion}</p>
                                    )}
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <div
                                className="p-8 rounded-2xl flex items-center justify-between"
                                style={{ background: 'var(--porcelain)', border: '0.5px solid var(--border-md)' }}
                            >
                                <div className="flex items-center gap-4">
                                    <div
                                        className="w-14 h-14 rounded-2xl flex items-center justify-center"
                                        style={{ background: 'var(--pb-light)', color: 'var(--pb)' }}
                                    >
                                        <CheckCircle2 size={32} aria-hidden="true" />
                                    </div>
                                    <div>
                                        <p className="font-medium text-lg leading-tight" style={{ color: 'var(--jet)' }}>
                                            {datos.representante.nombre} {datos.representante.apellido}
                                        </p>
                                        <p className="text-xs mt-1" style={{ color: 'var(--ash)' }}>
                                            {datos.representante.cedula} · {datos.representante.telefono}
                                        </p>
                                    </div>
                                </div>
                                <span
                                    className="px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest"
                                    style={{ background: 'var(--pb-light)', color: 'var(--pb)' }}
                                >
                                    Registrado
                                </span>
                            </div>

                            {camposFaltantesRepresentante(datos.representante).length > 0 && (
                                <div
                                    className="p-4 rounded-2xl flex items-center justify-between gap-4 flex-wrap"
                                    style={{ background: '#fef2f2', border: '0.5px solid #fecaca' }}
                                >
                                    <div className="flex items-center gap-2 text-sm" style={{ color: '#b91c1c' }}>
                                        <AlertCircle size={18} aria-hidden="true" />
                                        <span>Este representante tiene datos obligatorios pendientes por completar.</span>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setModalCompletar(true)}
                                        className="px-4 py-2 rounded-xl text-xs font-bold text-white"
                                        style={{ background: '#b91c1c' }}
                                    >
                                        Completar datos
                                    </button>
                                </div>
                            )}
                        </div>
                    )}

                    {modalCompletar && datos.representante && (
                        <ModalCompletarRepresentante
                            representante={datos.representante}
                            onClose={() => setModalCompletar(false)}
                            onGuardar={(repActualizado) => {
                                setDatos(prev => ({ ...prev, representante: repActualizado }));
                                setModalCompletar(false);
                                toast.success('Datos del representante actualizados.');
                            }}
                        />
                    )}

                    <div className="flex justify-end mt-8">
                        <button
                            type="button"
                            onClick={handleContinuar}
                            className="px-10 py-4 rounded-2xl text-sm font-medium text-white flex items-center gap-2 transition-all"
                            style={{ background: 'var(--pb)' }}
                        >
                            Continuar <ArrowRight size={16} aria-hidden="true" />
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};
