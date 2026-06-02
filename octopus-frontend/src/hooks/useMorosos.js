import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { format } from 'date-fns';
import { toast } from 'react-toastify';
import { getMorosos, getDeudaAlumno, exportarMorososExcel } from '../api/cobranza.service';

export function useMorosos(busqueda) {
    const [alumnos, setAlumnos] = useState([]);
    const [deudas, setDeudas] = useState({});
    const [loading, setLoading] = useState(true);
    const [loadingDeudas, setLoadingDeudas] = useState(false);
    const [exportingExcel, setExportingExcel] = useState(false);

    // Evita que resultados de búsquedas anteriores sobreescriban los actuales
    const deudasVersionRef = useRef(0);

    const fetchDeudas = useCallback(async (lista, signal) => {
        if (!lista.length) {
            setDeudas({});
            return;
        }
        const version = ++deudasVersionRef.current;
        setLoadingDeudas(true);
        const results = {};
        await Promise.allSettled(
            lista.map(async (alu) => {
                try {
                    const res = await getDeudaAlumno(alu.cedula_escolar, signal);
                    results[alu.cedula_escolar] = res.data?.monto_total_deuda ?? 0;
                } catch (err) {
                    if (err.name === 'CanceledError' || err.code === 'ERR_CANCELED') return;
                    results[alu.cedula_escolar] = null;
                }
            })
        );
        // Solo aplica el resultado si sigue siendo la versión más reciente
        if (version === deudasVersionRef.current) {
            setDeudas(results);
            setLoadingDeudas(false);
        }
    }, []);

    const fetchMorosos = useCallback(async (signal) => {
        setLoading(true);
        try {
            const res = await getMorosos(busqueda, signal);
            const data = res.data?.results ?? res.data ?? [];
            setAlumnos(data);
            fetchDeudas(data, signal);
        } catch (err) {
            if (err.name === 'CanceledError' || err.code === 'ERR_CANCELED') return;
            setAlumnos([]);
            toast.error('No se pudo cargar la lista de morosos. Intenta de nuevo.');
        } finally {
            setLoading(false);
        }
    }, [busqueda, fetchDeudas]);

    useEffect(() => {
        const controller = new AbortController();
        const timer = setTimeout(() => fetchMorosos(controller.signal), 300);
        return () => { clearTimeout(timer); controller.abort(); };
    }, [fetchMorosos]);

    const refetch = useCallback(() => fetchMorosos(), [fetchMorosos]);

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
        () => Object.values(deudas).reduce((s, v) => s + (v ?? 0), 0),
        [deudas]
    );

    return {
        alumnos,
        deudas,
        loading,
        loadingDeudas,
        exportingExcel,
        totalDeudaUSD,
        refetch,
        handleExportExcel,
    };
}
