import { useState, useCallback, useEffect } from 'react';
import { format } from 'date-fns';
import { toast } from 'react-toastify';
import apiClient from '../api/apiClient';
import { exportarMorososExcel } from '../api/cobranza.service';

const PAGE_SIZE = 20;

export function useMorosos(busqueda) {
    const [alumnos, setAlumnos] = useState([]);
    const [loading, setLoading] = useState(true);
    const [exportingExcel, setExportingExcel] = useState(false);
    const [page, setPage] = useState(1);
    const [total, setTotal] = useState(0);
    const [totalDeudaBackendUSD, setTotalDeudaBackendUSD] = useState(0);
    const [totalSolvenciaBackendUSD, setTotalSolvenciaBackendUSD] = useState(0);

    const fetchMorosos = useCallback(async (signal) => {
        setLoading(true);
        try {
            const params = { page, page_size: PAGE_SIZE };
            if (busqueda?.trim()) params.buscar = busqueda.trim();
            const res = await apiClient.get('cobranza/morosos/', { params, signal });
            setAlumnos(res.data?.results ?? res.data ?? []);
            setTotal(res.data?.count ?? 0);
            setTotalDeudaBackendUSD(parseFloat(res.data?.total_deuda_usd || 0));
            setTotalSolvenciaBackendUSD(parseFloat(res.data?.total_solvencia_usd || 0));
        } catch (err) {
            if (err.name === 'CanceledError' || err.code === 'ERR_CANCELED') return;
            if (err.response?.status === 404 && page > 1) { setPage(1); return; }
            setAlumnos([]);
            toast.error('No se pudo cargar la lista de morosos. Intenta de nuevo.');
        } finally {
            setLoading(false);
        }
    }, [busqueda, page]);

    // Cambiar la búsqueda reinicia siempre a la página 1
    useEffect(() => { setPage(1); }, [busqueda]);

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

    // Totales agregados por el backend sobre TODOS los morosos (no solo la
    // página actual), para que las tarjetas de resumen no queden truncadas.
    const totalDeudaUSD = totalDeudaBackendUSD;
    const totalSolvenciaUSD = totalSolvenciaBackendUSD;

    return {
        alumnos,
        loading,
        exportingExcel,
        totalDeudaUSD,
        totalSolvenciaUSD,
        refetch,
        handleExportExcel,
        // Paginación
        page, setPage, total, totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)), pageSize: PAGE_SIZE,
    };
}
