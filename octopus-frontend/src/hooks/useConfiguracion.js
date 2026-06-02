import { useState, useCallback, useEffect } from 'react';
import axiosInstance from '../api/apiClient';
import { toast } from 'react-toastify';

export function useConfiguracion() {
    const [config, setConfig] = useState({
        nombre_colegio: '',
        rif: '',
        direccion_colegio: '',
        telefono_colegio: '',
        correo_colegio: '',
        municipio: '',
        estado_colegio: '',
        fecha_inicio_inscripciones: '',
        fecha_fin_inscripciones: '',
        fecha_inicio_ano_escolar: '',
        fecha_fin_ano_escolar: '',
        periodo_escolar_activo: '',
        dia_limite_pago: 5,
        notificaciones_activas: true,
        inscripciones_abiertas: false,
        color_primario: '#0fa3b1',
        color_secundario: '#1f3864',
        logo_url: '',
    });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [periodoDestino, setPeriodoDestino] = useState('');
    const [showPromoModal, setShowPromoModal] = useState(false);
    const [promoting, setPromoting] = useState(false);

    const fetchConfig = useCallback(async () => {
        setLoading(true);
        try {
            const res = await axiosInstance.get('secretaria/configuracion/');
            setConfig(res?.data || {});
            if (res?.data?.periodo_escolar_activo) {
                const parts = res.data.periodo_escolar_activo.split('-');
                if (parts.length === 2) {
                    setPeriodoDestino(`${parseInt(parts[0]) + 1}-${parseInt(parts[1]) + 1}`);
                }
            }
        } catch (err) {
            const msg = err.response?.data?.error || err.response?.data?.detail || "Error al cargar la configuración.";
            toast.error(msg);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchConfig(); }, [fetchConfig]);

    const handleConfigChange = (e) => {
        const { name, value, type, checked } = e.target;
        setConfig(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
    };

    const handleSaveConfig = async (e) => {
        if (e) e.preventDefault();
        setSaving(true);
        try {
            await axiosInstance.post('secretaria/configuracion/', config);
            toast.success("Configuración global actualizada con éxito.");
            fetchConfig();
        } catch (err) {
            const msg = err.response?.data?.error || err.response?.data?.detail || "No se pudo guardar la configuración.";
            toast.error(msg);
        } finally {
            setSaving(false);
        }
    };

    const handlePromote = async () => {
        if (!/^\d{4}-\d{4}$/.test(periodoDestino)) {
            toast.error("El período debe tener el formato YYYY-YYYY (Ej: 2026-2027)");
            return;
        }
        setPromoting(true);
        try {
            const res = await axiosInstance.post('secretaria/promover-alumnos/', { periodo_destino: periodoDestino });
            toast.success(res?.data?.mensaje || "Proceso de promoción completado.");
            setShowPromoModal(false);
            fetchConfig();
        } catch (err) {
            const msg = err.response?.data?.error || err.response?.data?.detail || "Error crítico durante la promoción masiva.";
            toast.error(msg);
        } finally {
            setPromoting(false);
        }
    };

    return {
        config, loading, saving, periodoDestino, setPeriodoDestino,
        showPromoModal, setShowPromoModal, promoting,
        fetchConfig, handleConfigChange, handleSaveConfig, handlePromote,
    };
}
