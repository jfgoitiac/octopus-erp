import { useState, useCallback, useEffect } from 'react';
import axiosInstance from '../api/apiClient';
import { toast } from 'react-toastify';

const INITIAL_REGISTER_FORM = {
    nombre: '', apellido: '', cedula_escolar: '', fecha_nacimiento: '', genero: 'masculino',
    porcentaje_beca: 0,
    rep_cedula: '', rep_nombre: '', rep_apellido: '', rep_telefono: '', rep_correo: '', rep_direccion: '',
};

const INITIAL_EDIT_FORM = {
    id: '', nombre: '', apellido: '', cedula_escolar: '', grado_seccion: '',
    fecha_nacimiento: '', estatus_financiero: '', porcentaje_beca: '', genero: '',
    rep_id: '', rep_nombre: '', rep_apellido: '', rep_cedula: '',
    rep_telefono: '', rep_correo: '', rep_direccion: '',
};

function parseApiError(err) {
    const data = err.response?.data;
    if (!data) return 'Error de conexión.';
    if (data.error) return data.error;
    if (data.detail) return data.detail;
    if (typeof data === 'object') {
        return Object.entries(data)
            .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : JSON.stringify(v)}`)
            .join(' | ');
    }
    return 'Error inesperado.';
}

export function useAlumnos() {
    // --- Lista ---
    const [alumnos, setAlumnos] = useState([]);
    const [busqueda, setBusqueda] = useState('');
    const [mostrarInactivos, setMostrarInactivos] = useState(false);
    const [loading, setLoading] = useState(true);

    // --- Configuración montos ---
    const [montoDefecto, setMontoDefecto] = useState('35.00');
    const [montoInscripcion, setMontoInscripcion] = useState('50.00');
    const [savingConfig, setSavingConfig] = useState(false);

    // --- Export ---
    const [exportingExcel, setExportingExcel] = useState(false);

    // --- Selección activa ---
    const [selectedAlumno, setSelectedAlumno] = useState(null);

    // --- Registro ---
    const [registerForm, setRegisterForm] = useState(INITIAL_REGISTER_FORM);
    const [checkingRep, setCheckingRep] = useState(false);
    const [repFound, setRepFound] = useState(false);
    const [savingRegister, setSavingRegister] = useState(false);
    const [showRegisterModal, setShowRegisterModal] = useState(false);

    // --- Edición --- (C-1 fix: editingId rastrea qué fila está cargando)
    const [editForm, setEditForm] = useState(INITIAL_EDIT_FORM);
    const [editingId, setEditingId] = useState(null);
    const [editModalLoading, setEditModalLoading] = useState(false);
    const [showEditModal, setShowEditModal] = useState(false);
    const [savingEdit, setSavingEdit] = useState(false);

    // --- Asignar grado ---
    const [nuevoGrado, setNuevoGrado] = useState('');
    const [savingGrado, setSavingGrado] = useState(false);
    const [showAsignarGradoModal, setShowAsignarGradoModal] = useState(false);

    // --- Retirar ---
    const [motivoRetiro, setMotivoRetiro] = useState('');
    const [savingRetiro, setSavingRetiro] = useState(false);
    const [showRetirarModal, setShowRetirarModal] = useState(false);

    // --- Reactivar (reemplaza window.confirm) ---
    const [alumnoParaReactivar, setAlumnoParaReactivar] = useState(null);
    const [savingReactivar, setSavingReactivar] = useState(false);

    // C-3 fix: AbortController para cancelar requests en vuelo
    const fetchData = useCallback(async (signal) => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            if (mostrarInactivos) params.append('todos', 'true');
            if (busqueda) params.append('buscar', busqueda);

            const [resAlumnos, resConfig] = await Promise.all([
                axiosInstance.get(`secretaria/alumnos/?${params.toString()}`, { signal }),
                axiosInstance.get('cobranza/configuracion/', { signal }),
            ]);
            setAlumnos(resAlumnos?.data || []);
            setMontoDefecto(resConfig?.data?.monto_defecto || '35.00');
            setMontoInscripcion(resConfig?.data?.monto_inscripcion || '50.00');
        } catch (err) {
            if (err.name === 'CanceledError' || err.code === 'ERR_CANCELED') return;
            toast.error(parseApiError(err));
        } finally {
            setLoading(false);
        }
    }, [mostrarInactivos, busqueda]);

    useEffect(() => {
        const controller = new AbortController();
        const timer = setTimeout(() => fetchData(controller.signal), 500);
        return () => { clearTimeout(timer); controller.abort(); };
    }, [fetchData]);

    // Autocomplete de representante por cédula
    useEffect(() => {
        if (registerForm.rep_cedula.length <= 6 || repFound || !showRegisterModal) return;
        const timer = setTimeout(() => verificarRepresentante(registerForm.rep_cedula), 800);
        return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [registerForm.rep_cedula, repFound, showRegisterModal]);

    const verificarRepresentante = async (cedula) => {
        setCheckingRep(true);
        try {
            const res = await axiosInstance.get(`secretaria/representante/${cedula}/`);
            if (res.data.existe) {
                const rep = res.data;
                setRegisterForm(prev => ({
                    ...prev,
                    rep_nombre: rep.nombre || '',
                    rep_apellido: rep.apellido || '',
                    rep_telefono: rep.telefono || '',
                    rep_correo: rep.correo || '',
                    rep_direccion: rep.direccion || '',
                }));
                setRepFound(true);
                toast.info('Representante encontrado. Datos precargados.');
            }
        } catch (err) {
            if (err.response?.status !== 404) toast.error('Error al verificar representante.');
            setRepFound(false);
        } finally {
            setCheckingRep(false);
        }
    };

    // C-4 fix: savingConfig previene doble envío
    const handleSaveConfig = async () => {
        setSavingConfig(true);
        try {
            await axiosInstance.post('cobranza/configuracion/', {
                monto_defecto: montoDefecto,
                monto_inscripcion: montoInscripcion,
            });
            toast.success('Configuración actualizada globalmente.');
        } catch (err) {
            toast.error(parseApiError(err));
        } finally {
            setSavingConfig(false);
        }
    };

    const handleExportExcel = async () => {
        setExportingExcel(true);
        try {
            const params = new URLSearchParams();
            if (busqueda.trim()) params.append('buscar', busqueda.trim());
            const res = await axiosInstance.get(
                `secretaria/exportar-alumnos-excel/?${params}`,
                { responseType: 'blob' }
            );
            const url = URL.createObjectURL(
                new Blob([res.data], {
                    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                })
            );
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

    const handleCloseRegisterModal = () => {
        setShowRegisterModal(false);
        setRepFound(false);
        setRegisterForm(INITIAL_REGISTER_FORM);
    };

    const handleLimpiarRepresentante = () => {
        setRepFound(false);
        setRegisterForm(prev => ({
            ...prev,
            rep_cedula: '', rep_nombre: '', rep_apellido: '',
            rep_telefono: '', rep_correo: '', rep_direccion: '',
        }));
    };

    const handleRegister = async (e) => {
        e.preventDefault();
        setSavingRegister(true);
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
                    direccion: registerForm.rep_direccion,
                },
            };
            await axiosInstance.post('secretaria/alumnos/', payload);
            toast.success('Alumno registrado en el banco exitosamente.');
            handleCloseRegisterModal();
            fetchData();
        } catch (err) {
            toast.error(parseApiError(err));
        } finally {
            setSavingRegister(false);
        }
    };

    // C-1 fix: editingId para rastrear qué fila está cargando
    const handleOpenEditModal = async (alumno) => {
        setEditingId(alumno.id);
        setEditModalLoading(true);
        try {
            const res = await axiosInstance.get(`secretaria/alumnos/${alumno.id}/`);
            const d = res?.data;
            if (d) {
                setEditForm({
                    id: d.id,
                    nombre: d.nombre || '',
                    apellido: d.apellido || '',
                    cedula_escolar: d.cedula_escolar || '',
                    grado_seccion: d.grado_seccion ? d.grado_seccion.split(' - ')[0] : '',
                    fecha_nacimiento: d.fecha_nacimiento || '',
                    genero: d.genero || '',
                    estatus_financiero: d.estatus_financiero || 'solvente',
                    porcentaje_beca: d.porcentaje_beca || 0,
                    rep_id: d.representante?.id || '',
                    rep_nombre: d.representante?.nombre || '',
                    rep_apellido: d.representante?.apellido || '',
                    rep_cedula: d.representante?.cedula || '',
                    rep_telefono: d.representante?.telefono || '',
                    rep_correo: d.representante?.correo || '',
                    rep_direccion: d.representante?.direccion || '',
                });
                setShowEditModal(true);
            }
        } catch (err) {
            toast.error(parseApiError(err) || 'No se pudo cargar la información completa.');
        } finally {
            setEditModalLoading(false);
            setEditingId(null);
        }
    };

    const handleSaveEdit = async () => {
        if (!editForm.id) { toast.error('Error técnico: no se localizó el ID del estudiante.'); return; }
        if (!editForm.nombre || !editForm.apellido || !editForm.rep_nombre || !editForm.rep_cedula) {
            toast.error('Nombre/Apellido del alumno y Nombre/Cédula del representante son obligatorios.');
            return;
        }
        setSavingEdit(true);
        try {
            const payload = {
                nombre: editForm.nombre.trim(),
                apellido: editForm.apellido.trim(),
                cedula_escolar: editForm.cedula_escolar?.trim() || null,
                grado_seccion: editForm.grado_seccion || null,
                fecha_nacimiento: editForm.fecha_nacimiento || null,
                genero: editForm.genero,
                estatus_financiero: editForm.estatus_financiero,
                porcentaje_beca: Number(editForm.porcentaje_beca) || 0,
                representante: {
                    id: editForm.rep_id,
                    cedula: editForm.rep_cedula?.trim(),
                    nombre: editForm.rep_nombre?.trim(),
                    apellido: editForm.rep_apellido?.trim() || '',
                    telefono: editForm.rep_telefono?.trim() || '',
                    correo: editForm.rep_correo?.trim() || '',
                    direccion: editForm.rep_direccion?.trim() || '',
                },
            };
            const response = await axiosInstance.patch(
                `secretaria/alumnos/${editForm.id}/update_info/`, payload
            );
            setAlumnos(prev => prev.map(a => a.id === editForm.id ? response.data : a));
            setShowEditModal(false);
            toast.success('Información actualizada correctamente.');
        } catch (err) {
            toast.error(parseApiError(err));
        } finally {
            setSavingEdit(false);
        }
    };

    const handleAsignarGrado = async () => {
        setSavingGrado(true);
        try {
            await axiosInstance.post(`secretaria/alumnos/${selectedAlumno.id}/asignar_grado/`, {
                grado_seccion: nuevoGrado,
            });
            toast.success(`Grado ${nuevoGrado} asignado correctamente.`);
            setShowAsignarGradoModal(false);
            setNuevoGrado('');
            fetchData();
        } catch (err) {
            toast.error(parseApiError(err) || 'Error al asignar grado.');
        } finally {
            setSavingGrado(false);
        }
    };

    const handleRetirar = async () => {
        setSavingRetiro(true);
        try {
            await axiosInstance.post(`secretaria/alumnos/${selectedAlumno.id}/retirar/`, {
                motivo: motivoRetiro,
            });
            toast.success('Alumno retirado y cupo liberado.');
            setShowRetirarModal(false);
            setMotivoRetiro('');
            fetchData();
        } catch (err) {
            toast.error(parseApiError(err) || 'Error al procesar el retiro.');
        } finally {
            setSavingRetiro(false);
        }
    };

    // UX-3 fix: reemplaza window.confirm con modal controlado
    const solicitarReactivar = (alumno) => setAlumnoParaReactivar(alumno);
    const cancelarReactivar = () => setAlumnoParaReactivar(null);

    const handleReactivar = async () => {
        if (!alumnoParaReactivar) return;
        setSavingReactivar(true);
        try {
            await axiosInstance.post(`secretaria/alumnos/${alumnoParaReactivar.id}/reactivar/`);
            toast.success('Alumno reactivado exitosamente.');
            setAlumnoParaReactivar(null);
            fetchData();
        } catch (err) {
            toast.error(parseApiError(err) || 'Error al intentar reactivar al alumno.');
        } finally {
            setSavingReactivar(false);
        }
    };

    return {
        // Lista
        alumnos, setAlumnos, busqueda, setBusqueda, mostrarInactivos, setMostrarInactivos, loading, fetchData,
        // Config
        montoDefecto, setMontoDefecto, montoInscripcion, setMontoInscripcion, savingConfig, handleSaveConfig,
        // Export
        exportingExcel, handleExportExcel,
        // Selección
        selectedAlumno, setSelectedAlumno,
        // Registro
        registerForm, setRegisterForm, checkingRep, repFound, savingRegister,
        showRegisterModal, setShowRegisterModal,
        handleCloseRegisterModal, handleLimpiarRepresentante, handleRegister,
        // Edición
        editForm, setEditForm, editingId, editModalLoading, showEditModal, setShowEditModal, savingEdit,
        handleOpenEditModal, handleSaveEdit,
        // Asignar grado
        nuevoGrado, setNuevoGrado, savingGrado, showAsignarGradoModal, setShowAsignarGradoModal, handleAsignarGrado,
        // Retirar
        motivoRetiro, setMotivoRetiro, savingRetiro, showRetirarModal, setShowRetirarModal, handleRetirar,
        // Reactivar
        alumnoParaReactivar, savingReactivar, solicitarReactivar, cancelarReactivar, handleReactivar,
    };
}
