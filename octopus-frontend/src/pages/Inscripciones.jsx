import React, { useState, useEffect, useCallback } from 'react';
import {
    User, UserPlus, GraduationCap, CheckCircle2, ArrowRight, ArrowLeft,
    FileText, AlertCircle, Loader2, Search, Check, Info, X
} from 'lucide-react';
import { format, parseISO, isValid } from 'date-fns';
import { es } from 'date-fns/locale';
import DatePickerES from '../components/DatePickerES';
import axiosInstance from '../api/apiClient';
import { toast } from 'react-toastify';

// --- HELPERS ---

const formatFecha = (fecha) => {
    if (!fecha) return '—';
    const parsed = parseISO(fecha);
    return isValid(parsed) ? format(parsed, "d 'de' MMMM 'de' yyyy", { locale: es }) : fecha;
};

// --- SUBCOMPONENTES INTERNOS ---

const BarraProgreso = ({ pasoActual }) => {
    const pasos = [
        { num: 1, label: 'Representante', icon: User },
        { num: 2, label: 'Alumno', icon: GraduationCap },
        { num: 3, label: 'Inscripción', icon: FileText },
        { num: 4, label: 'Confirmar', icon: CheckCircle2 }
    ];

    return (
        <nav aria-label="Progreso de inscripción" className="w-full max-w-4xl mx-auto mb-12">
            <div className="flex items-center justify-between relative">
                {/* Línea conectora de fondo */}
                <div className="absolute top-1/2 left-0 w-full h-0.5 -translate-y-1/2 z-0" style={{ background: 'var(--border-md)' }}></div>

                {/* Línea conectora activa */}
                <div
                    className="absolute top-1/2 left-0 h-0.5 -translate-y-1/2 z-0 transition-all duration-500"
                    style={{
                        background: 'var(--pb)',
                        width: `${((pasoActual - 1) / (pasos.length - 1)) * 100}%`
                    }}
                ></div>

                {pasos.map((p) => {
                    const isActivo = pasoActual === p.num;
                    const isCompletado = pasoActual > p.num;

                    return (
                        <div
                            key={p.num}
                            className="relative z-10 flex flex-col items-center"
                            aria-current={isActivo ? 'step' : undefined}
                        >
                            <div
                                className={`w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300 ${isActivo ? 'scale-110 shadow-lg' : ''}`}
                                style={{
                                    background: isCompletado ? 'var(--pb-light)' : (isActivo ? 'var(--pb)' : 'var(--porcelain)'),
                                    border: isActivo ? 'none' : '2px solid var(--border-md)',
                                    color: isCompletado || isActivo ? (isActivo ? 'var(--pb)' : '#fff') : 'var(--ash)'
                                }}
                            >
                                {isCompletado ? <Check size={18} /> : <p.icon size={18} />}
                            </div>
                            {/* Oculto en pantallas muy pequeñas para evitar superposición */}
                            <span
                                className="hidden sm:block absolute -bottom-7 text-[10px] uppercase tracking-widest whitespace-nowrap font-black"
                                style={{ color: isActivo ? 'var(--jet)' : 'var(--ash)' }}
                            >
                                {p.label}
                            </span>
                        </div>
                    );
                })}
            </div>
        </nav>
    );
};

const LABELS_REP = {
    nombre: 'Nombre',
    apellido: 'Apellido',
    telefono: 'Teléfono',
    correo: 'Correo electrónico',
};

const PasoRepresentante = ({ datos, setDatos, onContinuar }) => {
    const [loading, setLoading] = useState(false);
    const [repBuscado, setRepBuscado] = useState(false);
    const [cedulaInput, setCedulaInput] = useState(datos.representante?.cedula || '');

    // Debounce: busca cuando la cédula supera 6 caracteres
    useEffect(() => {
        if (cedulaInput.length <= 6) return;
        const timeoutId = setTimeout(async () => {
            setLoading(true);
            try {
                const res = await axiosInstance.get(`secretaria/representante/${cedulaInput}/`);
                if (res.data.existe) {
                    setDatos(prev => ({
                        ...prev,
                        representante: res.data,
                        esRepresentanteNuevo: false,
                    }));
                } else {
                    setDatos(prev => ({
                        ...prev,
                        representante: { ...prev.representante, cedula: cedulaInput, nombre: '', apellido: '', telefono: '', correo: '', direccion: '' },
                        esRepresentanteNuevo: true,
                    }));
                }
                setRepBuscado(true);
            } catch {
                toast.error("Error al consultar representante");
            } finally {
                setLoading(false);
            }
        }, 600);
        return () => clearTimeout(timeoutId);
    }, [cedulaInput]); // eslint-disable-line react-hooks/exhaustive-deps

    const handleFormChange = (e) => {
        const { name, value } = e.target;
        setDatos(prev => ({
            ...prev,
            representante: { ...prev.representante, [name]: value }
        }));
    };

    const esValido = () => {
        const r = datos.representante;
        if (!r?.cedula) return false;
        if (datos.esRepresentanteNuevo) {
            return r.nombre && r.apellido && r.telefono && r.correo && r.direccion;
        }
        return true;
    };

    return (
        <div className="space-y-8 animate-fadeIn">
            <div className="max-w-md mx-auto text-center">
                <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>Documento de Identidad</label>
                <div className="relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2" style={{ color: 'var(--ash)' }} size={20} />
                    <input
                        type="text"
                        placeholder="V-12345678"
                        className="w-full pl-12 pr-4 py-4 rounded-2xl text-lg font-bold outline-none transition-all"
                        style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)', color: 'var(--jet)' }}
                        value={cedulaInput}
                        onChange={(e) => setCedulaInput(e.target.value)}
                    />
                    {loading && <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 animate-spin" size={20} style={{ color: 'var(--pb)' }} />}
                </div>
            </div>

            {repBuscado && !loading && (
                <div className="max-w-2xl mx-auto">
                    {datos.esRepresentanteNuevo ? (
                        <div className="p-8 rounded-2xl space-y-6" style={{ background: 'var(--porcelain)', border: '0.5px solid var(--border-md)' }}>
                            <div className="flex justify-between items-center">
                                <h3 className="text-sm font-medium" style={{ color: 'var(--jet)' }}>Registrar Nuevo Representante</h3>
                                <span className="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-tighter" style={{ background: 'var(--pb-light)', color: 'var(--pb)' }}>Nuevo</span>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {['nombre', 'apellido', 'telefono', 'correo'].map(field => (
                                    <div key={field}>
                                        <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>
                                            {LABELS_REP[field]}
                                        </label>
                                        <input
                                            name={field}
                                            className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                                            style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)', color: 'var(--jet)' }}
                                            value={datos.representante[field] || ''}
                                            onChange={handleFormChange}
                                        />
                                    </div>
                                ))}
                                <div className="md:col-span-2">
                                    <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>Dirección de habitación</label>
                                    <textarea
                                        name="direccion"
                                        rows="2"
                                        className="w-full p-3 rounded-xl text-sm outline-none resize-none"
                                        style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)', color: 'var(--jet)' }}
                                        value={datos.representante.direccion || ''}
                                        onChange={handleFormChange}
                                    />
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="p-8 rounded-2xl flex items-center justify-between" style={{ background: 'var(--porcelain)', border: '0.5px solid var(--border-md)' }}>
                            <div className="flex items-center gap-4">
                                <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: 'var(--pb-light)', color: 'var(--pb)' }}>
                                    <CheckCircle2 size={32} />
                                </div>
                                <div>
                                    <p className="font-medium text-lg leading-tight" style={{ color: 'var(--jet)' }}>{datos.representante.nombre} {datos.representante.apellido}</p>
                                    <p className="text-xs mt-1" style={{ color: 'var(--ash)' }}>{datos.representante.cedula} · {datos.representante.telefono}</p>
                                </div>
                            </div>
                            <span className="px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest" style={{ background: 'var(--pb-light)', color: 'var(--pb)' }}>Registrado</span>
                        </div>
                    )}

                    <div className="flex justify-end mt-8">
                        <button
                            disabled={!esValido()}
                            onClick={onContinuar}
                            className="px-10 py-4 rounded-2xl text-sm font-medium text-white flex items-center gap-2 transition-all disabled:opacity-50"
                            style={{ background: 'var(--pb)' }}
                        >
                            Continuar <ArrowRight size={16} />
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

const LABELS_ALUMNO = {
    nombre: 'Nombre',
    apellido: 'Apellido',
    cedula_escolar: 'Cédula Escolar',
};

const SkeletonCard = () => (
    <div className="p-6 rounded-2xl animate-pulse" style={{ background: 'var(--porcelain)', border: '0.5px solid var(--border-md)' }}>
        <div className="h-4 w-3/4 rounded-lg mb-2" style={{ background: 'var(--border-md)' }} />
        <div className="h-3 w-1/2 rounded-lg mb-4" style={{ background: 'var(--border-md)' }} />
        <div className="h-3 w-1/4 rounded-md" style={{ background: 'var(--border-md)' }} />
    </div>
);

const PasoAlumno = ({ datos, setDatos, onContinuar, onVolver }) => {
    const [alumnos, setAlumnos] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showFormNuevo, setShowFormNuevo] = useState(false);

    const fetchAlumnos = useCallback(async () => {
        setLoading(true);
        try {
            const res = await axiosInstance.get(`secretaria/alumnos/?buscar=${datos.representante.cedula}`);
            setAlumnos(res.data || []);
        } catch {
            toast.error("Error al cargar alumnos vinculados");
        } finally {
            setLoading(false);
        }
    }, [datos.representante.cedula]);

    useEffect(() => { fetchAlumnos(); }, [fetchAlumnos]);

    const handleNewAlumnoChange = (e) => {
        const { name, value } = e.target;
        setDatos(prev => ({
            ...prev,
            alumno: { ...prev.alumno, [name]: value }
        }));
    };

    const handleSelectExistente = (alu) => {
        setDatos(prev => ({ ...prev, alumno: alu, esAlumnoNuevo: false }));
        setShowFormNuevo(false);
    };

    const handleActivarNuevo = () => {
        setDatos(prev => ({ ...prev, alumno: { nombre: '', apellido: '', cedula_escolar: '', fecha_nacimiento: '', genero: 'masculino' }, esAlumnoNuevo: true }));
        setShowFormNuevo(true);
    };

    const esValido = () => {
        if (!datos.alumno) return false;
        if (datos.esAlumnoNuevo) {
            return datos.alumno.nombre && datos.alumno.apellido && datos.alumno.fecha_nacimiento && datos.alumno.genero;
        }
        return true;
    };

    return (
        <div className="max-w-4xl mx-auto space-y-8 animate-fadeIn">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div
                    onClick={handleActivarNuevo}
                    className="p-6 rounded-2xl border-2 border-dashed flex flex-col items-center justify-center text-center gap-3 cursor-pointer transition-all"
                    style={{ borderColor: showFormNuevo ? 'var(--pb)' : 'var(--border-md)', background: showFormNuevo ? 'var(--pb-light)' : 'transparent' }}
                >
                    <UserPlus size={32} style={{ color: 'var(--pb)' }} />
                    <p className="text-xs font-medium uppercase tracking-widest" style={{ color: 'var(--pb)' }}>Inscribir alumno nuevo</p>
                </div>

                {loading ? (
                    Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)
                ) : alumnos.map(alu => {
                    const isSelected = datos.alumno?.id === alu.id && !showFormNuevo;
                    const yaInscrito = alu.estado_inscripcion === 'inscrito';
                    return (
                        <div
                            key={alu.id}
                            onClick={() => !yaInscrito && handleSelectExistente(alu)}
                            className={`p-6 rounded-2xl transition-all relative overflow-hidden ${yaInscrito ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                            style={{
                                border: isSelected ? '2px solid var(--pb)' : '0.5px solid var(--border-md)',
                                background: isSelected ? 'var(--pb-light)' : 'var(--porcelain)'
                            }}
                        >
                            <p className="font-medium" style={{ color: 'var(--jet)' }}>{alu.nombre} {alu.apellido}</p>
                            <p className="text-[10px] font-mono mt-1" style={{ color: 'var(--ash)' }}>{alu.cedula_escolar || 'Sin Cédula Escolar'}</p>
                            <div className="mt-4 flex items-center justify-between">
                                <span className="text-[10px] px-2 py-0.5 rounded-md" style={{ background: 'var(--border)', color: 'var(--ash)' }}>
                                    {(alu.grado_seccion || 'No inscrito').split(' - ')[0]}
                                </span>
                                {yaInscrito && (
                                    <span className="flex items-center gap-1 text-[10px] font-medium text-amber-600">
                                        <AlertCircle size={12} /> Ya inscrito
                                    </span>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            {showFormNuevo && (
                <div className="p-8 rounded-2xl space-y-6 animate-fadeIn" style={{ background: 'var(--porcelain)', border: '0.5px solid var(--border-md)' }}>
                    <h3 className="text-sm font-medium" style={{ color: 'var(--jet)' }}>Datos del Nuevo Estudiante</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {['nombre', 'apellido', 'cedula_escolar'].map(field => (
                            <div key={field}>
                                <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>
                                    {LABELS_ALUMNO[field]}
                                </label>
                                <input
                                    name={field}
                                    className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                                    style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)', color: 'var(--jet)' }}
                                    value={datos.alumno[field] || ''}
                                    onChange={handleNewAlumnoChange}
                                />
                            </div>
                        ))}
                        <div>
                            <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>Fecha de Nacimiento</label>
                            <DatePickerES
                                name="fecha_nacimiento"
                                className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                                style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)', color: 'var(--jet)' }}
                                value={datos.alumno.fecha_nacimiento || ''}
                                onChange={handleNewAlumnoChange}
                            />
                        </div>
                        <div>
                            <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>Género</label>
                            <select
                                name="genero"
                                className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                                style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)', color: 'var(--jet)' }}
                                value={datos.alumno.genero}
                                onChange={handleNewAlumnoChange}
                            >
                                <option value="masculino">Masculino</option>
                                <option value="femenino">Femenino</option>
                            </select>
                        </div>
                    </div>
                </div>
            )}

            <div className="flex justify-between items-center pt-6">
                <button onClick={onVolver} className="flex items-center gap-2 text-sm font-medium" style={{ color: 'var(--ash)' }}>
                    <ArrowLeft size={16} /> Volver
                </button>
                <button
                    disabled={!esValido()}
                    onClick={onContinuar}
                    className="px-10 py-4 rounded-2xl text-sm font-medium text-white flex items-center gap-2 transition-all disabled:opacity-50"
                    style={{ background: 'var(--pb)' }}
                >
                    Continuar <ArrowRight size={16} />
                </button>
            </div>
        </div>
    );
};

const SkeletonGrado = () => (
    <div className="p-5 rounded-2xl animate-pulse" style={{ background: 'var(--porcelain)', border: '0.5px solid var(--border-md)' }}>
        <div className="h-4 w-2/3 rounded-lg mb-3" style={{ background: 'var(--border-md)' }} />
        <div className="h-2 w-full rounded-full" style={{ background: 'var(--border-md)' }} />
    </div>
);

const PasoConfiguracion = ({ datos, setDatos, onContinuar, onVolver }) => {
    const [grados, setGrados] = useState([]);
    const [config, setConfig] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchInfo = async () => {
            try {
                const [resG, resC] = await Promise.all([
                    axiosInstance.get('secretaria/configuracion-grados/'),
                    axiosInstance.get('secretaria/configuracion/')
                ]);
                setGrados(resG.data || []);
                setConfig(resC.data);
                setDatos(prev => ({ ...prev, periodo_escolar: resC.data?.periodo_escolar_activo || '' }));
            } catch {
                toast.error("Error al cargar parámetros");
            } finally {
                setLoading(false);
            }
        };
        fetchInfo();
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const seleccionado = grados.find(g => g.grado_seccion === datos.grado_seccion);

    if (loading) return (
        <div className="max-w-5xl mx-auto space-y-10 animate-fadeIn">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-3">
                    {Array.from({ length: 6 }).map((_, i) => <SkeletonGrado key={i} />)}
                </div>
                <div className="p-8 rounded-2xl animate-pulse" style={{ background: 'var(--porcelain)', border: '0.5px solid var(--border-md)', height: '220px' }} />
            </div>
        </div>
    );

    return (
        <div className="max-w-5xl mx-auto space-y-10 animate-fadeIn">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 space-y-6">
                    <h3 className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>Seleccione Grado y Sección</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {grados.map(g => {
                            const lleno = g.cupos_disponibles <= 0;
                            const pct = (g.cupos_utilizados / g.cupos_maximos) * 100;
                            return (
                                <div
                                    key={g.id}
                                    onClick={() => !lleno && setDatos(prev => ({ ...prev, grado_seccion: g.grado_seccion }))}
                                    className={`p-5 rounded-2xl border transition-all relative ${lleno ? 'opacity-50 grayscale cursor-not-allowed' : 'cursor-pointer'}`}
                                    style={{
                                        border: datos.grado_seccion === g.grado_seccion ? '2px solid var(--pb)' : '0.5px solid var(--border-md)',
                                        background: datos.grado_seccion === g.grado_seccion ? 'var(--pb-light)' : 'var(--porcelain)'
                                    }}
                                >
                                    <div className="flex justify-between items-start mb-3">
                                        <p className="font-medium" style={{ color: 'var(--jet)' }}>{g.grado_seccion.split(' - ')[0]}</p>
                                        <span className={`text-[10px] font-black px-2 py-0.5 rounded-md uppercase ${lleno ? 'bg-red-50 text-red-600' : 'text-emerald-600 bg-emerald-50'}`}>
                                            {lleno ? 'Lleno' : `${g.cupos_disponibles} cupos`}
                                        </span>
                                    </div>
                                    <div className="w-full bg-slate-100 h-1 rounded-full overflow-hidden">
                                        <div className="h-full transition-all" style={{ width: `${pct}%`, background: lleno ? 'var(--red)' : 'var(--pb)' }}></div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                <div className="space-y-6">
                    <div className="p-8 rounded-2xl space-y-6" style={{ background: 'var(--porcelain)', border: '0.5px solid var(--border-md)' }}>
                        <h3 className="text-sm font-medium" style={{ color: 'var(--jet)' }}>Detalles de inscripción</h3>
                        <div className="space-y-4">
                            <div>
                                <label className="text-[11px] uppercase tracking-widest mb-1.5 block" style={{ color: 'var(--ash)' }}>Tipo de Ingreso</label>
                                <div className="flex gap-2">
                                    {['nuevo', 'regular'].map(t => (
                                        <button
                                            key={t}
                                            onClick={() => setDatos(prev => ({ ...prev, tipo_ingreso: t }))}
                                            className="flex-1 py-2 rounded-lg text-xs font-medium uppercase transition-all"
                                            style={{
                                                background: datos.tipo_ingreso === t ? 'var(--pb)' : 'var(--porcelain)',
                                                color: datos.tipo_ingreso === t ? '#fff' : 'var(--ash)',
                                                border: '0.5px solid var(--border-md)'
                                            }}
                                        >
                                            {t === 'nuevo' ? 'Nuevo' : 'Regular'}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div>
                                <label className="text-[11px] uppercase tracking-widest mb-1.5 block" style={{ color: 'var(--ash)' }}>Período Escolar</label>
                                <div className="px-3 py-2 rounded-lg text-sm font-medium" style={{ background: 'var(--porcelain)', color: 'var(--jet)', border: '0.5px solid var(--border-md)' }}>
                                    {config?.periodo_escolar_activo || 'Cargando...'}
                                </div>
                            </div>
                            <div className="flex items-center justify-between p-4 rounded-xl border" style={{ background: 'var(--porcelain)', borderColor: 'var(--border-md)' }}>
                                <span className="text-xs font-medium" style={{ color: 'var(--jet)' }}>Documentos completos</span>
                                <button
                                    role="switch"
                                    aria-checked={datos.documentos_completos}
                                    aria-label="Documentos completos"
                                    onClick={() => setDatos(prev => ({ ...prev, documentos_completos: !prev.documentos_completos }))}
                                    className="w-12 h-6 rounded-full transition-all relative"
                                    style={{ background: datos.documentos_completos ? 'var(--pb)' : 'var(--border-md)' }}
                                >
                                    <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${datos.documentos_completos ? 'right-1' : 'left-1'}`}></div>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="flex justify-between items-center pt-10">
                <button onClick={onVolver} className="flex items-center gap-2 text-sm font-medium" style={{ color: 'var(--ash)' }}>
                    <ArrowLeft size={16} /> Volver
                </button>
                <button
                    disabled={!datos.grado_seccion || seleccionado?.cupos_disponibles <= 0}
                    onClick={onContinuar}
                    className="px-10 py-4 rounded-2xl text-sm font-medium text-white flex items-center gap-2 transition-all disabled:opacity-50"
                    style={{ background: 'var(--pb)' }}
                >
                    Revisar Inscripción <ArrowRight size={16} />
                </button>
            </div>
        </div>
    );
};

const PasoConfirmacion = ({ datos, onContinuar, onVolver, cargando }) => {
    return (
        <div className="max-w-3xl mx-auto space-y-8 animate-fadeIn">
            <div className="rounded-2xl border overflow-hidden shadow-sm" style={{ background: 'var(--porcelain)', borderColor: 'var(--border-md)' }}>
                <div className="p-8 text-white flex justify-between items-center" style={{ background: 'var(--pb)' }}>
                    <div>
                        <h2 className="text-xl font-medium tracking-tight">Confirmar Registro</h2>
                        <p className="text-xs mt-1 opacity-90">Verifique los datos antes de proceder con la matrícula</p>
                    </div>
                    <Info size={32} className="opacity-40" />
                </div>

                <div className="p-8 space-y-8">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <section className="space-y-3">
                            <h4 className="text-[11px] uppercase tracking-widest pb-1.5 border-b" style={{ color: 'var(--ash)', borderColor: 'var(--border-md)' }}>Representante</h4>
                            <p className="text-sm font-medium" style={{ color: 'var(--jet)' }}>{datos.representante?.nombre} {datos.representante?.apellido}</p>
                            <p className="text-xs" style={{ color: 'var(--ash)' }}>Cédula: {datos.representante?.cedula}</p>
                            <p className="text-xs" style={{ color: 'var(--ash)' }}>Teléfono: {datos.representante?.telefono}</p>
                        </section>
                        <section className="space-y-3">
                            <h4 className="text-[11px] uppercase tracking-widest pb-1.5 border-b" style={{ color: 'var(--ash)', borderColor: 'var(--border-md)' }}>Estudiante</h4>
                            <p className="text-sm font-medium" style={{ color: 'var(--jet)' }}>{datos.alumno?.nombre} {datos.alumno?.apellido}</p>
                            <p className="text-xs" style={{ color: 'var(--ash)' }}>
                                F. Nacimiento: {formatFecha(datos.alumno?.fecha_nacimiento)}
                            </p>
                            <p className="text-xs" style={{ color: 'var(--ash)' }}>Género: {datos.alumno?.genero}</p>
                        </section>
                        <section className="md:col-span-2 p-5 rounded-xl flex items-center justify-between" style={{ background: 'var(--pb-light)', border: '0.5px solid var(--border-md)' }}>
                            <div>
                                <h4 className="text-[10px] font-black uppercase tracking-widest mb-1" style={{ color: 'var(--pb)' }}>Cupo Asignado</h4>
                                <p className="text-lg font-medium" style={{ color: 'var(--jet)' }}>{datos.grado_seccion?.split(' - ')[0]}</p>
                            </div>
                            <div className="text-right">
                                <p className="text-[10px] font-black uppercase" style={{ color: 'var(--ash)' }}>Periodo</p>
                                <p className="text-sm font-medium" style={{ color: 'var(--pb)' }}>{datos.periodo_escolar}</p>
                            </div>
                        </section>
                    </div>

                    <div className="flex flex-col gap-3 pt-4">
                        <button
                            disabled={cargando}
                            onClick={onContinuar}
                            className="w-full py-3.5 rounded-xl text-sm font-medium text-white flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                            style={{ background: 'var(--pb)' }}
                        >
                            {cargando ? <Loader2 className="animate-spin" size={16} /> : <Check size={16} />}
                            Confirmar e Inscribir
                        </button>
                        <button onClick={onVolver} className="w-full py-2.5 text-sm font-medium transition-colors" style={{ color: 'var(--ash)' }}>
                            Volver a editar datos
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

const PantallaExito = ({ alumno, grado, onReiniciar, onDescargar }) => {
    const [descargando, setDescargando] = useState(false);

    const handleDescargar = async () => {
        setDescargando(true);
        try {
            await onDescargar();
        } finally {
            setDescargando(false);
        }
    };

    return (
        <div className="max-w-md mx-auto py-16 text-center space-y-6 animate-fadeIn">
            <div className="w-20 h-20 rounded-2xl flex items-center justify-center mx-auto" style={{ background: 'var(--pb-light)', color: 'var(--pb)' }}>
                <CheckCircle2 size={48} />
            </div>
            <div>
                <h2 className="text-2xl font-medium tracking-tight" style={{ color: 'var(--jet)' }}>¡Inscripción Exitosa!</h2>
                <p className="mt-2 text-sm" style={{ color: 'var(--ash)' }}>
                    El estudiante <span className="font-medium" style={{ color: 'var(--jet)' }}>{alumno}</span> ha sido registrado correctamente en <span className="font-medium" style={{ color: 'var(--jet)' }}>{grado.split(' - ')[0]}</span>.
                </p>
            </div>
            <div className="flex flex-col gap-2 pt-4">
                <button
                    disabled={descargando}
                    onClick={handleDescargar}
                    className="w-full py-3 rounded-xl text-sm font-medium text-white flex items-center justify-center gap-2 transition-all disabled:opacity-70"
                    style={{ background: 'var(--pb)' }}
                >
                    {descargando
                        ? <><Loader2 className="animate-spin" size={16} /> Generando comprobante...</>
                        : <><FileText size={16} /> Ver Comprobante PDF</>
                    }
                </button>
                <button
                    onClick={onReiniciar}
                    className="w-full py-3 rounded-xl text-sm font-medium transition-all"
                    style={{ background: 'var(--porcelain)', border: '0.5px solid var(--border-md)', color: 'var(--ash)' }}
                >
                    Nueva Inscripción
                </button>
            </div>
        </div>
    );
};

// --- COMPONENTE PRINCIPAL ---

const ESTADO_INICIAL = {
    representante: null,
    esRepresentanteNuevo: false,
    alumno: null,
    esAlumnoNuevo: false,
    grado_seccion: '',
    tipo_ingreso: 'nuevo',
    documentos_completos: false,
    periodo_escolar: '',
    inscripcion_id: null,
};

const Inscripciones = () => {
    const [paso, setPaso] = useState(1);
    const [loading, setLoading] = useState(false);
    const [exito, setExito] = useState(false);
    const [datos, setDatos] = useState(ESTADO_INICIAL);

    const descargarPDF = async (id) => {
        const targetId = id || datos.inscripcion_id;
        if (!targetId) {
            toast.error("No se encontró el ID de la inscripción.");
            return;
        }
        try {
            const res = await axiosInstance.get(
                `secretaria/inscripciones/${targetId}/comprobante/`,
                { responseType: 'blob' }
            );
            const blob = new Blob([res.data], { type: 'application/pdf' });
            const url = URL.createObjectURL(blob);
            const newTab = window.open(url, '_blank', 'noopener,noreferrer');
            if (!newTab || newTab.closed || typeof newTab.closed === 'undefined') {
                // Fallback: descarga directa si el popup fue bloqueado
                const a = Object.assign(document.createElement('a'), {
                    href: url, download: `comprobante_inscripcion_${targetId}.pdf`,
                });
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
            }
            setTimeout(() => URL.revokeObjectURL(url), 60000);
        } catch (err) {
            const status = err.response?.status;
            if (status === 404) {
                toast.error("Comprobante no encontrado. Intenta descargarlo desde el historial.");
            } else {
                toast.error("No se pudo generar el comprobante PDF. Intenta nuevamente.");
            }
        }
    };

    const handleConfirmar = async () => {
        setLoading(true);
        try {
            const payload = {
                alumno: {
                    ...datos.alumno,
                    representante: { ...datos.representante },
                },
                grado_seccion: datos.grado_seccion,
                tipo_ingreso: datos.tipo_ingreso,
                periodo_escolar: datos.periodo_escolar,
                documentos_completos: datos.documentos_completos
            };

            const res = await axiosInstance.post('secretaria/inscripcion-nueva/', payload);

            if (res.status === 201) {
                setDatos(prev => ({ ...prev, inscripcion_id: res.data.inscripcion_id }));
                setExito(true);
            }
        } catch (err) {
            const msg = err.response?.data?.error || err.response?.data?.detail || 'Error al procesar inscripción';
            toast.error(msg);
        } finally {
            setLoading(false);
        }
    };

    const reiniciar = () => {
        setPaso(1);
        setExito(false);
        setDatos(ESTADO_INICIAL);
    };

    return (
        <div className="min-h-screen pb-20 animate-fadeIn">
            <div className="max-w-6xl mx-auto px-4">
                {!exito && (
                    <header className="mb-12 text-center">
                        <h2 className="text-lg font-medium" style={{ color: 'var(--jet)' }}>Admisión Octopus</h2>
                        <p className="text-sm mt-1" style={{ color: 'var(--ash)' }}>Módulo de control de matriculación y nuevos ingresos</p>
                    </header>
                )}

                {!exito && <BarraProgreso pasoActual={paso} />}

                <div className="mt-10">
                    {exito ? (
                        <PantallaExito
                            alumno={`${datos.alumno?.nombre} ${datos.alumno?.apellido}`}
                            grado={datos.grado_seccion}
                            onReiniciar={reiniciar}
                            onDescargar={() => descargarPDF(datos.inscripcion_id)}
                        />
                    ) : (
                        <>
                            {paso === 1 && (
                                <PasoRepresentante
                                    datos={datos}
                                    setDatos={setDatos}
                                    onContinuar={() => setPaso(2)}
                                />
                            )}
                            {paso === 2 && (
                                <PasoAlumno
                                    datos={datos}
                                    setDatos={setDatos}
                                    onContinuar={() => setPaso(3)}
                                    onVolver={() => setPaso(1)}
                                />
                            )}
                            {paso === 3 && (
                                <PasoConfiguracion
                                    datos={datos}
                                    setDatos={setDatos}
                                    onContinuar={() => setPaso(4)}
                                    onVolver={() => setPaso(2)}
                                />
                            )}
                            {paso === 4 && (
                                <PasoConfirmacion
                                    datos={datos}
                                    cargando={loading}
                                    onContinuar={handleConfirmar}
                                    onVolver={() => setPaso(3)}
                                />
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

export default Inscripciones;
