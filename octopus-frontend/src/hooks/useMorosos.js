import { useState, useCallback, useEffect, useMemo } from 'react';
import { format } from 'date-fns';
import { toast } from 'react-toastify';
import apiClient from '../api/apiClient';
import { exportarMorososExcel } from '../api/cobranza.service';

export function useMorosos(busqueda) {
    const [alumnos, setAlumnos] = useState([]);
    const [loading, setLoading] = useState(true);
    const [exportingExcel, setExportingExcel] = useState(false);

    const fetchMorosos = useCallback(async (signal) => {
        setLoading(true);
        try {
            const params = {};
            if (busqueda?.trim()) params.buscar = busqueda.trim();
            const res = await apiClient.get('cobranza/morosos/', { params, signal });
            setAlumnos(res.data?.results ?? res.data ?? []);
        } catch (err) {
            if (err.name === 'CanceledError' || err.code === 'ERR_CANCELED') return;
            setAlumnos([]);
            toast.error('No se pudo cargar la lista de morosos. Intenta de nuevo.');
        } finally {
            setLoading(false);
        }
    }, [busqueda]);

    useEffect(() => {
        const controller = new AbortController();
        const timer = setTimeout(() => fetchMorosos(controller.signal), 300);
        return () => { clearTimeout(timer); controller.abort(); };
    }, [fetchMorosos]);

    const refetch = useCallback(() => {
        const controller = new AbortController();
        fetchMorosos(controller.signal);
    }, [fetchMorosos]);

    const handleExportExcel = useCallback(async () => {
        setExportingExcel(true);
        try {
            const res = await exportarMorososExcel(busqueda);
            const url = URL.createObjectURL(new Blob([res.data], {
                type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            }));
            const a = Object.assign(document.createElement('a'), {
                href: url,
                download: `morosos_${format(new Date(), 'yyyy-MM-dd')}.xlsx`,
            });
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            toast.success('Archivo Excel descargado.');
        } catch {
            toast.error('No se pudo generar el Excel.');
        } finally {
            setExportingExcel(false);
        }
    }, [busqueda]);

    const totalDeudaUSD = useMemo(
        () => alumnos.reduce((s, a) => s + parseFloat(a.monto_adeudado || 0), 0),
        [alumnos]
    );

    return {
        alumnos,
        loading,
        exportingExcel,
        totalDeudaUSD,
        refetch,
        handleExportExcel,
    };
}
