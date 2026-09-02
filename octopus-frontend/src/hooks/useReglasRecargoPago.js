import { useState, useCallback, useEffect } from 'react';
import axiosInstance from '../api/apiClient';
import { toast } from 'react-toastify';

const normalizeList = (data) =>
    Array.isArray(data) ? data : (data?.results ?? []);

const FORM_INICIAL = {
    nombre: '',
    descripcion: '',
    tipo: 'recargo',
    modo_calculo: 'monto_fijo_usd',
    valor: '',
    dia_aplicacion: '',
    activa: true,
};

export function useReglasRecargoPago() {
    const [reglasRecargoPago, setReglasRecargoPago] = useState([]);
    const [reglasRecargoPagoLoading, setReglasRecargoPagoLoading] = useState(false);
    const [showReglaRecargoPagoModal, setShowReglaRecargoPagoModal] = useState(false);
    const [reglaRecargoPagoEditando, setReglaRecargoPagoEditando] = useState(null);
    const [reglaRecargoPagoForm, setReglaRecargoPagoForm] = useState(FORM_INICIAL);
    const [reglaRecargoPagoSaving, setReglaRecargoPagoSaving] = useState(false);
    const [showDeleteReglaRecargoPagoModal, setShowDeleteReglaRecargoPagoModal] = useState(false);
    const [reglaRecargoPagoAEliminar, setReglaRecargoPagoAEliminar] = useState(null);

    const fetchReglasRecargoPago = useCallback(async () => {
        setReglasRecargoPagoLoading(true);
        try {
            const res = await axiosInstance.get('cobranza/reglas-recargo-pago/');
            setReglasRecargoPago(normalizeList(res.data));
        } catch {
            toast.error("No se pudieron cargar las reglas de recargo por pago tardío.");
        } finally {
            setReglasRecargoPagoLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchReglasRecargoPago();
    }, [fetchReglasRecargoPago]);

    const openCreateReglaRecargoPago = () => {
        setReglaRecargoPagoEditando(null);
        setReglaRecargoPagoForm(FORM_INICIAL);
        setShowReglaRecargoPagoModal(true);
    };

    const openEditReglaRecargoPago = (regla) => {
        setReglaRecargoPagoEditando(regla);
        setReglaRecargoPagoForm({
            nombre: regla.nombre,
            descripcion: regla.descripcion || '',
            tipo: regla.tipo || 'recargo',
            modo_calculo: regla.modo_calculo,
            valor: regla.valor,
            dia_aplicacion: regla.dia_aplicacion ?? '',
            activa: regla.activa,
        });
        setShowReglaRecargoPagoModal(true);
    };

    const handleSaveReglaRecargoPago = async () => {
        if (!reglaRecargoPagoForm.nombre.trim()) {
            toast.error("El nombre de la regla de recargo es requerido.");
            return;
        }
        setReglaRecargoPagoSaving(true);
        try {
            if (reglaRecargoPagoEditando) {
                await axiosInstance.patch(`cobranza/reglas-recargo-pago/${reglaRecargoPagoEditando.id}/`, reglaRecargoPagoForm);
                toast.success("Regla de recargo actualizada.");
            } else {
                await axiosInstance.post('cobranza/reglas-recargo-pago/', reglaRecargoPagoForm);
                toast.success("Regla de recargo agregada.");
            }
            setShowReglaRecargoPagoModal(false);
            fetchReglasRecargoPago();
        } catch (err) {
            const data = err.response?.data;
            const primerCampo = data && typeof data === 'object' ? Object.values(data)[0] : null;
            const msg = (Array.isArray(primerCampo) ? primerCampo[0] : primerCampo) || data?.detail || "Error al guardar la regla de recargo.";
            toast.error(msg);
        } finally {
            setReglaRecargoPagoSaving(false);
        }
    };

    const confirmarEliminarReglaRecargoPago = (regla) => {
        setReglaRecargoPagoAEliminar(regla);
        setShowDeleteReglaRecargoPagoModal(true);
    };

    const handleDeleteReglaRecargoPago = async () => {
        if (!reglaRecargoPagoAEliminar) return;
        try {
            await axiosInstance.delete(`cobranza/reglas-recargo-pago/${reglaRecargoPagoAEliminar.id}/`);
            toast.success("Regla de recargo eliminada.");
            setShowDeleteReglaRecargoPagoModal(false);
            setReglaRecargoPagoAEliminar(null);
            fetchReglasRecargoPago();
        } catch (err) {
            const msg = err.response?.data?.detail || "No se pudo eliminar la regla de recargo.";
            toast.error(msg);
        }
    };

    return {
        reglasRecargoPago, reglasRecargoPagoLoading,
        showReglaRecargoPagoModal, setShowReglaRecargoPagoModal, reglaRecargoPagoEditando,
        reglaRecargoPagoForm, setReglaRecargoPagoForm, reglaRecargoPagoSaving,
        showDeleteReglaRecargoPagoModal, setShowDeleteReglaRecargoPagoModal,
        reglaRecargoPagoAEliminar, setReglaRecargoPagoAEliminar,
        fetchReglasRecargoPago, openCreateReglaRecargoPago, openEditReglaRecargoPago,
        handleSaveReglaRecargoPago, confirmarEliminarReglaRecargoPago, handleDeleteReglaRecargoPago,
    };
}
