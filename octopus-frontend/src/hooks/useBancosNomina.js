import { useState, useCallback, useEffect } from 'react';
import axiosInstance from '../api/apiClient';
import { toast } from 'react-toastify';

export function useBancosNomina() {
    const [bancosNomina, setBancosNomina] = useState([]);
    const [bancosNominaLoading, setBancosNominaLoading] = useState(false);
    const [showBancoNominaModal, setShowBancoNominaModal] = useState(false);
    const [bancoNominaEditando, setBancoNominaEditando] = useState(null);
    const [bancoNominaForm, setBancoNominaForm] = useState({ nombre: '', activo: true });
    const [bancoNominaSaving, setBancoNominaSaving] = useState(false);
    const [showDeleteBancoNominaModal, setShowDeleteBancoNominaModal] = useState(false);
    const [bancoNominaAEliminar, setBancoNominaAEliminar] = useState(null);

    const fetchBancosNomina = useCallback(async () => {
        setBancosNominaLoading(true);
        try {
            const res = await axiosInstance.get('rrhh/bancos-nomina/');
            setBancosNomina(res.data || []);
        } catch {
            toast.error("No se pudieron cargar los bancos de nómina.");
        } finally {
            setBancosNominaLoading(false);
        }
    }, []);

    useEffect(() => { fetchBancosNomina(); }, [fetchBancosNomina]);

    const openCreateBancoNomina = () => {
        setBancoNominaEditando(null);
        setBancoNominaForm({ nombre: '', activo: true });
        setShowBancoNominaModal(true);
    };

    const openEditBancoNomina = (banco) => {
        setBancoNominaEditando(banco);
        setBancoNominaForm({ nombre: banco.nombre, activo: banco.activo });
        setShowBancoNominaModal(true);
    };

    const handleSaveBancoNomina = async () => {
        if (!bancoNominaForm.nombre.trim()) { toast.error("El nombre del banco es requerido."); return; }
        setBancoNominaSaving(true);
        try {
            if (bancoNominaEditando) {
                await axiosInstance.patch(`rrhh/bancos-nomina/${bancoNominaEditando.id}/`, bancoNominaForm);
                toast.success("Banco de nómina actualizado.");
            } else {
                await axiosInstance.post('rrhh/bancos-nomina/', bancoNominaForm);
                toast.success("Banco de nómina agregado.");
            }
            setShowBancoNominaModal(false);
            fetchBancosNomina();
        } catch (err) {
            const msg = err.response?.data?.nombre?.[0] || err.response?.data?.detail || "Error al guardar el banco.";
            toast.error(msg);
        } finally {
            setBancoNominaSaving(false);
        }
    };

    const confirmarEliminarBancoNomina = (banco) => {
        setBancoNominaAEliminar(banco);
        setShowDeleteBancoNominaModal(true);
    };

    const handleDeleteBancoNomina = async () => {
        if (!bancoNominaAEliminar) return;
        try {
            await axiosInstance.delete(`rrhh/bancos-nomina/${bancoNominaAEliminar.id}/`);
            toast.success("Banco de nómina eliminado.");
            setShowDeleteBancoNominaModal(false);
            setBancoNominaAEliminar(null);
            fetchBancosNomina();
        } catch (err) {
            const msg = err.response?.data?.detail || "No se pudo eliminar el banco.";
            toast.error(msg);
        }
    };

    return {
        bancosNomina, bancosNominaLoading,
        showBancoNominaModal, setShowBancoNominaModal, bancoNominaEditando,
        bancoNominaForm, setBancoNominaForm, bancoNominaSaving,
        showDeleteBancoNominaModal, setShowDeleteBancoNominaModal,
        bancoNominaAEliminar, setBancoNominaAEliminar,
        fetchBancosNomina, openCreateBancoNomina, openEditBancoNomina,
        handleSaveBancoNomina, confirmarEliminarBancoNomina, handleDeleteBancoNomina,
    };
}
