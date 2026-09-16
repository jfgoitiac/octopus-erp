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
    dia_desde: '',
    dia_hasta: '',
    activa: true,
};

/**
 * Arma el payload a enviar según `tipo`: dia_aplicacion es exclusivo de
 * 'recargo' y dia_desde/dia_hasta de 'descuento' (ver
 * ReglaRecargoPago.clean() en el backend, que rechaza si vienen los campos
 * del otro tipo) — nunca se envían ambos juntos, aunque el form todavía
 * tenga restos de un tipo anterior por haber cambiado el selector.
 */
const construirPayload = (form) => {
    const base = {
        nombre: form.nombre,
        descripcion: form.descripcion,
        tipo: form.tipo,
        activa: form.activa,
        valor: form.valor,
    };
    if (form.tipo === 'descuento') {
        return { ...base, modo_calculo: 'monto_fijo_usd', dia_desde: form.dia_desde, dia_hasta: form.dia_hasta };
    }
    return { ...base, modo_calculo: form.modo_calculo, dia_aplicacion: form.dia_aplicacion };
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
            dia_desde: regla.dia_desde ?? '',
            dia_hasta: regla.dia_hasta ?? '',
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
            const payload = construirPayload(reglaRecargoPagoForm);
            if (reglaRecargoPagoEditando) {
                await axiosInstance.patch(`cobranza/reglas-recargo-pago/${reglaRecargoPagoEditando.id}/`, payload);
                toast.success(reglaRecargoPagoForm.tipo === 'descuento' ? "Regla de descuento actualizada." : "Regla de recargo actualizada.");
            } else {
                await axiosInstance.post('cobranza/reglas-recargo-pago/', payload);
                toast.success(reglaRecargoPagoForm.tipo === 'descuento' ? "Regla de descuento agregada." : "Regla de recargo agregada.");
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
