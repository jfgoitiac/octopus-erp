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
        titulo_web: '',
        descripcion_web: '',
    });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [cargandoCuotas, setCargandoCuotas] = useState(false);
    const [quitandoGrados, setQuitandoGrados] = useState(false);

    const fetchConfig = useCallback(async () => {
        setLoading(true);
        try {
            const res = await axiosInstance.get('secretaria/configuracion/');
            setConfig(res?.data || {});
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
            const DATE_FIELDS = ['fecha_inicio_inscripciones', 'fecha_fin_inscripciones', 'fecha_inicio_ano_escolar', 'fecha_fin_ano_escolar'];
            // logo_colegio/logo_avec son ImageField: el GET los devuelve como URL de texto,
            // y ese texto no es un archivo válido para el ImageField del serializer.
            // Se gestionan aparte (vía FormData) en handleSaveLogos/useLogosRecibo.
            const FILE_FIELDS = ['logo_colegio', 'logo_avec'];
            const payload = { ...config };
            DATE_FIELDS.forEach(f => { if (!payload[f]) delete payload[f]; });
            FILE_FIELDS.forEach(f => { delete payload[f]; });
            const res = await axiosInstance.post('secretaria/configuracion/', payload);
            toast.success("Configuración global actualizada con éxito.");
            const actualizados = res?.data?.alumnos_dia_limite_actualizados;
            if (actualizados > 0) {
                toast.info(`Día límite de pago aplicado a ${actualizados} alumno${actualizados === 1 ? '' : 's'}.`);
            }
            fetchConfig();
        } catch (err) {
            const msg = err.response?.data?.error || err.response?.data?.detail || "No se pudo guardar la configuración.";
            toast.error(msg);
        } finally {
            setSaving(false);
        }
    };

    const handleCargarCuotasInscripcion = async () => {
        setCargandoCuotas(true);
        try {
            const res = await axiosInstance.post('secretaria/cargar-cuotas-inscripcion/');
            toast.success(res?.data?.mensaje || "Cuotas de inscripción cargadas.");
        } catch (err) {
            const msg = err.response?.data?.error || err.response?.data?.detail || "No se pudieron cargar las cuotas de inscripción.";
            toast.error(msg);
        } finally {
            setCargandoCuotas(false);
        }
    };

    const handleQuitarGradosAlumnos = async () => {
        setQuitandoGrados(true);
        try {
            const res = await axiosInstance.post('secretaria/quitar-grados-alumnos/');
            toast.success(res?.data?.mensaje || "Se quitó el grado a todos los alumnos.");
        } catch (err) {
            const msg = err.response?.data?.error || err.response?.data?.detail || "No se pudo quitar el grado a los alumnos.";
            toast.error(msg);
        } finally {
            setQuitandoGrados(false);
        }
    };

    return {
        config, loading, saving, cargandoCuotas, quitandoGrados,
        fetchConfig, handleConfigChange, handleSaveConfig, handleCargarCuotasInscripcion,
        handleQuitarGradosAlumnos,
    };
}
