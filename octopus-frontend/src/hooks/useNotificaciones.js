import { useState, useCallback, useEffect, useRef } from 'react';
import axiosInstance from '../api/apiClient';
import { toast } from 'react-toastify';

export const PAGE_SIZE_LOGS = 20;

export function useNotificaciones() {
    const [configNotif, setConfigNotif] = useState(null);
    const [logsNotif, setLogsNotif] = useState({ total: 0, results: [] });
    const [pruebaForm, setPruebaForm] = useState({ canal: 'email', destino: '', mensaje: '' });
    const [pruebaCargando, setPruebaCargando] = useState(false);
    const [pruebaResultado, setPruebaResultado] = useState(null);
    const [logsFiltro, setLogsFiltro] = useState({ canal: '', estado: '', page: 1 });
    const [logsLoading, setLogsLoading] = useState(false);

    // Ref para cancelar cualquier petición en vuelo antes de lanzar una nueva
    const abortRef = useRef(null);

    const cargarConfigNotificaciones = useCallback(async (canalFiltro = '', estadoFiltro = '', page = 1, signal) => {
        setLogsLoading(true);
        try {
            const [cfgRes, logsRes] = await Promise.all([
                axiosInstance.get('notificaciones/configuracion/', { signal }),
                axiosInstance.get('notificaciones/logs/', {
                    params: { canal: canalFiltro, estado: estadoFiltro, page, page_size: PAGE_SIZE_LOGS },
                    signal,
                }),
            ]);
            setConfigNotif(cfgRes.data);
            setLogsNotif(logsRes.data);
        } catch (err) {
            if (err.name === 'CanceledError' || err.code === 'ERR_CANCELED') return;
            const msg = err.response?.data?.detail || "No se pudo cargar la configuración de notificaciones.";
            toast.error(msg);
        } finally {
            setLogsLoading(false);
        }
    }, []);

    useEffect(() => {
        const controller = new AbortController();
        cargarConfigNotificaciones(undefined, undefined, undefined, controller.signal);
        return () => controller.abort();
    }, [cargarConfigNotificaciones]);

    // Cancela la petición anterior antes de lanzar una nueva desde filtros o paginación
    const dispatchCarga = useCallback((canal, estado, page) => {
        abortRef.current?.abort();
        abortRef.current = new AbortController();
        cargarConfigNotificaciones(canal, estado, page, abortRef.current.signal);
    }, [cargarConfigNotificaciones]);

    useEffect(() => {
        return () => { abortRef.current?.abort(); };
    }, []);

    const handleEnviarPrueba = async (e) => {
        e.preventDefault();
        setPruebaCargando(true);
        setPruebaResultado(null);
        try {
            const res = await axiosInstance.post('notificaciones/probar/', pruebaForm);
            setPruebaResultado({ ok: true, data: res.data.resultados });
            toast.success('Mensaje de prueba enviado');
        } catch (err) {
            setPruebaResultado({ ok: false, error: err.response?.data?.error || 'Error al enviar' });
            toast.error('Error al enviar prueba');
        } finally {
            setPruebaCargando(false);
        }
    };

    const aplicarFiltrosLogs = () => {
        dispatchCarga(logsFiltro.canal, logsFiltro.estado, 1);
        setLogsFiltro(p => ({ ...p, page: 1 }));
    };

    const cambiarPaginaLogs = (nueva) => {
        setLogsFiltro(p => ({ ...p, page: nueva }));
        dispatchCarga(logsFiltro.canal, logsFiltro.estado, nueva);
    };

    return {
        configNotif, logsNotif, pruebaForm, setPruebaForm,
        pruebaCargando, pruebaResultado, logsFiltro, setLogsFiltro,
        logsLoading, cargarConfigNotificaciones, handleEnviarPrueba,
        aplicarFiltrosLogs, cambiarPaginaLogs,
    };
}
