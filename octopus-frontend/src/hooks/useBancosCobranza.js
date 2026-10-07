import { useState, useCallback, useEffect } from 'react';
import axiosInstance from '../api/apiClient';
import { toast } from 'react-toastify';
import { CONFIG_FORM_VACIA, configAFormulario, formularioAConfig, primerMensajeError } from '../utils/configEstadoCuenta';

const FORM_VACIO = {
    nombre: '', numero_cuenta: '', tipos: [], portal_metodos: {}, activo: true,
    formato_estado_cuenta: 'generico', color: '', activo_conciliador: false,
    config_form: CONFIG_FORM_VACIA,
};
const COLOR_HEX = /^#[0-9a-fA-F]{6}$/;

export function useBancosCobranza() {
    const [bancos, setBancos] = useState([]);
    const [bancosLoading, setBancosLoading] = useState(false);
    const [showBancoModal, setShowBancoModal] = useState(false);
    const [bancoEditando, setBancoEditando] = useState(null);
    const [bancoForm, setBancoForm] = useState(FORM_VACIO);
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
        setBancoForm(FORM_VACIO);
        setShowBancoModal(true);
    };

    const openEditModal = (banco) => {
        setBancoEditando(banco);
        setBancoForm({ nombre: banco.nombre, numero_cuenta: banco.numero_cuenta || '', tipos: banco.tipos || [], portal_metodos: banco.portal_metodos || {}, activo: banco.activo,
            formato_estado_cuenta: banco.formato_estado_cuenta || 'generico',
            color: banco.color || '',
            activo_conciliador: Boolean(banco.activo_conciliador),
            config_form: configAFormulario(banco.config_estado_cuenta),
        });
        setShowBancoModal(true);
    };

    const handleSaveBanco = async () => {
        if (!bancoForm.nombre.trim()) { toast.error("El nombre del banco es requerido."); return; }
        if (!bancoForm.tipos || bancoForm.tipos.length === 0) { toast.error("Selecciona al menos un método de pago."); return; }
        const color = (bancoForm.color || '').trim();
        if (color && !COLOR_HEX.test(color)) { toast.error("El color debe tener formato hexadecimal, ej. #1e40af."); return; }
        const { config_form: configForm, ...resto } = bancoForm;
        const payload = { ...resto, color, config_estado_cuenta: formularioAConfig(configForm) };
        setBancoSaving(true);
        try {
            if (bancoEditando) {
                await axiosInstance.patch(`cobranza/bancos/admin/${bancoEditando.id}/`, payload);
                toast.success("Banco actualizado.");
            } else {
                await axiosInstance.post('cobranza/bancos/admin/', payload);
                toast.success("Banco agregado.");
            }
            setShowBancoModal(false);
            fetchBancos();
        } catch (err) {
            const msg = primerMensajeError(err.response?.data, "Error al guardar el banco.");
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
