import { useState, useCallback, useEffect } from 'react';
import axiosInstance from '../api/apiClient';
import { toast } from 'react-toastify';

const FORM_EMPTY = { nombre: '', apellido: '', cedula: '', telefono: '', correo: '', direccion: '' };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

export function useRepresentantes() {
    // --- Lista ---
    const [representantes, setRepresentantes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [busqueda, setBusqueda] = useState('');
    const [minHijos, setMinHijos] = useState('');

    // --- Export ---
    const [exportingExcel, setExportingExcel] = useState(false);

    // --- Ficha lateral ---
    const [selectedRep, setSelectedRep] = useState(null);
    const [fichaAlumnos, setFichaAlumnos] = useState([]);
    const [fichaLoading, setFichaLoading] = useState(false);

    // --- Modal crear/editar ---
    const [showModal, setShowModal] = useState(false);
    const [editando, setEditando] = useState(null);
    const [form, setForm] = useState(FORM_EMPTY);
    const [formErrors, setFormErrors] = useState({});
    const [saving, setSaving] = useState(false);

    // --- Confirmar eliminar ---
    const [confirmDelete, setConfirmDelete] = useState(null);
    const [deleting, setDeleting] = useState(false);

    // AbortController + debounce para evitar race conditions
    const fetchRepresentantes = useCallback(async (signal) => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            if (busqueda.trim()) params.append('buscar', busqueda.trim());
            if (minHijos) params.append('min_hijos', minHijos);
            const res = await axiosInstance.get(`secretaria/representantes/?${params}`, { signal });
            setRepresentantes(res.data?.results ?? res.data ?? []);
        } catch (err) {
            if (err.name === 'CanceledError' || err.code === 'ERR_CANCELED') return;
            toast.error('Error al cargar la lista de representantes.');
        } finally {
            setLoading(false);
        }
    }, [busqueda, minHijos]);

    useEffect(() => {
        const controller = new AbortController();
        const t = setTimeout(() => fetchRepresentantes(controller.signal), 300);
        return () => { clearTimeout(t); controller.abort(); };
    }, [fetchRepresentantes]);

    const openFicha = async (rep) => {
        setSelectedRep(rep);
        setFichaAlumnos([]);
        setFichaLoading(true);
        try {
            const res = await axiosInstance.get(`secretaria/representante/${rep.cedula}/alumnos/`);
            setFichaAlumnos(res.data?.alumnos ?? []);
        } catch {
            setFichaAlumnos([]);
            toast.error('No se pudieron cargar los alumnos del representante.');
        } finally {
            setFichaLoading(false);
        }
    };

    const closeFicha = () => { setSelectedRep(null); setFichaAlumnos([]); };

    const openCrear = () => {
        setEditando(null);
        setForm(FORM_EMPTY);
        setFormErrors({});
        setShowModal(true);
    };

    const openEditar = (rep) => {
        setEditando(rep);
        setForm({
            nombre:    rep.nombre    || '',
            apellido:  rep.apellido  || '',
            cedula:    rep.cedula    || '',
            telefono:  rep.telefono  || '',
            correo:    rep.correo    || '',
            direccion: rep.direccion || '',
        });
        setFormErrors({});
        setShowModal(true);
    };

    const closeModal = () => {
        setShowModal(false);
        setEditando(null);
        setForm(FORM_EMPTY);
        setFormErrors({});
    };

    const validateForm = () => {
        const errs = {};
        if (!form.nombre.trim())   errs.nombre   = 'Requerido.';
        if (!form.apellido.trim()) errs.apellido  = 'Requerido.';
        if (!form.cedula.trim())   errs.cedula    = 'Requerido.';
        if (form.correo && !EMAIL_RE.test(form.correo)) errs.correo = 'Correo inválido.';
        return errs;
    };

    const handleSave = async (e) => {
        e.preventDefault();
        const errs = validateForm();
        if (Object.keys(errs).length) { setFormErrors(errs); return; }
        setSaving(true);
        try {
            if (editando) {
                await axiosInstance.patch(`secretaria/representantes/${editando.id}/`, {
                    nombre:    form.nombre.trim(),
                    apellido:  form.apellido.trim(),
                    telefono:  form.telefono.trim(),
                    correo:    form.correo.trim(),
                    direccion: form.direccion.trim(),
                });
                toast.success('Representante actualizado.');
            } else {
                await axiosInstance.post('secretaria/representantes/', {
                    nombre:    form.nombre.trim(),
                    apellido:  form.apellido.trim(),
                    cedula:    form.cedula.trim(),
                    telefono:  form.telefono.trim(),
                    correo:    form.correo.trim(),
                    direccion: form.direccion.trim(),
                });
                toast.success('Representante registrado.');
            }
            closeModal();
            fetchRepresentantes();
        } catch (err) {
            const data = err.response?.data;
            if (data && typeof data === 'object' && !data.detail && !data.error) {
                setFormErrors(Object.fromEntries(
                    Object.entries(data).map(([k, v]) => [k, Array.isArray(v) ? v.join(' ') : v])
                ));
            } else {
                toast.error(parseApiError(err));
            }
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async () => {
        if (!confirmDelete) return;
        setDeleting(true);
        try {
            await axiosInstance.delete(`secretaria/representantes/${confirmDelete.id}/`);
            toast.success('Representante eliminado.');
            setConfirmDelete(null);
            if (selectedRep?.id === confirmDelete.id) closeFicha();
            fetchRepresentantes();
        } catch (err) {
            toast.error(err.response?.data?.error || 'No se pudo eliminar. Puede tener alumnos activos.');
        } finally {
            setDeleting(false);
        }
    };

    const handleExportExcel = async () => {
        setExportingExcel(true);
        try {
            const params = new URLSearchParams();
            if (busqueda.trim()) params.append('buscar', busqueda.trim());
            if (minHijos) params.append('min_hijos', minHijos);
            const res = await axiosInstance.get(
                `secretaria/exportar-representantes-excel/?${params}`,
                { responseType: 'blob' }
            );
            const url = URL.createObjectURL(new Blob([res.data], {
                type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            }));
            const a = Object.assign(document.createElement('a'), {
                href: url,
                download: `representantes_${new Date().toISOString().split('T')[0]}.xlsx`,
            });
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            toast.success('Archivo Excel descargado.');
        } catch (err) {
            toast.error(parseApiError(err) || 'No se pudo generar el Excel.');
        } finally {
            setExportingExcel(false);
        }
    };

    return {
        // Lista
        representantes, loading, busqueda, setBusqueda, minHijos, setMinHijos,
        // Export
        exportingExcel, handleExportExcel,
        // Ficha
        selectedRep, fichaAlumnos, fichaLoading, openFicha, closeFicha,
        // Modal
        showModal, editando, form, setForm, formErrors, saving,
        openCrear, openEditar, closeModal, handleSave,
        // Delete
        confirmDelete, setConfirmDelete, deleting, handleDelete,
    };
}
