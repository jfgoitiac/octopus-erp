import { useEffect, useState, useCallback, useContext } from 'react';
import { Search, User, DollarSign, X, Save, Calendar, Settings, History, RefreshCcw, ExternalLink, Edit2, UserCircle, GraduationCap, Trash2, Loader2, PlusCircle, FileText, UserCheck, UserMinus, Info, Download } from 'lucide-react';
import DatePickerES from '../components/DatePickerES';
import { useNavigate } from 'react-router-dom';
import axiosInstance from '../api/apiClient';
import { AuthContext } from '../context/AuthContext';
import { toast } from 'react-toastify';
import { useTasaBCV } from '../hooks/useTasaBCV';

const ListaAlumnos = () => {
    const { user } = useContext(AuthContext);
    const navigate = useNavigate();
    const [alumnos, setAlumnos] = useState([]);
    const [busqueda, setBusqueda] = useState('');
    const [loading, setLoading] = useState(true);
    const [exportingExcel, setExportingExcel] = useState(false);
    const [selectedAlumno, setSelectedAlumno] = useState(null);
    const [mensualidades, setMensualidades] = useState([]);
    const [showModal, setShowModal] = useState(false);
    const [totalDeuda, setTotalDeuda] = useState(0);
    const { tasa, loading: loadingTasa, refetch: refetchTasa } = useTasaBCV();
    const [saving, setSaving] = useState(false);
    const [montoDefecto, setMontoDefecto] = useState('35.00');
    const [montoInscripcion, setMontoInscripcion] = useState('50.00');
    const [showConfig, setShowConfig] = useState(false);
    const [showEditModal, setShowEditModal] = useState(false);
    const [editModalLoading, setEditModalLoading] = useState(false);
    
    // Definición de permisos basada en el contexto del usuario
    const isSecretaria = user && ['director', 'administrador', 'secretaria', 'sistemas'].includes(user.rol);
    const isCajero = user && ['director', 'administrador', 'cajero'].includes(user.rol);

    // Estados para Nuevas Funcionalidades
    const [showRegisterModal, setShowRegisterModal] = useState(false);
    const [showFichaSidebar, setShowFichaSidebar] = useState(false);
    const [showAsignarGradoModal, setShowAsignarGradoModal] = useState(false);
    const [showRetirarModal, setShowRetirarModal] = useState(false);
    const [motivoRetiro, setMotivoRetiro] = useState('');
    const [checkingRep, setCheckingRep] = useState(false);
    const [repFound, setRepFound] = useState(false);
    const [nuevoGrado, setNuevoGrado] = useState('');
    const [mostrarInactivos, setMostrarInactivos] = useState(false);

    const [registerForm, setRegisterForm] = useState({
        nombre: '', apellido: '', cedula_escolar: '', fecha_nacimiento: '', genero: 'masculino',
        porcentaje_beca: 0,
        rep_cedula: '', rep_nombre: '', rep_apellido: '', rep_telefono: '', rep_correo: '', rep_direccion: ''
    });

    const [editForm, setEditForm] = useState({
        id: '',
        nombre: '', apellido: '', cedula_escolar: '', grado_seccion: '', fecha_nacimiento: '', estatus_financiero: '', porcentaje_beca: '',
        genero: '',
        rep_id: '',
        rep_nombre: '', rep_apellido: '', rep_cedula: '', rep_telefono: '', rep_correo: '',
        rep_direccion: '',
    });

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            if (mostrarInactivos) params.append('todos', 'true');
            if (busqueda) params.append('buscar', busqueda);

            const [resAlumnos, resConfig] = await Promise.all([
                axiosInstance.get(`secretaria/alumnos/?${params.toString()}`),
                axiosInstance.get('cobranza/configuracion/')
            ]);
            setAlumnos(resAlumnos?.data || []);
            setMontoDefecto(resConfig?.data?.monto_defecto || '35.00');
            setMontoInscripcion(resConfig?.data?.monto_inscripcion || '50.00');
        } catch (err) {
            const msg = err.response?.data?.error || err.response?.data?.detail || "Error al conectar con el servidor.";
            toast.error(msg);
        } finally {
            setLoading(false);
        }
    }, [mostrarInactivos, busqueda]);

    const verificarRepresentante = async (cedula) => {
        setCheckingRep(true);
        try {
            const res = await axiosInstance.get(`cobranza/buscar/${cedula}/`);
            if (res.data.representante) {
                console.log("Datos crudos del representante recuperado:", res.data.representante);

                const rep = res.data.representante;

                setRegisterForm(prev => ({
                    ...prev,
                    rep_nombre: rep.nombre || '',
                    rep_apellido: rep.apellido || '',
                    rep_telefono: rep.telefono || '',
                    rep_correo: rep.correo || '',
                    rep_direccion: rep.direccion || ''
                }));
                setRepFound(true);
                toast.info("Representante encontrado. Datos precargados.");
            }
        } catch (err) {
            if (err.response?.status !== 404) {
                toast.error("Error al verificar representante.");
            }
            setRepFound(false);
        } finally {
            setCheckingRep(false);
        }
    };

    const handleLimpiarRepresentante = () => {
        setRepFound(false);
        setRegisterForm(prev => ({
            ...prev,
            rep_cedula: '',
            rep_nombre: '',
            rep_apellido: '',
            rep_telefono: '',
            rep_correo: '',
            rep_direccion: ''
        }));
    };

    const handleCloseRegisterModal = () => {
        setShowRegisterModal(false);
        setRepFound(false);
        setRegisterForm({
            nombre: '', apellido: '', cedula_escolar: '', fecha_nacimiento: '', genero: 'masculino',
            porcentaje_beca: 0,
            rep_cedula: '', rep_nombre: '', rep_apellido: '', rep_telefono: '', rep_correo: '', rep_direccion: ''
        });
    };

    const handleCloseModal = () => {
        setShowModal(false);
        setMensualidades([]);
        setSelectedAlumno(null);
    };

    useEffect(() => {
        const delayDebounceFn = setTimeout(() => {
            fetchData();
        }, 500);
        return () => clearTimeout(delayDebounceFn);
    }, [fetchData]);

    useEffect(() => {
        const timer = setTimeout(() => {
            if (registerForm.rep_cedula.length > 6 && !repFound && showRegisterModal) {
                verificarRepresentante(registerForm.rep_cedula);
            }
        }, 800);
        return () => clearTimeout(timer);
    }, [registerForm.rep_cedula, repFound, showRegisterModal]);

    const handleSaveConfig = async () => {
        try {
            await axiosInstance.post('cobranza/configuracion/', {
                monto_defecto: montoDefecto,
                monto_inscripcion: montoInscripcion,
            });
            setShowConfig(false);
            toast.success("Configuración actualizada globalmente.");
        } catch (err) {
            const msg = err.response?.data?.error || err.response?.data?.detail || "Error al guardar configuración";
            toast.error(msg);
        }
    };

    const handleOpenModal = async (alumno) => {
        setSelectedAlumno(alumno);
        setShowModal(true);
        try {
            const res = await axiosInstance.get(`cobranza/buscar/${alumno.cedula_escolar}/`);
            setMensualidades(res.data?.alumnos?.[0]?.mensualidades_pendientes || []);
            setTotalDeuda(res.data.monto_total_deuda || 0);
        } catch (error) {
            const msg = error.response?.data?.error || error.response?.data?.detail || "Error al cargar mensualidades.";
            toast.error(msg);
        }
    };

    const handleUpdateMonto = (id, nuevoMonto) => {
        setMensualidades(prev => prev.map(m => m.id === id ? { ...m, monto_usd: nuevoMonto } : m));
    }; 

    const handleSave = async () => {
        if (!mensualidades || mensualidades.length === 0) {
            toast.error("No hay mensualidades cargadas para actualizar.");
            return;
        }

        setSaving(true);
        try {
            const payload = {
                mensualidades: mensualidades.map(m => ({ id: m.id, monto_usd: m.monto_usd }))
            };
            await axiosInstance.patch('cobranza/actualizar-mensualidades/', payload);
            handleCloseModal();
            toast.success("¡Mensualidades actualizadas correctamente!");
        } catch (err) {
            const msg = err.response?.data?.error || err.response?.data?.detail || "Error al guardar cambios";
            toast.error(msg);
        } finally {
            setSaving(false);
        }
    };

    const handleOpenEditModal = async (alumno) => {
        setEditModalLoading(true);
        try { 
            const res = await axiosInstance.get(`secretaria/alumnos/${alumno.id}/`);
            const fullData = res?.data;
            
            if (fullData) {
                setEditForm({
                    id: fullData.id,
                    nombre: fullData.nombre || '',
                    apellido: fullData.apellido || '',
                    cedula_escolar: fullData.cedula_escolar || '',
                    grado_seccion: fullData.grado_seccion ? fullData.grado_seccion.split(' - ')[0] : '',
                    fecha_nacimiento: fullData.fecha_nacimiento || '',
                    genero: fullData.genero || '',
                    estatus_financiero: fullData.estatus_financiero || 'solvente',
                    porcentaje_beca: fullData.porcentaje_beca || 0,
                    rep_id: fullData.representante?.id || '',
                    // Mapeo explícito y robusto de las propiedades del representante
                    rep_nombre: fullData.representante?.nombre || '',
                    rep_apellido: fullData.representante?.apellido || '',
                    rep_cedula: fullData.representante?.cedula || '',
                    rep_telefono: fullData.representante?.telefono || '',
                    rep_correo: fullData.representante?.correo || '',
                    rep_direccion: fullData.representante?.direccion || ''
                });
                setShowEditModal(true);
            }
        } catch (error) {
            const msg = error.response?.data?.error || error.response?.data?.detail || "No se pudo cargar la información completa.";
            toast.error(msg);
        } finally {
            setEditModalLoading(false);
        }
    };

    const handleSaveEdit = async () => {
        // 1. Validación de Integridad: El ID es crítico para la URL
        if (!editForm.id) {
            toast.error("Error técnico: No se localizó el ID del estudiante.");
            return;
        }

        // 2. Validación de Negocio
        if (!editForm.nombre || !editForm.apellido || !editForm.rep_nombre || !editForm.rep_cedula) {
            toast.error("Nombre/Apellido del alumno y Nombre/Cédula del representante son obligatorios.");
            return;
        }

        setSaving(true);
        try {
            // 3. Reconstrucción del JSON (Nested Representative Payload)
            const payload = {
                nombre:             editForm.nombre.trim(),
                apellido:           editForm.apellido.trim(),
                cedula_escolar:     editForm.cedula_escolar?.trim() || null,
                grado_seccion:      editForm.grado_seccion || null,
                fecha_nacimiento:   editForm.fecha_nacimiento || null,
                genero:             editForm.genero,
                estatus_financiero: editForm.estatus_financiero,
                porcentaje_beca:    Number(editForm.porcentaje_beca) || 0,
                representante: {
                    id:        editForm.rep_id,
                    cedula:    editForm.rep_cedula?.trim(),
                    nombre:    editForm.rep_nombre?.trim(),
                    apellido:  editForm.rep_apellido?.trim() || '',
                    telefono:  editForm.rep_telefono?.trim() || '',
                    correo:    editForm.rep_correo?.trim() || '',
                    direccion: editForm.rep_direccion?.trim() || ''
                }
            };
            
            const response = await axiosInstance.patch(`secretaria/alumnos/${editForm.id}/update_info/`, payload);
            setAlumnos(prevAlumnos => prevAlumnos.map(alu => alu.id === editForm.id ? response.data : alu));
            setShowEditModal(false);
            toast.success("Información actualizada correctamente.");
        } catch (err) {
            // Inyección de Debug para capturar errores de validación de DRF
            console.error("Detalle exacto del error 400:", JSON.stringify(err.response?.data, null, 2));
            
            // Procesamiento de errores de validación detallados
            let msg = err.response?.data?.error || err.response?.data?.detail;
            if (!msg && err.response?.data && typeof err.response.data === 'object') {
                msg = Object.entries(err.response.data)
                    .map(([key, val]) => `${key}: ${Array.isArray(val) ? val.join(', ') : JSON.stringify(val)}`)
                    .join(' | ');
            }
            if (!msg) msg = "Error al actualizar la información.";
            toast.error(msg);
        } finally { setSaving(false); }
    };

    const handleRegister = async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
            const payload = {
                nombre: registerForm.nombre,
                apellido: registerForm.apellido,
                cedula_escolar: registerForm.cedula_escolar.trim() || null,
                fecha_nacimiento: registerForm.fecha_nacimiento,
                genero: registerForm.genero,
                porcentaje_beca: Number(registerForm.porcentaje_beca) || 0,
                representante: {
                    cedula: registerForm.rep_cedula.trim(),
                    nombre: registerForm.rep_nombre,
                    apellido: registerForm.rep_apellido,
                    telefono: registerForm.rep_telefono,
                    correo: registerForm.rep_correo,
                    direccion: registerForm.rep_direccion
                }
            };
            await axiosInstance.post('secretaria/alumnos/', payload);
            toast.success("Alumno registrado en el banco exitosamente.");
            handleCloseRegisterModal();
            fetchData();
        } catch (err) {
            console.log("Errores del backend:", err.response?.data);
            const msg = err.response?.data?.error 
                || err.response?.data?.detail 
                || (err.response?.data && typeof err.response.data === 'object' ? Object.values(err.response.data).flat().join(' ') : null)
                || "Error de conexión o datos inválidos al registrar.";
            toast.error(msg);
        } finally { setSaving(false); }
    };

    const handleAsignarGrado = async () => {
        setSaving(true);
        try {
            await axiosInstance.post(`secretaria/alumnos/${selectedAlumno.id}/asignar_grado/`, {
                grado_seccion: nuevoGrado
            });
            toast.success(`Grado ${nuevoGrado} asignado correctamente.`);
            setShowAsignarGradoModal(false);
            fetchData();
        } catch (err) {
            const msg = err.response?.data?.error || err.response?.data?.detail || "Error al asignar grado.";
            toast.error(msg);
        } finally { setSaving(false); }
    };

    const handleRetirar = async () => {
        setSaving(true);
        try {
            await axiosInstance.post(`secretaria/alumnos/${selectedAlumno.id}/retirar/`, {
                motivo: motivoRetiro
            });
            toast.success("Alumno retirado y cupo liberado.");
            setShowRetirarModal(false);
            setMotivoRetiro('');
            fetchData();
        } catch (error) {
            const msg = error.response?.data?.error || error.response?.data?.detail || "Error al procesar el retiro del alumno.";
            toast.error(msg);
        } finally { setSaving(false); }
    };

    const handleReactivar = async (alumno) => {
        if (!window.confirm(`¿Desea reactivar a ${alumno.nombre}?`)) return;
        setSaving(true);
        try {
            await axiosInstance.post(`secretaria/alumnos/${alumno.id}/reactivar/`);
            toast.success("Alumno reactivado exitosamente.");
            fetchData();
        } catch (err) {
            const msg = err.response?.data?.error || err.response?.data?.detail || "Error al intentar reactivar al alumno.";
            toast.error(msg);
        } finally { setSaving(false); }
    };

    const handleGenerarAnualidad = async () => {
        setSaving(true);
        try {
            await axiosInstance.post('cobranza/generar-anualidad/', { alumno_id: selectedAlumno.id });
            const res = await axiosInstance.get(`cobranza/buscar/${selectedAlumno.cedula_escolar}/`);
            setMensualidades(res.data?.alumnos?.[0]?.mensualidades_pendientes || []);
            setTotalDeuda(res.data.monto_total_deuda || 0);
        } catch (error) {
            const msg = error.response?.data?.error || error.response?.data?.detail || "Error al generar los meses del año.";
            toast.error(msg);
        }
        finally { setSaving(false); }
    };

    const handleBulkUpdate = (valor) => {
        const parsedValor = parseFloat(valor);
        if (isNaN(parsedValor) || parsedValor < 0) {
            toast.error("Ingrese un monto válido mayor a 0.");
            return;
        }
        setMensualidades(prev => prev.map(m => ({ ...m, monto_usd: valor })));
    };

    const handleSyncTasa = async () => {
        try {
            await axiosInstance.post('cobranza/sincronizar-tasa/', {});
            await refetchTasa();
            toast.success("Sincronización con BCV completada.");
        } catch (error) {
            const msg = error.response?.data?.error || error.response?.data?.detail || "Error al sincronizar con el BCV.";
            toast.error(msg);
        }
    };

    const getEstadoBadge = (alumno) => {
        const estado = !alumno.activo ? 'Retirado' : (alumno.grado_seccion ? 'Inscrito' : 'Sin inscribir');
        let style = {};
        switch (estado) {
            case 'Inscrito':
                style = { background: '#dcfce7', color: '#16a34a' };
                break;
            case 'Retirado':
                style = { background: 'var(--red-light)', color: 'var(--red)' };
                break;
            default:
                style = { background: '#fef9c3', color: '#854d0e' };
        }
        return (
            <span 
                className="px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider"
                style={style}
            >
                {estado}
            </span>
        );
    };

    const handleExportExcel = async () => {
        setExportingExcel(true);
        try {
            const params = new URLSearchParams();
            if (busqueda.trim()) params.append('buscar', busqueda.trim());
            const res = await axiosInstance.get(`secretaria/exportar-alumnos-excel/?${params}`, { responseType: 'blob' });
            const url = URL.createObjectURL(new Blob([res.data], {
                type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            }));
            const a = Object.assign(document.createElement('a'), {
                href: url,
                download: `lista_alumnos_${new Date().toISOString().split('T')[0]}.xlsx`,
            });
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            toast.success('Archivo Excel descargado.');
        } catch {
            toast.error('No se pudo generar el Excel.');
        } finally {
            setExportingExcel(false);
        }
    };

    if (loading) return <div className="p-10 text-center font-bold" style={{ color: 'var(--pb)' }}>Cargando base de datos escolar...</div>;

    return (
        <div className="animate-fadeIn">
            <div className="mb-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div> 
                    <h2 className="text-lg font-medium" style={{ color: 'var(--jet)' }}>Control de Matrícula</h2>
                    <p className="text-sm mt-1" style={{ color: 'var(--ash)' }}>Listado general de Primaria y Media General</p>
                </div>
                
                <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
                    {isSecretaria && (
                        <button 
                            onClick={() => setShowRegisterModal(true)}
                            className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-all disabled:opacity-50"
                            style={{ background: 'var(--pb)' }}
                        >
                            <PlusCircle size={18} />
                            <span className="text-sm font-medium">Registrar Alumno</span>
                        </button>
                    )}
                    <button
                        onClick={handleExportExcel}
                        disabled={exportingExcel}
                        className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all disabled:opacity-50"
                        style={{ border: '0.5px solid var(--border-md)', color: 'var(--ash)' }}
                    >
                        {exportingExcel ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                        <span className="hidden sm:inline">Excel</span>
                    </button>

                    <div className="relative">
                        <button
                            onClick={() => setShowConfig(!showConfig)}
                            className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all"
                            style={{ border: '0.5px solid var(--border-md)', color: 'var(--ash)' }}
                        >
                            <Settings size={16} />
                            <span className="text-sm font-bold">Configuración</span>
                        </button>
                        {showConfig && (
                            <div className="absolute right-0 mt-2 w-72 bg-white p-4 rounded-2xl shadow-xl border border-slate-100 z-50 animate-fadeIn">
                                <p className="text-[11px] uppercase tracking-widest font-bold mb-3" style={{ color: 'var(--ash)' }}>Montos Globales</p>
                                <label className="block text-[11px] uppercase tracking-widest mb-1" style={{ color: 'var(--ash)' }}>Mensualidad ($)</label>
                                <input type="number" step="0.01"
                                    className="w-full px-3 py-2 rounded-lg text-sm outline-none mb-3"
                                    style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)' }}
                                    value={montoDefecto} onChange={(e) => setMontoDefecto(e.target.value)} />
                                <label className="block text-[11px] uppercase tracking-widest mb-1" style={{ color: 'var(--ash)' }}>Inscripción ($)</label>
                                <input type="number" step="0.01"
                                    className="w-full px-3 py-2 rounded-lg text-sm outline-none mb-3"
                                    style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)' }}
                                    value={montoInscripcion} onChange={(e) => setMontoInscripcion(e.target.value)} />
                                <button onClick={handleSaveConfig} className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-white text-sm font-medium" style={{ background: 'var(--pb)' }}>
                                    <Save size={14} /> Guardar
                                </button>
                            </div>
                        )}
                    </div>

                    <button 
                        onClick={() => setMostrarInactivos(!mostrarInactivos)}
                        className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all"
                        style={{ border: '0.5px solid var(--border-md)', background: mostrarInactivos ? 'var(--jet)' : 'transparent', color: mostrarInactivos ? '#fff' : 'var(--ash)' }}
                    >
                        <UserMinus size={16} />
                        <span className="text-sm font-bold">{mostrarInactivos ? 'Ver Activos' : 'Ver Retirados'}</span>
                    </button>

                    <button 
                        onClick={handleSyncTasa}
                        className={`flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${loadingTasa ? 'animate-pulse' : ''}`}
                        style={{ border: '0.5px solid var(--border-md)', color: 'var(--pb)' }}>
                        <RefreshCcw size={18} />
                        <span className="text-sm font-bold">Bs. {tasa.toLocaleString('es-VE')}</span>
                    </button>

                    <div className="relative flex-1 md:w-72">
                        <Search className="absolute left-3 top-2.5" style={{ color: 'var(--ash)' }} size={18} />
                        <input 
                            type="text" 
                            placeholder="Buscar Estudiante..." 
                            className="w-full px-3 py-2 pl-10 rounded-lg text-sm outline-none"
                            style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)' }}
                            value={busqueda}
                            onChange={(e) => setBusqueda(e.target.value)}
                        />
                    </div>
                </div>
            </div>

            <div className="rounded-xl overflow-hidden" style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)' }}>
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr>
                            {['Estudiante', 'Grado / Año', 'Estado', 'Finanzas', 'Acciones'].map(h => (
                                <th key={h} className="px-4 py-3 text-[11px] uppercase tracking-widest"
                                    style={{ color: 'var(--ash)', background: 'var(--porcelain)', borderBottom: '0.5px solid var(--border-md)' }}>{h}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody> 
                        {alumnos?.map((alumno) => (
                            <tr key={alumno.id} style={{ borderBottom: '0.5px solid var(--border)', background: 'var(--porcelain)' }}> 
                                <td className="px-4 py-3">
                                    <div className="flex items-center space-x-3">
                                        <div className="w-8 h-8 rounded-full flex items-center justify-center transition-all"
                                             style={{ background: 'var(--ash-light)', color: 'var(--ash)' }}>
                                            <User size={20} />
                                        </div>
                                        <div>
                                            <p className="text-sm font-medium" style={{ color: 'var(--jet)' }}>{alumno.nombre} {alumno.apellido}</p>
                                            <p className="text-xs" style={{ color: 'var(--ash)' }}>CI: {alumno.cedula_escolar || 'N/A'}</p>
                                        </div>
                                    </div>
                                </td>
                                <td className="px-4 py-3">
                                    <div className="flex flex-col">
                                        <span className="px-3 py-1 rounded-full text-xs font-bold w-fit" style={{ background: 'var(--pb-light)', color: 'var(--pb)' }}>
                                            {alumno.grado_seccion ? alumno.grado_seccion.split(' - ')[0] : 'No asignado'}
                                        </span>
                                        {alumno.grado_seccion && <span className="text-[9px] uppercase mt-1 text-slate-400 font-bold ml-1">Sección Única</span>}
                                    </div>
                                </td>
                                <td className="px-4 py-3">
                                    {getEstadoBadge(alumno)}
                                </td>
                                <td className="px-4 py-3">
                                    <div className={`flex items-center space-x-2 font-bold text-xs uppercase ${
                                        alumno.estatus_financiero === 'solvente' ? 'text-green-600' : 'text-red-600'
                                    }`}>
                                        <div className={`w-2 h-2 rounded-full ${
                                            alumno.estatus_financiero === 'solvente' ? 'bg-green-600' : 'bg-red-600'
                                        }`} />
                                        <span>{alumno.estatus_financiero}</span>
                                    </div>
                                </td>
                                <td className="px-4 py-3">
                                    <div className="flex items-center gap-2">
                                        <button 
                                            onClick={() => { setSelectedAlumno(alumno); setShowFichaSidebar(true); }}
                                            className="p-2 rounded-lg transition-all"
                                            title="Ver Ficha" style={{ background: 'var(--ash-light)', color: 'var(--ash)' }}
                                        >
                                            <FileText size={18} />
                                        </button>
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); handleOpenEditModal(alumno); }}
                                            className="p-2 rounded-lg transition-all"
                                            title="Editar Información" style={{ background: 'var(--ash-light)', color: 'var(--ash)' }}
                                        >
                                            {editModalLoading && editForm.id === alumno.id ? <Loader2 size={18} className="animate-spin" /> : <Edit2 size={18} />}
                                        </button>
                                        {isSecretaria && (
                                            <button
                                                onClick={() => { setSelectedAlumno(alumno); setShowAsignarGradoModal(true); }}
                                                className="p-2 rounded-lg transition-all"
                                                title="Asignar Grado" style={{ background: 'var(--ash-light)', color: 'var(--ash)' }}
                                            >
                                                <GraduationCap size={18} />
                                            </button>
                                        )} 
                                        {alumno.activo ? (
                                            <button 
                                                onClick={() => { setSelectedAlumno(alumno); setShowRetirarModal(true); }}
                                                className={`p-2 rounded-lg transition-all ${!isSecretaria ? 'opacity-30 cursor-not-allowed' : ''}`}
                                                disabled={!isSecretaria}
                                                title="Retirar Alumno" style={{ background: 'var(--red-light)', color: 'var(--red)' }}
                                            >
                                                <UserMinus size={18} />
                                            </button>
                                        ) : (
                                            <button 
                                                onClick={() => handleReactivar(alumno)}
                                                className={`p-2 rounded-lg transition-all ${!isSecretaria ? 'opacity-30 cursor-not-allowed' : ''}`}
                                                disabled={!isSecretaria}
                                                title="Reactivar Alumno" style={{ background: '#dcfce7', color: '#16a34a' }}
                                            >
                                                <RefreshCcw size={18} />
                                            </button>
                                        )}
                                        {isCajero && (
                                            <button
                                                onClick={() => handleOpenModal(alumno)}
                                                className="p-2 rounded-lg transition-all"
                                                title="Ajustar Deuda" style={{ background: 'var(--ash-light)', color: 'var(--ash)' }}
                                            >
                                                <DollarSign size={18} />
                                            </button>
                                        )} 
                                        <button
                                            onClick={() => navigate(`/cobranza?cedula=${alumno.cedula_escolar}`)}
                                            className={`p-2 rounded-lg flex items-center gap-1 transition-all ${!isCajero ? 'opacity-30 cursor-not-allowed' : ''}`}
                                            disabled={!isCajero}
                                            title="Ir a Cobranza" style={{ background: 'var(--pb-light)', color: 'var(--pb)' }}
                                        >
                                            <ExternalLink size={16} />
                                            <span className="hidden lg:inline text-xs font-bold">Cobrar</span>
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                
                {alumnos.length === 0 && (
                    <div className="p-20 text-center" style={{ color: 'var(--ash)' }}>
                        No se encontraron estudiantes con esos datos.
                    </div>
                )}
            </div>

            {/* Modal para editar montos de mensualidades */}
            {showModal && selectedAlumno && (
                <div className="fixed inset-0 backdrop-blur-sm flex items-center justify-center z-50 p-4" style={{ background: 'rgba(43,48,58,0.5)' }}>
                    <div className="rounded-3xl w-full max-w-md shadow-2xl overflow-hidden animate-fadeIn" style={{ background: 'var(--porcelain)' }}>
                        <div className="p-6 flex justify-between items-center" style={{ borderBottom: '0.5px solid var(--border)' }}>
                            <div>
                                <h2 className="text-xl font-bold" style={{ color: 'var(--jet)' }}>Ajustar Mensualidades</h2>
                                <div className="flex flex-wrap items-center gap-2 mt-1">
                                    <p className="text-xs" style={{ color: 'var(--ash)' }}>{selectedAlumno.nombre} {selectedAlumno.apellido}</p>
                                    <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider"
                                          style={{ background: 'var(--red-light)', color: 'var(--red)' }}>
                                        Deuda: ${(Number(totalDeuda) || 0).toFixed(2)}
                                        {tasa > 0 && ` / Bs. ${(Number(totalDeuda) * tasa).toLocaleString('es-VE', { minimumFractionDigits: 2 })}`}
                                    </span>
                                </div>
                            </div>
                            <button onClick={handleCloseModal} className="p-2" style={{ color: 'var(--ash)' }}><X size={24} /></button>
                        </div>
                        <div className="p-6 max-h-[60vh] overflow-y-auto space-y-4">
                            <div className="flex items-center justify-between mb-2">
                                <h3 className="text-[11px] uppercase tracking-widest" style={{ color: 'var(--ash)' }}>Herramientas de Ajuste</h3>
                                <button 
                                    onClick={handleGenerarAnualidad}
                                    className="flex items-center gap-1 text-[10px] font-bold hover:underline"
                                    style={{ color: 'var(--pb)' }}
                                    disabled={saving}
                                >
                                    <Calendar size={12} /> Generar Año Completo
                                </button>
                            </div>
                            {mensualidades.length > 0 && (
                                <div className="p-4 rounded-2xl flex items-center justify-between mb-2" style={{ background: 'var(--pb-light)', border: '1px solid var(--border-md)' }}>
                                    <div>
                                        <p className="text-[10px] font-black uppercase tracking-wider" style={{ color: 'var(--pb)' }}>Monto Personalizado</p>
                                        <p className="text-[10px]" style={{ color: 'var(--ash)' }}>Cambiar todas las cuotas:</p>
                                    </div>
                                    <input 
                                        type="number" 
                                        placeholder="Ej: 30"
                                        className="w-20 px-3 py-2 rounded-lg text-sm outline-none font-bold text-center" 
                                        style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)' }}
                                        onChange={(e) => handleBulkUpdate(e.target.value)}
                                    />
                                </div>
                            )}

                            {mensualidades?.length > 0 ? (
                                mensualidades.map((m) => (
                                    <div key={m.id} className="p-4 rounded-2xl" style={{ background: 'var(--ash-light)', border: '0.5px solid var(--border)' }}>
                                        <div className="flex items-center justify-between mb-2">
                                            <div>
                                                <p className="font-bold text-sm" style={{ color: 'var(--jet)' }}>{m.mes} {m.anio}</p>
                                                <p className="text-[10px] uppercase font-black" style={{ color: 'var(--ash)' }}>Monto (USD)</p>
                                            </div>

                                            <div className="relative">
                                                <span className="absolute left-3 top-2.5 text-slate-400 text-sm">$</span>
                                                <input 
                                                    type="number" 
                                                    step="0.01"
                                                    className="w-24 pl-6 pr-3 py-2 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-offset-2 outline-none text-sm font-bold text-slate-700"
                                                    value={m.monto_usd}
                                                    onChange={(e) => handleUpdateMonto(m.id, e.target.value)}
                                                />
                                            </div>
                                        </div>
                                        {m.historial && m.historial.length > 0 && (
                                            <div className="pl-4 border-l-2" style={{ borderColor: 'var(--pb)' }}>
                                                <p className="text-[9px] font-bold uppercase mb-1 flex items-center gap-1" style={{ color: 'var(--ash)' }}>
                                                    <History size={10} /> Historial de cambios
                                                </p>
                                                {m.historial.map((h, i) => (
                                                    <p key={i} className="text-[10px] leading-tight" style={{ color: 'var(--ash)' }}>
                                                        {h.fecha} - <span className="font-bold">{h.usuario}</span>: ${h.monto_anterior} → ${h.monto_nuevo}
                                                    </p>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                ))
                            ) : (
                                <p className="text-center py-10 italic" style={{ color: 'var(--ash)' }}>No hay mensualidades pendientes para este alumno.</p>
                            )}
                        </div>
                        <div className="p-6 flex gap-3" style={{ background: 'var(--ash-light)' }}>
                            <button onClick={handleCloseModal} className="flex-1 py-3 rounded-xl font-bold" style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)', color: 'var(--ash)' }}>Cancelar</button>
                            <button onClick={handleSave} disabled={saving || mensualidades.length === 0} className="flex-1 py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all disabled:opacity-50" style={{ background: 'var(--pb)', color: '#fff' }}>
                                <Save size={18} />
                                {saving ? 'Guardando...' : 'Guardar Cambios'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal para editar información de alumno y representante */}
            {showEditModal && (
                <div className="fixed inset-0 backdrop-blur-sm flex items-center justify-center z-50 p-4" style={{ background: 'rgba(43,48,58,0.5)' }}>
                    <div className="rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden animate-fadeIn max-h-[90vh] flex flex-col" style={{ background: 'var(--porcelain)' }}>
                        <div className="p-6 flex justify-between items-center" style={{ borderBottom: '0.5px solid var(--border)', background: 'var(--porcelain)' }}>
                            <h2 className="text-xl font-bold" style={{ color: 'var(--jet)' }}>Editar Información</h2>
                            <button onClick={() => setShowEditModal(false)} className="p-2" style={{ color: 'var(--ash)' }}><X size={24} /></button>
                        </div>
                        
                        <div className="p-8 overflow-y-auto space-y-8">
                            {/* Sección Alumno */} 
                            <section className="space-y-4">
                                <div className="flex items-center gap-2 border-b pb-2" style={{ borderColor: 'var(--border)' }}>
                                    <GraduationCap size={20} style={{ color: 'var(--pb)' }} />
                                    <h3 className="font-bold uppercase text-xs tracking-widest" style={{ color: 'var(--jet)' }}>Datos del Estudiante</h3>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>Nombres</label>
                                        <input type="text" className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)' }} value={editForm.nombre} onChange={(e) => setEditForm({...editForm, nombre: e.target.value})} />
                                    </div>
                                    <div>
                                        <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>Apellidos</label>
                                        <input type="text" className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)' }} value={editForm.apellido} onChange={(e) => setEditForm({...editForm, apellido: e.target.value})} />
                                    </div>
                                    <div>
                                        <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>Cédula Escolar</label>
                                        <input type="text" className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)' }} value={editForm.cedula_escolar} onChange={(e) => setEditForm({...editForm, cedula_escolar: e.target.value})} />
                                    </div>
                                    <div>
                                        <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>Grado / Año</label>
                                        <select className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)' }} value={editForm.grado_seccion} onChange={(e) => setEditForm({...editForm, grado_seccion: e.target.value})}>
                                            <optgroup label="Primaria">
                                                {['1er Grado', '2do Grado', '3er Grado', '4to Grado', '5to Grado', '6to Grado'].map(g => <option key={g} value={g}>{g}</option>)}
                                            </optgroup>
                                            <optgroup label="Media General">
                                                {['1er Año', '2do Año', '3er Año', '4to Año', '5to Año'].map(g => <option key={g} value={g}>{g}</option>)}
                                            </optgroup>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>Fecha de Nacimiento</label>
                                        <DatePickerES className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)' }} value={editForm.fecha_nacimiento} onChange={(e) => setEditForm({...editForm, fecha_nacimiento: e.target.value})} />
                                    </div>
                                    <div>
                                        <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>Género</label>
                                        <select className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)' }} value={editForm.genero} onChange={(e) => setEditForm({...editForm, genero: e.target.value})}>
                                            <option value="">Seleccione...</option>
                                            <option value="masculino">Masculino</option>
                                            <option value="femenino">Femenino</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>Estatus Financiero</label>
                                        <select className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)' }} value={editForm.estatus_financiero} onChange={(e) => setEditForm({...editForm, estatus_financiero: e.target.value})}>
                                            <option value="solvente">Solvente</option>
                                            <option value="mora">Moroso</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>Porcentaje Beca (%)</label>
                                        <input type="number" min="0" max="100" className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)' }} value={editForm.porcentaje_beca} onChange={(e) => setEditForm({...editForm, porcentaje_beca: e.target.value})} />
                                    </div>
                                </div>
                            </section>

                            {/* Sección Representante */}
                            <section className="space-y-4">
                                <div className="flex items-center gap-2 border-b pb-2" style={{ borderColor: 'var(--border)' }}>
                                    <UserCircle size={20} style={{ color: 'var(--pb)' }} />
                                    <h3 className="font-bold uppercase text-xs tracking-widest" style={{ color: 'var(--jet)' }}>Datos del Representante</h3>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>Nombres</label>
                                        <input type="text" className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)' }} value={editForm.rep_nombre || ''} onChange={(e) => setEditForm({...editForm, rep_nombre: e.target.value})} />
                                    </div>
                                    <div>
                                        <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>Apellidos</label>
                                        <input type="text" className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)' }} value={editForm.rep_apellido || ''} onChange={(e) => setEditForm({...editForm, rep_apellido: e.target.value})} />
                                    </div>
                                    <div>
                                        <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>Cédula</label>
                                        <input type="text" className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)' }} value={editForm.rep_cedula || ''} onChange={(e) => setEditForm({...editForm, rep_cedula: e.target.value})} />
                                    </div>
                                    <div>
                                        <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>Teléfono</label>
                                        <input type="text" className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)' }} value={editForm.rep_telefono || ''} onChange={(e) => setEditForm({...editForm, rep_telefono: e.target.value})} />
                                    </div>
                                    <div className="md:col-span-2">
                                        <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>Correo Electrónico</label>
                                        <input type="email" className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)' }} value={editForm.rep_correo || ''} onChange={(e) => setEditForm({...editForm, rep_correo: e.target.value})} />
                                    </div>
                                    <div className="md:col-span-2">
                                        <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>Dirección de Habitación</label>
                                        <textarea rows="2" className="w-full px-3 py-2 rounded-lg text-sm outline-none resize-none" style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)' }} value={editForm.rep_direccion || ''} onChange={(e) => setEditForm({...editForm, rep_direccion: e.target.value})} />
                                    </div>
                                </div>
                            </section>
                        </div>

                        <div className="p-6 border-t flex gap-3" style={{ background: 'var(--ash-light)', borderTop: '0.5px solid var(--border)' }}>
                            <button type="button" onClick={() => setShowEditModal(false)} className="flex-1 py-3 rounded-xl font-bold transition-all" style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)', color: 'var(--ash)' }}>Cancelar</button>
                            <button type="button" onClick={handleSaveEdit} disabled={saving} className="flex-1 py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all disabled:opacity-50" style={{ background: 'var(--pb)', color: '#fff' }}>
                                {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                                {saving ? 'Guardando...' : 'Guardar Cambios'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal Registrar Alumno */}
            {showRegisterModal && (
                <div className="fixed inset-0 backdrop-blur-sm flex items-center justify-center z-50 p-4" style={{ background: 'rgba(43,48,58,0.5)' }}>
                    <div className="rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden animate-fadeIn max-h-[90vh] flex flex-col" style={{ background: 'var(--porcelain)' }}>
                        <div className="p-6 flex justify-between items-center" style={{ borderBottom: '0.5px solid var(--border)', background: 'var(--pb)', color: '#fff' }}>
                            <h2 className="text-xl font-bold">Registrar en Banco Estudiantil</h2>
                            <button onClick={handleCloseRegisterModal} style={{ color: '#fff' }}><X size={24} /></button>
                        </div>
                        <form onSubmit={handleRegister} className="p-8 overflow-y-auto space-y-8">
                            <section className="space-y-4">
                                <h3 className="text-xs font-black uppercase tracking-widest border-b pb-2 flex items-center gap-2" style={{ borderColor: 'var(--border)' }}>
                                    <GraduationCap size={16} style={{ color: 'var(--pb)' }} />
                                    <span style={{ color: 'var(--jet)' }}>Datos del Estudiante</span>
                                </h3>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>Nombres</label>
                                        <input type="text" className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)' }} required onChange={(e) => setRegisterForm({...registerForm, nombre: e.target.value})} />
                                    </div>
                                    <div>
                                        <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>Apellidos</label>
                                        <input type="text" className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)' }} required onChange={(e) => setRegisterForm({...registerForm, apellido: e.target.value})} />
                                    </div>
                                    <div>
                                        <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>Cédula (Opcional)</label>
                                        <input type="text" className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)' }} onChange={(e) => setRegisterForm({...registerForm, cedula_escolar: e.target.value})} />
                                    </div>
                                    <div>
                                        <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>Fecha Nacimiento</label>
                                        <DatePickerES className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)' }} value={registerForm.fecha_nacimiento} required onChange={(e) => setRegisterForm({...registerForm, fecha_nacimiento: e.target.value})} />
                                    </div>
                                    <div>
                                        <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>Género</label>
                                        <select className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)' }} value={registerForm.genero} onChange={(e) => setRegisterForm({...registerForm, genero: e.target.value})}>
                                            <option value="masculino">Masculino</option>
                                            <option value="femenino">Femenino</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>Porcentaje Beca (%)</label>
                                        <input type="number" min="0" max="100" className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)' }} value={registerForm.porcentaje_beca} onChange={(e) => setRegisterForm({...registerForm, porcentaje_beca: e.target.value})} />
                                    </div>
                                </div>
                            </section>
                            <section className="space-y-4">
                                <h3 className="text-xs font-black uppercase tracking-widest border-b pb-2 flex items-center gap-2" style={{ borderColor: 'var(--border)' }}>
                                    <UserCircle size={16} style={{ color: 'var(--pb)' }} />
                                    <span style={{ color: 'var(--jet)' }}>Datos del Representante</span>
                                </h3>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="col-span-2">
                                        <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>Cédula</label>
                                        <div className="relative">
                                            <input type="text" className="w-full px-3 py-2 rounded-lg text-sm outline-none" 
                                                style={{ border: '0.5px solid var(--border-md)', background: repFound ? 'var(--porcelain)' : '#fff', color: 'var(--jet)' }} 
                                                required value={registerForm.rep_cedula} readOnly={repFound}
                                                onChange={(e) => setRegisterForm({...registerForm, rep_cedula: e.target.value})} />
                                            {checkingRep && <Loader2 size={16} className="absolute right-3 top-2.5 animate-spin" style={{ color: 'var(--pb)' }} />}
                                            {repFound && (
                                                <button type="button" onClick={handleLimpiarRepresentante} 
                                                    className="absolute right-2 top-1.5 px-2 py-1 text-[10px] font-bold rounded-md"
                                                    style={{ background: 'var(--red-light)', color: 'var(--red)' }}>
                                                    Limpiar
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>Nombres</label>
                                        <input type="text" className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={{ border: '0.5px solid var(--border-md)', background: repFound ? 'var(--porcelain)' : '#fff', color: 'var(--jet)' }} required value={registerForm.rep_nombre} readOnly={repFound} onChange={(e) => setRegisterForm({...registerForm, rep_nombre: e.target.value})} />
                                    </div>
                                    <div>
                                        <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>Apellidos</label>
                                        <input type="text" className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={{ border: '0.5px solid var(--border-md)', background: repFound ? 'var(--porcelain)' : '#fff', color: 'var(--jet)' }} required value={registerForm.rep_apellido} readOnly={repFound} onChange={(e) => setRegisterForm({...registerForm, rep_apellido: e.target.value})} />
                                    </div>
                                    <div>
                                        <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>Teléfono</label>
                                        <input type="text" className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={{ border: '0.5px solid var(--border-md)', background: repFound ? 'var(--porcelain)' : '#fff', color: 'var(--jet)' }} required value={registerForm.rep_telefono} readOnly={repFound} onChange={(e) => setRegisterForm({...registerForm, rep_telefono: e.target.value})} />
                                    </div>
                                    <div>
                                        <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>Correo</label>
                                        <input type="email" className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={{ border: '0.5px solid var(--border-md)', background: repFound ? 'var(--porcelain)' : '#fff', color: 'var(--jet)' }} required value={registerForm.rep_correo} readOnly={repFound} onChange={(e) => setRegisterForm({...registerForm, rep_correo: e.target.value})} />
                                    </div>
                                    <div className="col-span-2">
                                        <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>Dirección</label>
                                        <input type="text" className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={{ border: '0.5px solid var(--border-md)', background: repFound ? 'var(--porcelain)' : '#fff', color: 'var(--jet)' }} required value={registerForm.rep_direccion} readOnly={repFound} onChange={(e) => setRegisterForm({...registerForm, rep_direccion: e.target.value})} />
                                    </div>
                                </div>
                            </section>
                            <button type="submit" disabled={saving} className="w-full py-4 rounded-2xl font-bold flex items-center justify-center gap-2 transition-all text-white" style={{ background: 'var(--pb)' }}>
                                {saving ? <Loader2 className="animate-spin" /> : <Save size={20} />}
                                {saving ? 'Procesando...' : 'Guardar en Banco de Alumnos'}
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {/* Panel Lateral: Ficha del Alumno */}
            {showFichaSidebar && selectedAlumno && (
                <div className="fixed inset-0 z-[60] flex justify-end">
                    <div className="absolute inset-0 backdrop-blur-sm" style={{ background: 'rgba(43,48,58,0.4)' }} onClick={() => setShowFichaSidebar(false)} />
                    <div className="relative w-full max-w-md h-full shadow-2xl animate-slideInRight p-8 overflow-y-auto" style={{ background: 'var(--porcelain)' }}>
                        <button onClick={() => setShowFichaSidebar(false)} className="absolute top-6 right-6 p-2 rounded-full" style={{ background: 'var(--ash-light)', color: 'var(--ash)' }}><X size={20}/></button>
                        
                        <div className="text-center mb-10">
                            <div className="w-24 h-24 rounded-3xl flex items-center justify-center mx-auto mb-4 border-2" style={{ background: 'var(--pb-light)', color: 'var(--pb)', borderColor: 'var(--border)' }}>
                                <User size={48} />
                            </div>
                            <h2 className="text-2xl font-black uppercase tracking-tighter" style={{ color: 'var(--jet)' }}>{selectedAlumno.nombre} {selectedAlumno.apellido}</h2>
                            <p className="font-bold" style={{ color: 'var(--ash)' }}>Cédula: {selectedAlumno.cedula_escolar || 'Temporal'}</p>
                            <div className="mt-2">{getEstadoBadge(selectedAlumno)}</div>
                        </div>

                        <div className="space-y-8">
                            <section>
                                <h4 className="text-[11px] uppercase tracking-widest mb-4 flex items-center gap-2" style={{ color: 'var(--ash)' }}><Info size={14} /> <span style={{ color: 'var(--jet)' }}>Detalles Académicos</span></h4>
                                <div className="space-y-3">
                                    <div className="flex justify-between items-center p-3 rounded-xl" style={{ background: 'var(--ash-light)' }}>
                                        <span className="text-xs font-medium" style={{ color: 'var(--ash)' }}>Grado Actual</span>
                                    <span className="text-xs font-black" style={{ color: 'var(--jet)' }}>{selectedAlumno.grado_seccion ? selectedAlumno.grado_seccion.split(' - ')[0] : 'PENDIENTE'}</span>
                                    </div>
                                    <div className="flex justify-between items-center p-3 rounded-xl" style={{ background: 'var(--ash-light)' }}>
                                        <span className="text-xs font-medium" style={{ color: 'var(--ash)' }}>Estatus de Pago</span>
                                        <span className="text-xs font-black uppercase" style={{ color: selectedAlumno.estatus_financiero === 'solvente' ? '#16a34a' : 'var(--red)' }}>{selectedAlumno.estatus_financiero}</span>
                                    </div>
                                </div>
                            </section>

                            <section>
                                <h4 className="text-[11px] uppercase tracking-widest mb-4 flex items-center gap-2" style={{ color: 'var(--ash)' }}><UserCircle size={14} /> <span style={{ color: 'var(--jet)' }}>Representante Legal</span></h4>
                                <div className="p-5 rounded-2xl space-y-4" style={{ background: 'var(--pb-light)', border: '0.5px solid var(--border)' }}>
                                    <div>
                                        <p className="text-[9px] font-black uppercase" style={{ color: 'var(--pb)' }}>Nombre</p>
                                        <p className="text-sm font-bold" style={{ color: 'var(--jet)' }}>{selectedAlumno.representante?.nombre} {selectedAlumno.representante?.apellido}</p>
                                    </div>
                                    <div>
                                        <p className="text-[9px] font-black uppercase" style={{ color: 'var(--pb)' }}>Contacto</p>
                                        <p className="text-sm font-bold" style={{ color: 'var(--jet)' }}>{selectedAlumno.representante?.telefono}</p>
                                        <p className="text-xs" style={{ color: 'var(--ash)' }}>{selectedAlumno.representante?.correo}</p>
                                    </div>
                                </div>
                            </section>
                        </div>

                        <div className="mt-12 space-y-3">
                            <button 
                                onClick={() => navigate(`/cobranza?cedula=${selectedAlumno.cedula_escolar}`)}
                                className="w-full py-4 text-white rounded-2xl font-bold flex items-center justify-center gap-2"
                                style={{ background: 'var(--pb)' }}
                            >
                                <DollarSign size={18}/> Ver Estado de Cuenta
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal Asignar Grado */}
            {showAsignarGradoModal && (
                <div className="fixed inset-0 backdrop-blur-sm flex items-center justify-center z-50 p-4" style={{ background: 'rgba(43,48,58,0.5)' }}>
                    <div className="rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden animate-fadeIn" style={{ background: 'var(--porcelain)' }}>
                        <div className="p-6 flex justify-between items-center" style={{ borderBottom: '0.5px solid var(--border)' }}>
                            <h3 className="font-bold" style={{ color: 'var(--jet)' }}>Asignar Grado / Año</h3>
                            <button onClick={() => setShowAsignarGradoModal(false)} style={{ color: 'var(--ash)' }}><X size={20}/></button>
                        </div>
                        <div className="p-6 space-y-4">
                            <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>Seleccione Nivel Escolar</label>
                            <select 
                                className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)' }}
                                value={nuevoGrado}
                                onChange={(e) => setNuevoGrado(e.target.value)}
                            >
                                <option value="">Seleccionar grado...</option>
                                <optgroup label="Primaria">
                                    {['1er Grado', '2do Grado', '3er Grado', '4to Grado', '5to Grado', '6to Grado'].map(g => <option key={g} value={g}>{g}</option>)}
                                </optgroup>
                                <optgroup label="Media General">
                                    {['1er Año', '2do Año', '3er Año', '4to Año', '5to Año'].map(g => <option key={g} value={g}>{g}</option>)}
                                </optgroup>
                            </select>
                            <button 
                                onClick={handleAsignarGrado}
                                disabled={saving || !nuevoGrado}
                                className="w-full py-4 rounded-2xl font-bold flex items-center justify-center gap-2 disabled:opacity-50 text-white" style={{ background: '#16a34a' }}
                            >
                                {saving ? <Loader2 className="animate-spin"/> : <UserCheck size={18}/>}
                                Confirmar Asignación
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal Retiro */}
            {showRetirarModal && (
                <div className="fixed inset-0 backdrop-blur-sm flex items-center justify-center z-50 p-4" style={{ background: 'rgba(43,48,58,0.5)' }}>
                    <div className="rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden animate-fadeIn" style={{ background: 'var(--porcelain)' }}>
                        <div className="p-6 flex justify-between items-center" style={{ background: 'var(--red-light)', color: 'var(--red)' }}>
                            <h3 className="font-bold">Procesar Retiro</h3>
                            <button onClick={() => setShowRetirarModal(false)} style={{ color: 'var(--red)' }}><X size={20}/></button>
                        </div>
                        <div className="p-6 space-y-4">
                            <p className="text-sm" style={{ color: 'var(--ash)' }}>¿Está seguro de retirar a <span className="font-bold" style={{ color: 'var(--jet)' }}>{selectedAlumno?.nombre}</span>? El cupo en su sección será liberado.</p>
                            <textarea 
                                className="w-full px-3 py-2 rounded-lg text-sm outline-none resize-none" style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)' }}
                                placeholder="Motivo del retiro..."
                                rows="3"
                                value={motivoRetiro}
                                onChange={(e) => setMotivoRetiro(e.target.value)}
                            />
                            <button 
                                onClick={handleRetirar}
                                disabled={saving}
                                className="w-full py-4 rounded-2xl font-bold flex items-center justify-center gap-2 text-white" style={{ background: 'var(--red)' }}
                            >
                                {saving ? <Loader2 className="animate-spin"/> : <Trash2 size={18}/>}
                                Confirmar Retiro
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ListaAlumnos;