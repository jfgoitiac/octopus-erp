import { useState, useCallback, useEffect } from 'react';
import axiosInstance from '../api/apiClient';
import { toast } from 'react-toastify';

export function useGrados() {
    const [grados, setGrados] = useState([]);
    const [gradosLoading, setGradosLoading] = useState(false);
    const [showGradoModal, setShowGradoModal] = useState(false);
    const [gradoEditando, setGradoEditando] = useState(null);
    const [gradoForm, setGradoForm] = useState({ grado_seccion: '', cupos_maximos: 30 });
    const [gradoSaving, setGradoSaving] = useState(false);
    const [showDeleteGradoModal, setShowDeleteGradoModal] = useState(false);
    const [gradoAEliminar, setGradoAEliminar] = useState(null);

    const fetchGrados = useCallback(async () => {
        setGradosLoading(true);
        try {
            const res = await axiosInstance.get('secretaria/configuracion-grados/');
            setGrados(res?.data || []);
        } catch (err) {
            const msg = err.response?.data?.detail || "Error al cargar los grados.";
            toast.error(msg);
        } finally {
            setGradosLoading(false);
        }
    }, []);

    useEffect(() => { fetchGrados(); }, [fetchGrados]);

    const handleUpdateCupos = async (id, cupos_maximos) => {
        const val = parseInt(cupos_maximos);
        if (isNaN(val)) return;
        try {
            await axiosInstance.patch(`secretaria/configuracion-grados/${id}/`, { cupos_maximos: val });
            toast.success("Capacidad de grado actualizada.");
            setGrados(prev => prev.map(g => g.id === id ? { ...g, cupos_maximos: val } : g));
        } catch (err) {
            const msg = err.response?.data?.error || err.response?.data?.detail || "Error al actualizar cupos.";
            toast.error(msg);
        }
    };

    const openCreateGrado = () => {
        setGradoEditando(null);
        setGradoForm({ grado_seccion: '', cupos_maximos: 30 });
        setShowGradoModal(true);
    };

    const openEditGrado = (grado) => {
        setGradoEditando(grado);
        setGradoForm({ grado_seccion: grado.grado_seccion, cupos_maximos: grado.cupos_maximos });
        setShowGradoModal(true);
    };

    const handleSaveGrado = async () => {
        if (!gradoForm.grado_seccion.trim()) { toast.error("El nombre del grado es requerido."); return; }
        setGradoSaving(true);
        try {
            if (gradoEditando) {
                await axiosInstance.patch(`secretaria/configuracion-grados/${gradoEditando.id}/`, gradoForm);
                toast.success("Grado actualizado.");
            } else {
                await axiosInstance.post('secretaria/configuracion-grados/', gradoForm);
                toast.success("Grado agregado.");
            }
            setShowGradoModal(false);
            fetchGrados();
        } catch (err) {
            const msg = err.response?.data?.grado_seccion?.[0] || err.response?.data?.detail || "Error al guardar el grado.";
            toast.error(msg);
        } finally {
            setGradoSaving(false);
        }
    };

    const confirmarEliminarGrado = (grado) => {
        setGradoAEliminar(grado);
        setShowDeleteGradoModal(true);
    };

    const handleDeleteGrado = async () => {
        if (!gradoAEliminar) return;
        try {
            await axiosInstance.delete(`secretaria/configuracion-grados/${gradoAEliminar.id}/`);
            toast.success("Grado eliminado.");
            setShowDeleteGradoModal(false);
            setGradoAEliminar(null);
            fetchGrados();
        } catch (err) {
            const msg = err.response?.data?.detail || "No se pudo eliminar el grado.";
            toast.error(msg);
        }
    };

    return {
        grados, gradosLoading,
        showGradoModal, setShowGradoModal, gradoEditando, gradoForm, setGradoForm,
        gradoSaving, showDeleteGradoModal, setShowDeleteGradoModal, gradoAEliminar, setGradoAEliminar,
        fetchGrados, handleUpdateCupos, openCreateGrado, openEditGrado, handleSaveGrado,
        confirmarEliminarGrado, handleDeleteGrado,
    };
}
