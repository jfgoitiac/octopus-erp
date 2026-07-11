import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { UserPlus, ArrowRight, ArrowLeft, AlertCircle, X, Camera } from 'lucide-react';
import { toast } from 'react-toastify';
import { parse, format, isValid, differenceInYears } from 'date-fns';
import SmartDateInput from '../SmartDateInput';
import { fetchAlumnosPorRepresentante } from '../../api/inscripciones.service';
import { SkeletonCard } from './SkeletonCard';
import ModalCompletarAlumno from './ModalCompletarAlumno';
import { camposFaltantesAlumno, contactoEmergenciaDesdeRepresentante } from '../../utils/inscripcionValidacion';

const TIPOS_FOTO_PERMITIDOS = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_BYTES_FOTO = 5 * 1024 * 1024; // 5 MB

function parseISODate(str) {
    if (!str) return null;
    const parsed = parse(str, 'yyyy-MM-dd', new Date());
    return isValid(parsed) ? parsed : null;
}

const LABELS_ALUMNO = {
    nombre:         'Nombre',
    apellido:       'Apellido',
    cedula_escolar: 'Cédula Escolar (Opcional)',
};

export const PasoAlumno = ({ datos, setDatos, onContinuar, onVolver }) => {
    const [alumnos,      setAlumnos]      = useState([]);
    const [loading,      setLoading]      = useState(true);
    const [showFormNuevo, setShowFormNuevo] = useState(false);
    const [errores,      setErrores]      = useState({});
    const [fotoPreview,  setFotoPreview]  = useState(null);
    const [modalCompletar, setModalCompletar] = useState(false);
    const [usarRepComoContacto, setUsarRepComoContacto] = useState(true);

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

    const handleFechaNacimiento = (date) => {
        setDatos(prev => ({
            ...prev,
            alumno: { ...prev.alumno, fecha_nacimiento: date ? format(date, 'yyyy-MM-dd') : '' },
        }));
        if (errores.fecha_nacimiento) setErrores(prev => ({ ...prev, fecha_nacimiento: '' }));
    };

    const fechaNacimientoDate = useMemo(
        () => parseISODate(datos.alumno?.fecha_nacimiento),
        [datos.alumno?.fecha_nacimiento]
    );

    // Edad calculada automáticamente a partir de la fecha de nacimiento —
    // nunca se captura a mano.
    const edadCalculada = useMemo(
        () => (fechaNacimientoDate ? differenceInYears(new Date(), fechaNacimientoDate) : null),
        [fechaNacimientoDate]
    );

    const handleSelectExistente = (alu) => {
        setDatos(prev => ({ ...prev, alumno: alu, esAlumnoNuevo: false }));
        setFotoPreview(null);
        setShowFormNuevo(false);
        if (camposFaltantesAlumno(alu).length > 0) setModalCompletar(true);
    };

    const handleActivarNuevo = () => {
        // Por defecto el contacto de emergencia es el propio representante —
        // evita reescribir nombre/teléfono que ya se capturaron en el paso anterior.
        const usarRep = !!(datos.representante?.nombre && datos.representante?.telefono);
        setDatos(prev => ({
            ...prev,
            alumno: {
                nombre: '', apellido: '', cedula_escolar: '',
                fecha_nacimiento: '', genero: 'masculino',
                direccion: '', foto: null,
                ...(usarRep
                    ? contactoEmergenciaDesdeRepresentante(prev.representante)
                    : { contacto_emergencia_nombre: '', contacto_emergencia_telefono: '', contacto_emergencia_parentesco: '' }),
                lugar_nacimiento: '', pais_nacimiento: '', estado_nacimiento: '',
                peso: '', estatura: '', institucion_procedencia: '',
                bautizado: null, alergico: '',
            },
            esAlumnoNuevo: true,
        }));
        setUsarRepComoContacto(usarRep);
        setFotoPreview(null);
        setShowFormNuevo(true);
    };

    const handleToggleUsarRepContacto = (checked) => {
        setUsarRepComoContacto(checked);
        if (checked) {
            setDatos(prev => ({
                ...prev,
                alumno: { ...prev.alumno, ...contactoEmergenciaDesdeRepresentante(prev.representante) },
            }));
        }
    };

    const handleFotoChange = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        if (!TIPOS_FOTO_PERMITIDOS.includes(file.type)) {
            toast.error('Formato no permitido. Solo JPG, PNG o WEBP.');
            e.target.value = '';
            return;
        }
        if (file.size > MAX_BYTES_FOTO) {
            toast.error('La foto supera el límite de 5 MB.');
            e.target.value = '';
            return;
        }

        setDatos(prev => ({ ...prev, alumno: { ...prev.alumno, foto: file } }));
        setFotoPreview(URL.createObjectURL(file));
    };

    const handleQuitarFoto = () => {
        setDatos(prev => ({ ...prev, alumno: { ...prev.alumno, foto: null } }));
        setFotoPreview(null);
    };

    const handleBautizadoChange = (e) => {
        const { value } = e.target;
        setDatos(prev => ({
            ...prev,
            alumno: { ...prev.alumno, bautizado: value === '' ? null : value === 'true' },
        }));
    };

    const handleContinuar = () => {
        if (!datos.alumno) return;
        if (!datos.esAlumnoNuevo) {
            if (camposFaltantesAlumno(datos.alumno).length > 0) {
                setModalCompletar(true);
                return;
            }
            onContinuar();
            return;
        }

        const errs = {};
        if (!datos.alumno.nombre?.trim())           errs.nombre           = 'Requerido';
        if (!datos.alumno.apellido?.trim())          errs.apellido         = 'Requerido';
        if (!datos.alumno.fecha_nacimiento)          errs.fecha_nacimiento = 'Requerido';
        if (!datos.alumno.genero)                    errs.genero           = 'Requerido';
        if (!datos.alumno.direccion?.trim())         errs.direccion        = 'Requerido';
        if (!datos.alumno.contacto_emergencia_nombre?.trim())     errs.contacto_emergencia_nombre     = 'Requerido';
        if (!datos.alumno.contacto_emergencia_telefono?.trim())   errs.contacto_emergencia_telefono   = 'Requerido';
        if (!datos.alumno.contacto_emergencia_parentesco?.trim()) errs.contacto_emergencia_parentesco = 'Requerido';

        if (Object.keys(errs).length > 0) {
            setErrores(errs);
            toast.error('Completa los campos obligatorios antes de continuar.');
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

            {datos.alumno && !datos.esAlumnoNuevo && camposFaltantesAlumno(datos.alumno).length > 0 && (
                <div
                    className="p-4 rounded-2xl flex items-center justify-between gap-4 flex-wrap"
                    style={{ background: '#fef2f2', border: '0.5px solid #fecaca' }}
                >
                    <div className="flex items-center gap-2 text-sm" style={{ color: '#b91c1c' }}>
                        <AlertCircle size={18} aria-hidden="true" />
                        <span>Este alumno tiene datos obligatorios pendientes por completar.</span>
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

            {modalCompletar && datos.alumno && (
                <ModalCompletarAlumno
                    alumno={datos.alumno}
                    representante={datos.representante}
                    onClose={() => setModalCompletar(false)}
                    onGuardar={(alumnoActualizado) => {
                        setDatos(prev => ({ ...prev, alumno: alumnoActualizado }));
                        setModalCompletar(false);
                        toast.success('Datos del alumno actualizados.');
                    }}
                />
            )}

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
                            <SmartDateInput
                                id="alu-fecha_nacimiento"
                                value={fechaNacimientoDate}
                                onChange={handleFechaNacimiento}
                                className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                                style={{
                                    border: `0.5px solid ${errores.fecha_nacimiento ? '#f87171' : 'var(--border-md)'}`,
                                    background: 'var(--porcelain)',
                                    color: 'var(--jet)',
                                }}
                                aria-label="Fecha de nacimiento"
                            />
                            {errores.fecha_nacimiento && (
                                <p className="text-[10px] mt-1 text-red-500">{errores.fecha_nacimiento}</p>
                            )}
                            {edadCalculada !== null && (
                                <p className="text-[11px] mt-1.5" style={{ color: 'var(--ash)' }}>
                                    Edad: {edadCalculada} {edadCalculada === 1 ? 'año' : 'años'}
                                </p>
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

                    {/* Foto del estudiante */}
                    <div>
                        <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>
                            Foto del estudiante
                        </label>
                        {fotoPreview ? (
                            <div className="relative w-28 h-28">
                                <img
                                    src={fotoPreview}
                                    alt="Vista previa de la foto del estudiante"
                                    className="w-28 h-28 rounded-2xl object-cover"
                                    style={{ border: '0.5px solid var(--border-md)' }}
                                />
                                <button
                                    type="button"
                                    onClick={handleQuitarFoto}
                                    aria-label="Quitar foto"
                                    className="absolute -top-2 -right-2 w-7 h-7 bg-black/60 hover:bg-black/80 rounded-full flex items-center justify-center transition-colors"
                                >
                                    <X size={14} className="text-white" aria-hidden="true" />
                                </button>
                            </div>
                        ) : (
                            <label
                                className="flex flex-col items-center justify-center gap-2 w-28 h-28 rounded-2xl border-2 border-dashed cursor-pointer transition-all"
                                style={{ borderColor: 'var(--border-md)' }}
                            >
                                <Camera size={22} style={{ color: 'var(--pb)' }} aria-hidden="true" />
                                <span className="text-[10px]" style={{ color: 'var(--ash)' }}>Subir foto</span>
                                <input
                                    type="file"
                                    accept="image/jpeg,image/png,image/webp"
                                    className="hidden"
                                    onChange={handleFotoChange}
                                />
                            </label>
                        )}
                    </div>

                    {/* Datos de nacimiento y procedencia */}
                    <div>
                        <h4 className="text-[11px] uppercase tracking-widest mb-3" style={{ color: 'var(--ash)' }}>
                            Nacimiento y procedencia
                        </h4>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div>
                                <label htmlFor="alu-lugar_nacimiento" className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>
                                    Lugar de nacimiento
                                </label>
                                <input
                                    id="alu-lugar_nacimiento" type="text" name="lugar_nacimiento"
                                    className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                                    style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)', color: 'var(--jet)' }}
                                    value={datos.alumno.lugar_nacimiento || ''}
                                    onChange={handleNewAlumnoChange}
                                />
                            </div>
                            <div>
                                <label htmlFor="alu-pais_nacimiento" className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>
                                    País
                                </label>
                                <input
                                    id="alu-pais_nacimiento" type="text" name="pais_nacimiento"
                                    className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                                    style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)', color: 'var(--jet)' }}
                                    value={datos.alumno.pais_nacimiento || ''}
                                    onChange={handleNewAlumnoChange}
                                />
                            </div>
                            <div>
                                <label htmlFor="alu-estado_nacimiento" className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>
                                    Estado
                                </label>
                                <input
                                    id="alu-estado_nacimiento" type="text" name="estado_nacimiento"
                                    className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                                    style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)', color: 'var(--jet)' }}
                                    value={datos.alumno.estado_nacimiento || ''}
                                    onChange={handleNewAlumnoChange}
                                />
                            </div>
                            <div className="md:col-span-3">
                                <label htmlFor="alu-institucion_procedencia" className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>
                                    Institución de procedencia
                                </label>
                                <input
                                    id="alu-institucion_procedencia" type="text" name="institucion_procedencia"
                                    className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                                    style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)', color: 'var(--jet)' }}
                                    value={datos.alumno.institucion_procedencia || ''}
                                    onChange={handleNewAlumnoChange}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Salud */}
                    <div>
                        <h4 className="text-[11px] uppercase tracking-widest mb-3" style={{ color: 'var(--ash)' }}>
                            Salud
                        </h4>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div>
                                <label htmlFor="alu-peso" className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>
                                    Peso (kg)
                                </label>
                                <input
                                    id="alu-peso" type="number" step="0.01" name="peso"
                                    className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                                    style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)', color: 'var(--jet)' }}
                                    value={datos.alumno.peso || ''}
                                    onChange={handleNewAlumnoChange}
                                />
                            </div>
                            <div>
                                <label htmlFor="alu-estatura" className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>
                                    Estatura (cm)
                                </label>
                                <input
                                    id="alu-estatura" type="number" step="0.01" name="estatura"
                                    className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                                    style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)', color: 'var(--jet)' }}
                                    value={datos.alumno.estatura || ''}
                                    onChange={handleNewAlumnoChange}
                                />
                            </div>
                            <div>
                                <label htmlFor="alu-bautizado" className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>
                                    Bautizado
                                </label>
                                <select
                                    id="alu-bautizado" name="bautizado"
                                    className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                                    style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)', color: 'var(--jet)' }}
                                    value={datos.alumno.bautizado === null || datos.alumno.bautizado === undefined ? '' : String(datos.alumno.bautizado)}
                                    onChange={handleBautizadoChange}
                                >
                                    <option value="">No especifica</option>
                                    <option value="true">Sí</option>
                                    <option value="false">No</option>
                                </select>
                            </div>
                            <div className="md:col-span-3">
                                <label htmlFor="alu-alergico" className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>
                                    Alérgico a
                                </label>
                                <input
                                    id="alu-alergico" type="text" name="alergico"
                                    className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                                    style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)', color: 'var(--jet)' }}
                                    value={datos.alumno.alergico || ''}
                                    onChange={handleNewAlumnoChange}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Dirección y contacto de emergencia */}
                    <div>
                        <h4 className="text-[11px] uppercase tracking-widest mb-3" style={{ color: 'var(--ash)' }}>
                            Dirección y contacto de emergencia
                        </h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="md:col-span-2">
                                <label htmlFor="alu-direccion" className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>
                                    Dirección del estudiante <span className="text-red-500">*</span>
                                </label>
                                <textarea
                                    id="alu-direccion" name="direccion" rows="2"
                                    className="w-full p-3 rounded-xl text-sm outline-none resize-none"
                                    style={{ border: `0.5px solid ${errores.direccion ? '#f87171' : 'var(--border-md)'}`, background: 'var(--porcelain)', color: 'var(--jet)' }}
                                    value={datos.alumno.direccion || ''}
                                    onChange={handleNewAlumnoChange}
                                />
                                {errores.direccion && <p className="text-[10px] mt-1 text-red-500">{errores.direccion}</p>}
                            </div>

                            {datos.representante && (
                                <div className="md:col-span-2 flex items-center gap-2">
                                    <input
                                        id="alu-usar-rep-contacto"
                                        type="checkbox"
                                        checked={usarRepComoContacto}
                                        onChange={(e) => handleToggleUsarRepContacto(e.target.checked)}
                                        className="w-4 h-4 rounded"
                                    />
                                    <label htmlFor="alu-usar-rep-contacto" className="text-xs" style={{ color: 'var(--ash)' }}>
                                        Usar los datos del representante ({datos.representante.nombre} {datos.representante.apellido}) como contacto de emergencia
                                    </label>
                                </div>
                            )}

                            <div>
                                <label htmlFor="alu-contacto_emergencia_nombre" className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>
                                    Contacto de emergencia <span className="text-red-500">*</span>
                                </label>
                                <input
                                    id="alu-contacto_emergencia_nombre" type="text" name="contacto_emergencia_nombre"
                                    disabled={usarRepComoContacto}
                                    className="w-full px-3 py-2 rounded-lg text-sm outline-none disabled:opacity-60"
                                    style={{ border: `0.5px solid ${errores.contacto_emergencia_nombre ? '#f87171' : 'var(--border-md)'}`, background: usarRepComoContacto ? 'var(--ash-light)' : 'var(--porcelain)', color: 'var(--jet)' }}
                                    value={datos.alumno.contacto_emergencia_nombre || ''}
                                    onChange={handleNewAlumnoChange}
                                />
                                {errores.contacto_emergencia_nombre && <p className="text-[10px] mt-1 text-red-500">{errores.contacto_emergencia_nombre}</p>}
                            </div>
                            <div>
                                <label htmlFor="alu-contacto_emergencia_telefono" className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>
                                    Teléfono de emergencia <span className="text-red-500">*</span>
                                </label>
                                <input
                                    id="alu-contacto_emergencia_telefono" type="tel" name="contacto_emergencia_telefono"
                                    disabled={usarRepComoContacto}
                                    className="w-full px-3 py-2 rounded-lg text-sm outline-none disabled:opacity-60"
                                    style={{ border: `0.5px solid ${errores.contacto_emergencia_telefono ? '#f87171' : 'var(--border-md)'}`, background: usarRepComoContacto ? 'var(--ash-light)' : 'var(--porcelain)', color: 'var(--jet)' }}
                                    value={datos.alumno.contacto_emergencia_telefono || ''}
                                    onChange={handleNewAlumnoChange}
                                />
                                {errores.contacto_emergencia_telefono && <p className="text-[10px] mt-1 text-red-500">{errores.contacto_emergencia_telefono}</p>}
                            </div>
                            <div className="md:col-span-2">
                                <label htmlFor="alu-contacto_emergencia_parentesco" className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>
                                    Parentesco del contacto <span className="text-red-500">*</span>
                                </label>
                                <input
                                    id="alu-contacto_emergencia_parentesco" type="text" name="contacto_emergencia_parentesco"
                                    disabled={usarRepComoContacto}
                                    className="w-full px-3 py-2 rounded-lg text-sm outline-none disabled:opacity-60"
                                    style={{ border: `0.5px solid ${errores.contacto_emergencia_parentesco ? '#f87171' : 'var(--border-md)'}`, background: usarRepComoContacto ? 'var(--ash-light)' : 'var(--porcelain)', color: 'var(--jet)' }}
                                    value={datos.alumno.contacto_emergencia_parentesco || ''}
                                    onChange={handleNewAlumnoChange}
                                />
                                {errores.contacto_emergencia_parentesco && <p className="text-[10px] mt-1 text-red-500">{errores.contacto_emergencia_parentesco}</p>}
                            </div>
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
