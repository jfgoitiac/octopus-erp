import { useState, useCallback, useEffect } from 'react';
import axiosInstance from '../api/apiClient';
import { toast } from 'react-toastify';

export function useBancosCobranza() {
    const [bancos, setBancos] = useState([]);
    const [bancosLoading, setBancosLoading] = useState(false);
    const [showBancoModal, setShowBancoModal] = useState(false);
    const [bancoEditando, setBancoEditando] = useState(null);
    const [bancoForm, setBancoForm] = useState({ nombre: '', numero_cuenta: '', tipo: 'general', activo: true });
    const [bancoSaving, setBancoSaving] = useState(false);
    const [showDeleteBancoModal, setShowDeleteBancoModal] = useState(false);
    const [bancoAEliminar, setBancoAEliminar] = useState(null);

    const fetchBancos = useCallback(async () => {
        setBancosLoading(true);
        try {
            const res = await axiosInstance.get('cobranza/bancos/admin/');
            setBancos(res.data || []);
        } catch {
            toast.error("No se pudieron cargar los bancos.");
        } finally {
            setBancosLoading(false);
        }
    }, []);

    useEffect(() => { fetchBancos(); }, [fetchBancos]);

    const openCreateModal = () => {
        setBancoEditando(null);
        setBancoForm({ nombre: '', numero_cuenta: '', tipo: 'general', activo: true });
        setShowBancoModal(true);
    };

    const openEditModal = (banco) => {
        setBancoEditando(banco);
        setBancoForm({ nombre: banco.nombre, numero_cuenta: banco.numero_cuenta || '', tipo: banco.tipo, activo: banco.activo });
        setShowBancoModal(true);
    };

    const handleSaveBanco = async () => {
        if (!bancoForm.nombre.trim()) { toast.error("El nombre del banco es requerido."); return; }
        setBancoSaving(true);
        try {
            if (bancoEditando) {
                await axiosInstance.patch(`cobranza/bancos/admin/${bancoEditando.id}/`, bancoForm);
                toast.success("Banco actualizado.");
            } else {
                await axiosInstance.post('cobranza/bancos/admin/', bancoForm);
                toast.success("Banco agregado.");
            }
            setShowBancoModal(false);
            fetchBancos();
        } catch (err) {
            const msg = err.response?.data?.nombre?.[0] || err.response?.data?.detail || "Error al guardar el banco.";
            toast.error(msg);
        } finally {
            setBancoSaving(false);
        }
    };

    const handleToggleActivo = async (banco) => {
        // Optimistic update — revert on failure
        setBancos(prev => prev.map(b => b.id === banco.id ? { ...b, activo: !b.activo } : b));
        try {
            await axiosInstance.patch(`cobranza/bancos/admin/${banco.id}/`, { activo: !banco.activo });
        } catch {
            setBancos(prev => prev.map(b => b.id === banco.id ? { ...b, activo: banco.activo } : b));
            toast.error("No se pudo actualizar el estado del banco.");
        }
    };

    const confirmarEliminarBanco = (banco) => {
        setBancoAEliminar(banco);
        setShowDeleteBancoModal(true);
    };

    const handleDeleteBanco = async () => {
        if (!bancoAEliminar) return;
        try {
            const res = await axiosInstance.delete(`cobranza/bancos/admin/${bancoAEliminar.id}/`);
            if (res.status === 204) {
                toast.success("Banco eliminado permanentemente.");
            } else {
                toast.warning("Banco desactivado. Tiene pagos asociados y no puede eliminarse.");
            }
            setShowDeleteBancoModal(false);
            setBancoAEliminar(null);
            fetchBancos();
        } catch {
            toast.error("No se pudo eliminar el banco.");
        }
    };

    return {
        bancos, bancosLoading,
        showBancoModal, setShowBancoModal, bancoEditando, bancoForm, setBancoForm, bancoSaving,
        showDeleteBancoModal, setShowDeleteBancoModal, bancoAEliminar, setBancoAEliminar,
        fetchBancos, openCreateModal, openEditModal, handleSaveBanco,
        handleToggleActivo, confirmarEliminarBanco, handleDeleteBanco,
    };
}
