import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { format } from 'date-fns';
import axiosInstance from '../api/apiClient';
import { toast } from 'react-toastify';
import { EMPTY_EMP, validarCedula } from '../constants/avec';

function parseApiError(err) {
    if (err.name === 'CanceledError' || err.code === 'ERR_CANCELED') return null;
    const data = err.response?.data;
    if (!data) return 'Error de conexión. Verifica que el servidor esté activo.';
    if (data.detail) return data.detail;
    if (data.error)  return data.error;
    if (typeof data === 'object')
        return Object.entries(data)
            .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`)
            .join(' | ');
    return 'Error inesperado.';
}

const NULLABLE_FIELDS = ['horas_semanales', 'anos_servicio', 'fecha_ingreso', 'sueldo_base'];

function cleanNullables(payload) {
    NULLABLE_FIELDS.forEach(f => { if (payload[f] === '') payload[f] = null; });
}

// Valida los campos comunes del formulario de empleado.
// Retorna un objeto { campo: mensaje } — vacío si no hay errores.
function validarEmpleado({ nombre, apellido, cedula, cargo }) {
    const errs = {};
    if (!nombre.trim())  errs.nombre  = 'El nombre es obligatorio.';
    if (!apellido.trim()) errs.apellido = 'El apellido es obligatorio.';
    if (!cedula.trim())  errs.cedula  = 'La cédula es obligatoria.';
    else if (!validarCedula(cedula)) errs.cedula = 'Formato inválido. Usa V-12345678 o E-12345678.';
    if (!cargo.trim())   errs.cargo   = 'El cargo es obligatorio.';
    return errs;
}

export function useNomina() {
    const [empleados,    setEmpleados]    = useState([]);
    const [bancosNomina, setBancosNomina] = useState([]);
    const [loading,      setLoading]      = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [fetchError,   setFetchError]   = useState(null);
    const [busqueda,     setBusqueda]     = useState('');
    const isFirstLoad = useRef(true);

    const [exportingExcel, setExportingExcel] = useState(false);

    // ── Registro ──────────────────────────────────────────────────────────────
    const [showRegisterModal, setShowRegisterModal] = useState(false);
    const [newEmployeeData,   setNewEmployeeData]   = useState(EMPTY_EMP);
    const [isRegistering,     setIsRegistering]     = useState(false);
    const [registerErrors,    setRegisterErrors]    = useState({});

    // ── Edición ───────────────────────────────────────────────────────────────
    const [showEditModal,    setShowEditModal]    = useState(false);
    const [editEmployeeData, setEditEmployeeData] = useState(null);
    const [isSaving,         setIsSaving]         = useState(false);
    const [editErrors,       setEditErrors]       = useState({});

    // ── Carga inicial / refresco ──────────────────────────────────────────────
    const fetchData = useCallback(async (signal) => {
        if (isFirstLoad.current) {
            setLoading(true);
        } else {
            setIsRefreshing(true);
        }
        setFetchError(null);
        try {
            const opts = signal ? { signal } : {};
            const [resEmp, resBancos] = await Promise.all([
                axiosInstance.get('rrhh/empleados/', opts),
                axiosInstance.get('rrhh/bancos-nomina/?activos=1', opts),
            ]);
            setEmpleados(resEmp.data || []);
            setBancosNomina(resBancos.data || []);
        } catch (err) {
            const msg = parseApiError(err);
            if (msg) {
                toast.error(msg);
                setFetchError(msg);
            }
        } finally {
            isFirstLoad.current = false;
            setLoading(false);
            setIsRefreshing(false);
        }
    }, []);

    useEffect(() => {
        const controller = new AbortController();
        fetchData(controller.signal);
        return () => controller.abort();
    }, [fetchData]);

    // ── Filtro client-side ────────────────────────────────────────────────────
    const empleadosPorTab = useMemo(() => {
        const result = { docente: [], apoyo: [], administrativo: [] };
        const filtro = busqueda.toLowerCase().trim();
        empleados.forEach(e => {
            if (filtro) {
                const texto = `${e.nombre} ${e.apellido} ${e.cedula} ${e.cargo}`.toLowerCase();
                if (!texto.includes(filtro)) return;
            }
            const t = e.tipo_personal || 'docente';
            if (result[t]) result[t].push(e);
            else result.docente.push(e);
        });
        return result;
    }, [empleados, busqueda]);

    // ── Handlers registro ─────────────────────────────────────────────────────
    const handleNewChange = (e) => {
        const { name, value } = e.target;
        setNewEmployeeData(prev => ({ ...prev, [name]: value }));
        setRegisterErrors(prev => (prev[name] ? { ...prev, [name]: undefined } : prev));
    };

    const handleRegisterEmployee = async (e) => {
        e.preventDefault();
        const errs = validarEmpleado(newEmployeeData);
        if (Object.keys(errs).length > 0) {
            setRegisterErrors(errs);
            toast.warning('Revisa los campos marcados.');
            return;
        }
        setIsRegistering(true);
        try {
            const payload = { ...newEmployeeData };
            if (!payload.banco) payload.banco = null;
            cleanNullables(payload);
            await axiosInstance.post('rrhh/empleados/', payload);
            toast.success('Empleado registrado exitosamente.');
            setShowRegisterModal(false);
            setNewEmployeeData(EMPTY_EMP);
            fetchData();
        } catch (err) {
            const msg = parseApiError(err);
            if (msg) toast.error(msg);
        } finally { setIsRegistering(false); }
    };

    const handleOpenRegisterModal = (tipo = 'docente') => {
        setNewEmployeeData({ ...EMPTY_EMP, tipo_personal: tipo });
        setRegisterErrors({});
        setShowRegisterModal(true);
    };

    const handleCloseRegisterModal = () => {
        setShowRegisterModal(false);
        setNewEmployeeData(EMPTY_EMP);
        setRegisterErrors({});
    };

    // ── Handlers edición ──────────────────────────────────────────────────────
    const handleOpenEditModal = (emp) => {
        setEditEmployeeData({
            id:                emp.id,
            nombre:            emp.nombre            || '',
            apellido:          emp.apellido          || '',
            cedula:            emp.cedula            || '',
            cargo:             emp.cargo             || '',
            tipo_personal:     emp.tipo_personal     || 'docente',
            fecha_ingreso:     emp.fecha_ingreso     || '',
            titulo:            emp.titulo            || '',
            categoria_docente: emp.categoria_docente || '',
            anos_servicio:     emp.anos_servicio     || '',
            numero_hijos:      emp.numero_hijos      ?? '0',
            nivel:             emp.nivel             || '',
            horas_semanales:   emp.horas_semanales   || '',
            sueldo_base:       emp.sueldo_base       != null ? String(emp.sueldo_base) : '',
            banco:             emp.banco             ?? '',
            numero_cuenta:     emp.numero_cuenta     || '',
            tipo_cuenta:       emp.tipo_cuenta       || '',
            telefono:          emp.telefono          || '',
            correo:            emp.correo            || '',
        });
        setEditErrors({});
        setShowEditModal(true);
    };

    const handleEditChange = (e) => {
        const { name, value } = e.target;
        setEditEmployeeData(prev => ({ ...prev, [name]: value }));
        setEditErrors(prev => (prev[name] ? { ...prev, [name]: undefined } : prev));
    };

    const handleSaveEmployee = async (e) => {
        e.preventDefault();
        if (!editEmployeeData) return;
        const errs = validarEmpleado(editEmployeeData);
        if (Object.keys(errs).length > 0) {
            setEditErrors(errs);
            toast.warning('Revisa los campos marcados.');
            return;
        }
        setIsSaving(true);
        try {
            const id = editEmployeeData.id;
            const payload = { ...editEmployeeData };
            delete payload.id;
            if (!payload.banco) payload.banco = null;
            cleanNullables(payload);
            await axiosInstance.patch(`rrhh/empleados/${id}/`, payload);
            toast.success('Empleado actualizado exitosamente.');
            setShowEditModal(false);
            setEditEmployeeData(null);
            fetchData();
        } catch (err) {
            const msg = parseApiError(err);
            if (msg) toast.error(msg);
        } finally { setIsSaving(false); }
    };

    const handleCloseEditModal = () => {
        setShowEditModal(false);
        setEditEmployeeData(null);
        setEditErrors({});
    };

    // ── Exportaciones ─────────────────────────────────────────────────────────
    const handleExportExcel = async () => {
        setExportingExcel(true);
        try {
            const res = await axiosInstance.get('rrhh/empleados/exportar_excel/', { responseType: 'blob' });
            const url = URL.createObjectURL(new Blob([res.data], {
                type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            }));
            const a = Object.assign(document.createElement('a'), {
                href: url, download: `nomina_${format(new Date(), 'yyyy-MM-dd')}.xlsx`,
            });
            document.body.appendChild(a); a.click(); document.body.removeChild(a);
            URL.revokeObjectURL(url);
            toast.success('Archivo Excel descargado.');
        } catch (err) {
            // Con responseType:'blob' el cuerpo del error llega como Blob, no JSON
            let msg = 'Error al exportar el Excel.';
            if (err.response?.data instanceof Blob) {
                try {
                    const text = await err.response.data.text();
                    const json = JSON.parse(text);
                    msg = json.error || json.detail || msg;
                } catch { /* usar mensaje por defecto */ }
            } else {
                msg = parseApiError(err) || msg;
            }
            toast.error(msg);
        } finally { setExportingExcel(false); }
    };

    return {
        // Datos
        empleados, bancosNomina, loading, isRefreshing, fetchError,
        busqueda, setBusqueda, empleadosPorTab,
        refetch: fetchData,
        // Exportar
        exportingExcel, handleExportExcel,
        // Registro
        showRegisterModal, setShowRegisterModal,
        newEmployeeData, handleNewChange, registerErrors,
        isRegistering, handleRegisterEmployee, handleOpenRegisterModal, handleCloseRegisterModal,
        // Edición
        showEditModal, editEmployeeData, handleEditChange, editErrors,
        isSaving, handleOpenEditModal, handleSaveEmployee, handleCloseEditModal,
    };
}
