import { useState, useCallback } from 'react';
import { toast } from 'react-toastify';
import axiosInstance from '../api/apiClient';

export const LOGS_PAGE_SIZE = 20;

export function useLogsSistemas() {
    const [logs,        setLogs]        = useState([]);
    const [logsTotal,   setLogsTotal]   = useState(0);
    const [logsPage,    setLogsPage]    = useState(1);
    const [logsLoading, setLogsLoading] = useState(false);

    // filtro is passed explicitly so the caller controls when to apply changes.
    const fetchLogs = useCallback(async (page = 1, filtro = {}) => {
        setLogsLoading(true);
        try {
            const params = { page, page_size: LOGS_PAGE_SIZE };
            Object.entries(filtro).forEach(([k, v]) => { if (v) params[k] = v; });
            const res = await axiosInstance.get('notificaciones/logs/', { params });
            setLogs(res.data.results);
            setLogsTotal(res.data.total);
            setLogsPage(page);
        } catch {
            toast.error('Error al cargar logs');
        } finally {
            setLogsLoading(false);
        }
    }, []);

    return { logs, logsTotal, logsPage, logsLoading, fetchLogs };
}
