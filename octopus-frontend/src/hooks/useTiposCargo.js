import { useState, useCallback, useEffect } from 'react';
import axiosInstance from '../api/apiClient';
import { toast } from 'react-toastify';

export function useTiposCargo() {
    const [tiposCargo, setTiposCargo] = useState([]);
    const [tiposCargoLoading, setTiposCargoLoading] = useState(false);
    const [showTipoCargoModal, setShowTipoCargoModal] = useState(false);
    const [tipoCargoEditando, setTipoCargoEditando] = useState(null);
    const [tipoCargoForm, setTipoCargoForm] = useState({ nombre: '', descripcion: '', activo: true });
    const [tipoCargoSaving, setTipoCargoSaving] = useState(false);
    const [showDeleteTipoModal, setShowDeleteTipoModal] = useState(false);
    const [tipoCargoAEliminar, setTipoCargoAEliminar] = useState(null);

    const fetchTiposCargo = useCallback(async () => {
        setTiposCargoLoading(true);
        try {
            const res = await axiosInstance.get('rrhh/tipos-cargo/');
            setTiposCargo(res.data || []);
        } catch {
            toast.error("No se pudieron cargar los tipos de cargo.");
        } finally {
            setTiposCargoLoading(false);
        }
    }, []);

    useEffect(() => { fetchTiposCargo(); }, [fetchTiposCargo]);

    const openCreateTipoCargo = () => {
        setTipoCargoEditando(null);
        setTipoCargoForm({ nombre: '', descripcion: '', activo: true });
        setShowTipoCargoModal(true);
    };

    const openEditTipoCargo = (tipo) => {
        setTipoCargoEditando(tipo);
        setTipoCargoForm({ nombre: tipo.nombre, descripcion: tipo.descripcion || '', activo: tipo.activo });
        setShowTipoCargoModal(true);
    };

    const handleSaveTipoCargo = async () => {
        if (!tipoCargoForm.nombre.trim()) { toast.error("El nombre del cargo es requerido."); return; }
        setTipoCargoSaving(true);
        try {
            if (tipoCargoEditando) {
                await axiosInstance.patch(`rrhh/tipos-cargo/${tipoCargoEditando.id}/`, tipoCargoForm);
                toast.success("Tipo de cargo actualizado.");
            } else {
                await axiosInstance.post('rrhh/tipos-cargo/', tipoCargoForm);
                toast.success("Tipo de cargo agregado.");
            }
            setShowTipoCargoModal(false);
            fetchTiposCargo();
        } catch (err) {
            const msg = err.response?.data?.nombre?.[0] || err.response?.data?.detail || "Error al guardar el tipo de cargo.";
            toast.error(msg);
        } finally {
            setTipoCargoSaving(false);
        }
    };

    const confirmarEliminarTipo = (tipo) => {
        setTipoCargoAEliminar(tipo);
        setShowDeleteTipoModal(true);
    };

    const handleDeleteTipoCargo = async () => {
        if (!tipoCargoAEliminar) return;
        try {
            await axiosInstance.delete(`rrhh/tipos-cargo/${tipoCargoAEliminar.id}/`);
            toast.success("Tipo de cargo eliminado.");
            setShowDeleteTipoModal(false);
            setTipoCargoAEliminar(null);
            fetchTiposCargo();
        } catch (err) {
            const msg = err.response?.data?.detail || "No se pudo eliminar el tipo de cargo.";
            toast.error(msg);
        }
    };

    return {
        tiposCargo, tiposCargoLoading,
        showTipoCargoModal, setShowTipoCargoModal, tipoCargoEditando,
        tipoCargoForm, setTipoCargoForm, tipoCargoSaving,
        showDeleteTipoModal, setShowDeleteTipoModal, tipoCargoAEliminar, setTipoCargoAEliminar,
        fetchTiposCargo, openCreateTipoCargo, openEditTipoCargo, handleSaveTipoCargo,
        confirmarEliminarTipo, handleDeleteTipoCargo,
    };
}
