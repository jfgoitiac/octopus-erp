import { useState, useCallback, useEffect } from 'react';
import { format } from 'date-fns';
import { toast } from 'react-toastify';
import {
    getEstadoPorConcepto,
    exportarEstadoPorConceptoExcel,
} from '../api/cobranza.service';

const PAGE_SIZE = 20;

/**
 * Listado paginado de filas (alumno o representante) para el detalle por
 * nombre de un concepto — el modal de la pestaña "Pagos por concepto".
 * Solo consulta cuando `enabled` es true (el modal está abierto).
 */
export function useEstadoPorConcepto({
    concepto, estado = 'todos', mes, anio, numeroCuota,
    periodoEscolar, gradoSeccion, buscar, enabled = true,
} = {}) {
    const [filas, setFilas] = useState([]);
    const [resumen, setResumen] = useState(null);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(false);
    const [exportingExcel, setExportingExcel] = useState(false);

    const buildParams = useCallback(() => {
        const params = { concepto, estado, page, page_size: PAGE_SIZE };
        if (mes != null) params.mes = mes;
        if (anio != null) params.anio = anio;
        if (numeroCuota != null) params.numero_cuota = numeroCuota;
        if (periodoEscolar) params.periodo_escolar = periodoEscolar;
        if (gradoSeccion) params.grado_seccion = gradoSeccion;
        if (buscar?.trim()) params.buscar = buscar.trim();
        return params;
    }, [concepto, estado, page, mes, anio, numeroCuota, periodoEscolar, gradoSeccion, buscar]);

    const fetchEstado = useCallback(async (signal) => {
        if (!enabled || !concepto) return;
        setLoading(true);
        try {
            const res = await getEstadoPorConcepto(buildParams(), signal);
            setFilas(res.data?.results ?? []);
            setTotal(res.data?.count ?? 0);
            setResumen(res.data?.resumen ?? null);
        } catch (err) {
            if (err.name === 'CanceledError' || err.code === 'ERR_CANCELED') return;
            if (err.response?.status === 404 && page > 1) { setPage(1); return; }
            setFilas([]);
            toast.error('No se pudo cargar el detalle del concepto.');
        } finally {
            setLoading(false);
        }
    }, [enabled, concepto, page, buildParams]);

    // Cambiar cualquier filtro reinicia siempre a la página 1
    useEffect(() => { setPage(1); }, [concepto, estado, mes, anio, numeroCuota, periodoEscolar, gradoSeccion, buscar]);

    useEffect(() => {
        const controller = new AbortController();
        const timer = setTimeout(() => fetchEstado(controller.signal), 300);
        return () => { clearTimeout(timer); controller.abort(); };
    }, [fetchEstado]);

    const handleExportExcel = useCallback(async () => {
        if (!concepto) return;
        setExportingExcel(true);
        try {
            const { page: _p, page_size: _ps, ...paramsSinPaginar } = buildParams();
            const res = await exportarEstadoPorConceptoExcel(paramsSinPaginar);
            const url = URL.createObjectURL(new Blob([res.data], {
                type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            }));
            const a = Object.assign(document.createElement('a'), {
                href: url,
                download: `${concepto}_${format(new Date(), 'yyyy-MM-dd')}.xlsx`,
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
    }, [concepto, buildParams]);

    return {
        filas,
        resumen,
        loading,
        exportingExcel,
        handleExportExcel,
        page, setPage, total, totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)), pageSize: PAGE_SIZE,
    };
}

export default useEstadoPorConcepto;
