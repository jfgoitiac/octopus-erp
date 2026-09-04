import { useState, useCallback, useEffect, useRef } from 'react';
import axiosInstance from '../api/apiClient';
import { toast } from 'react-toastify';

const LOGS_PAGE_SIZE = 25;

async function descargarExcel(url, params, filename) {
    const res = await axiosInstance.get(url, { params, responseType: 'blob' });
    const blobUrl = URL.createObjectURL(new Blob([res.data], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }));
    const a = Object.assign(document.createElement('a'), { href: blobUrl, download: filename });
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(blobUrl);
}

export function useAuditoria(fechaInicio, fechaFin, modulo = 'TODOS', page = 1, busqueda = '') {
    const [loading, setLoading]       = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [exporting, setExporting]   = useState(false);
    const [exportingPagos, setExportingPagos] = useState(false);
    const [reporte, setReporte]       = useState(null);
    const [logs, setLogs]             = useState([]);
    const [totalLogs, setTotalLogs]   = useState(0);
    const [totalPages, setTotalPages] = useState(1);
    const [error, setError]           = useState(null);

    const fetchAuditoria = useCallback(async (isRefresh = false) => {
        if (isRefresh) setRefreshing(true);
        else setLoading(true);
        setError(null);

        const [resStats, resLogs] = await Promise.allSettled([
            axiosInstance.get('cobranza/auditoria-diaria/', {
                params: { fecha_inicio: fechaInicio, fecha_fin: fechaFin },
            }),
            // El log de auditoría siempre viene paginado desde el backend:
            // el total de registros disponibles nunca se limita, solo se
            // trae de a "page_size" por vez para no saturar la página.
            axiosInstance.get('secretaria/auditoria/', {
                params: {
                    fecha_inicio: fechaInicio,
                    fecha_fin: fechaFin,
                    modulo: modulo !== 'TODOS' ? modulo : undefined,
                    q: busqueda || undefined,
                    page,
                    page_size: LOGS_PAGE_SIZE,
                },
            }),
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
            const data = resLogs.value.data ?? {};
            setLogs(data.results ?? []);
            setTotalLogs(data.total ?? 0);
            setTotalPages(data.total_pages ?? 1);
        } else {
            const msg = resLogs.reason?.response?.status === 403
                ? 'Sin permisos para ver el historial de operaciones.'
                : 'No se pudo cargar el historial de operaciones.';
            toast.error(msg);
        }

        setLoading(false);
        setRefreshing(false);
    }, [fechaInicio, fechaFin, modulo, page, busqueda]);

    const hasLoadedOnce = useRef(false);
    useEffect(() => {
        fetchAuditoria(hasLoadedOnce.current);
        hasLoadedOnce.current = true;
    }, [fetchAuditoria]);

    const exportarExcel = useCallback(async () => {
        setExporting(true);
        try {
            await descargarExcel(
                'secretaria/auditoria/exportar-excel/',
                { fecha_inicio: fechaInicio, fecha_fin: fechaFin, modulo },
                `auditoria_log_${fechaInicio}_${fechaFin}.xlsx`,
            );
            toast.success('Archivo Excel descargado.');
        } catch {
            toast.error('No se pudo generar el Excel.');
        } finally {
            setExporting(false);
        }
    }, [fechaInicio, fechaFin, modulo]);

    const exportarPagosExcel = useCallback(async () => {
        setExportingPagos(true);
        try {
            await descargarExcel(
                'cobranza/exportar-excel/',
                { fecha_inicio: fechaInicio, fecha_fin: fechaFin },
                `auditoria_pagos_${fechaInicio}_${fechaFin}.xlsx`,
            );
            toast.success('Archivo Excel descargado.');
        } catch {
            toast.error('No se pudo generar el Excel.');
        } finally {
            setExportingPagos(false);
        }
    }, [fechaInicio, fechaFin]);

    return {
        loading, refreshing, exporting, exportingPagos, reporte, logs,
        totalLogs, totalPages, error,
        refetch: fetchAuditoria, exportarExcel, exportarPagosExcel,
    };
}
