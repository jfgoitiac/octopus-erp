import { useState, useCallback, useEffect, useMemo } from 'react';
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

const NULLABLE_FIELDS = ['horas_semanales', 'anos_servicio', 'fecha_ingreso'];

function cleanNullables(payload) {
    NULLABLE_FIELDS.forEach(f => { if (payload[f] === '') payload[f] = null; });
}

// El formulario usa dd/MM/yyyy; Django espera YYYY-MM-DD
function normalizeFechas(payload) {
    if (payload.fecha_ingreso && /^\d{2}\/\d{2}\/\d{4}$/.test(payload.fecha_ingreso)) {
        const [d, m, y] = payload.fecha_ingreso.split('/');
        payload.fecha_ingreso = `${y}-${m}-${d}`;
    }
}

export function useNomina() {
    const [empleados,    setEmpleados]    = useState([]);
    const [bancosNomina, setBancosNomina] = useState([]);
    const [loading,      setLoading]      = useState(true);
    const [busqueda,     setBusqueda]     = useState('');

    const [exportingExcel, setExportingExcel] = useState(false);

    // ── Registro ──────────────────────────────────────────────────────────────
    const [showRegisterModal, setShowRegisterModal] = useState(false);
    const [newEmployeeData,   setNewEmployeeData]   = useState(EMPTY_EMP);
    const [isRegistering,     setIsRegistering]     = useState(false);

    // ── Edición ───────────────────────────────────────────────────────────────
    const [showEditModal,    setShowEditModal]    = useState(false);
    const [editEmployeeData, setEditEmployeeData] = useState(null);
    const [isSaving,         setIsSaving]         = useState(false);

    // ── Carga inicial ─────────────────────────────────────────────────────────
    const fetchData = useCallback(async (signal) => {
        setLoading(true);
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
            if (msg) toast.error(msg);
        } finally {
            setLoading(false);
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
    };

    const handleRegisterEmployee = async (e) => {
        e.preventDefault();
        const { nombre, apellido, cedula, cargo } = newEmployeeData;
        if (!nombre.trim() || !apellido.trim()) {
            toast.warning('Nombre y apellido son obligatorios.'); return;
        }
        if (!cedula.trim()) {
            toast.warning('La cédula es obligatoria.'); return;
        }
        if (!validarCedula(cedula)) {
            toast.warning('Formato de cédula inválido. Usa V-12345678 o E-12345678.'); return;
        }
        if (!cargo.trim()) {
            toast.warning('El cargo es obligatorio.'); return;
        }
        setIsRegistering(true);
        try {
            const payload = { ...newEmployeeData };
            if (!payload.banco) payload.banco = null;
            cleanNullables(payload);
            normalizeFechas(payload);
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
        setShowRegisterModal(true);
    };

    const handleCloseRegisterModal = () => {
        setShowRegisterModal(false);
        setNewEmployeeData(EMPTY_EMP);
    };

    // ── Handlers edición ──────────────────────────────────────────────────────
    const handleOpenEditModal = (emp) => {
        setEditEmployeeData({
            id:                emp.id,
            nombre:            emp.nombre           || '',
            apellido:          emp.apellido         || '',
            cedula:            emp.cedula           || '',
            cargo:             emp.cargo            || '',
            tipo_personal:     emp.tipo_personal    || 'docente',
            fecha_ingreso:     emp.fecha_ingreso    || '',
            titulo:            emp.titulo           || '',
            categoria_docente: emp.categoria_docente || '',
            anos_servicio:     emp.anos_servicio    || '',
            numero_hijos:      emp.numero_hijos     ?? '0',
            nivel:             emp.nivel            || '',
            horas_semanales:   emp.horas_semanales  || '',
            banco:             emp.banco            ?? '',
            numero_cuenta:     emp.numero_cuenta    || '',
            tipo_cuenta:       emp.tipo_cuenta      || '',
            telefono:          emp.telefono         || '',
            correo:            emp.correo           || '',
        });
        setShowEditModal(true);
    };

    const handleEditChange = (e) => {
        const { name, value } = e.target;
        setEditEmployeeData(prev => ({ ...prev, [name]: value }));
    };

    const handleSaveEmployee = async (e) => {
        e.preventDefault();
        if (!editEmployeeData) return;
        const { nombre, apellido, cedula, cargo } = editEmployeeData;
        if (!nombre.trim() || !apellido.trim()) {
            toast.warning('Nombre y apellido son obligatorios.'); return;
        }
        if (!cedula.trim()) {
            toast.warning('La cédula es obligatoria.'); return;
        }
        if (!validarCedula(cedula)) {
            toast.warning('Formato de cédula inválido. Usa V-12345678 o E-12345678.'); return;
        }
        if (!cargo.trim()) {
            toast.warning('El cargo es obligatorio.'); return;
        }
        setIsSaving(true);
        try {
            const id      = editEmployeeData.id;
            const payload = { ...editEmployeeData };
            delete payload.id;
            if (!payload.banco) payload.banco = null;
            cleanNullables(payload);
            normalizeFechas(payload);
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
        } catch { toast.error('No se pudo generar el Excel de nómina.'); }
        finally { setExportingExcel(false); }
    };

    return {
        // Datos
        empleados, bancosNomina, loading,
        busqueda, setBusqueda, empleadosPorTab,
        refetch: fetchData,
        // Exportar
        exportingExcel, handleExportExcel,
        // Registro
        showRegisterModal, setShowRegisterModal,
        newEmployeeData, handleNewChange,
        isRegistering, handleRegisterEmployee, handleOpenRegisterModal, handleCloseRegisterModal,
        // Edición
        showEditModal, editEmployeeData, handleEditChange,
        isSaving, handleOpenEditModal, handleSaveEmployee, handleCloseEditModal,
    };
}
