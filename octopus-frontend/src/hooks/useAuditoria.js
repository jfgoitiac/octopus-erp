import { useState, useCallback, useEffect } from 'react';
import axiosInstance from '../api/apiClient';
import { toast } from 'react-toastify';

export function useAuditoria(fechaInicio, fechaFin) {
    const [loading, setLoading]       = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [exporting, setExporting]   = useState(false);
    const [reporte, setReporte]       = useState(null);
    const [logs, setLogs]             = useState([]);
    const [error, setError]           = useState(null);

    const fetchAuditoria = useCallback(async (isRefresh = false) => {
        if (isRefresh) setRefreshing(true);
        else setLoading(true);
        setError(null);

        const [resStats, resLogs] = await Promise.allSettled([
            axiosInstance.get('cobranza/auditoria-diaria/', {
                params: { fecha_inicio: fechaInicio, fecha_fin: fechaFin },
            }),
            axiosInstance.get('secretaria/auditoria/'),
        ]);

        if (resStats.status === 'fulfilled') {
            setReporte(resStats.value.data);
        } else {
            const msg = resStats.reason?.response?.status === 403
                ? 'Sin permisos para ver los ingresos del período.'
                : 'No se pudieron cargar los ingresos del período.';
            setError(msg);
            toast.error(msg);
        }

        if (resLogs.status === 'fulfilled') {
            setLogs(
                (resLogs.value.data || []).sort((a, b) =>
                    new Date(b.fecha_hora || b.fecha) - new Date(a.fecha_hora || a.fecha)
                )
            );
        } else {
            const msg = resLogs.reason?.response?.status === 403
                ? 'Sin permisos para ver el historial de operaciones.'
                : 'No se pudo cargar el historial de operaciones.';
            toast.error(msg);
        }

        setLoading(false);
        setRefreshing(false);
    }, [fechaInicio, fechaFin]);

    useEffect(() => { fetchAuditoria(); }, [fetchAuditoria]);

    const exportarExcel = useCallback(async () => {
        setExporting(true);
        try {
            const res = await axiosInstance.get('cobranza/exportar-excel/', {
                params: { fecha_inicio: fechaInicio, fecha_fin: fechaFin },
                responseType: 'blob',
            });
            const url = URL.createObjectURL(new Blob([res.data], {
                type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            }));
            const a = Object.assign(document.createElement('a'), {
                href: url,
                download: `auditoria_${fechaInicio}_${fechaFin}.xlsx`,
            });
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            toast.success('Archivo Excel descargado.');
        } catch {
            toast.error('No se pudo generar el Excel.');
        } finally {
            setExporting(false);
        }
    }, [fechaInicio, fechaFin]);

    return { loading, refreshing, exporting, reporte, logs, error, refetch: fetchAuditoria, exportarExcel };
}
