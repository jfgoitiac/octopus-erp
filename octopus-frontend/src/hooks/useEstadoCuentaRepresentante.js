import { useState, useCallback, useEffect } from 'react';
import { toast } from 'react-toastify';
import { getEstadoCuentaRepresentante } from '../api/cobranza.service';

const PAGE_SIZE = 10;

/**
 * Estado de cuenta completo de un representante: cargos agrupados por
 * concepto + historial de pagos paginado. Falla aislada: quien la use debe
 * seguir renderizando el resto de su UI aunque esta llamada falle.
 */
export function useEstadoCuentaRepresentante(representanteId, { enabled = true } = {}) {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);
    const [page, setPage] = useState(1);

    const fetchEstadoCuenta = useCallback(async (signal) => {
        if (!enabled || !representanteId) { setLoading(false); return; }
        setLoading(true);
        setError(false);
        try {
            const res = await getEstadoCuentaRepresentante(
                representanteId,
                { page, page_size: PAGE_SIZE },
                signal
            );
            setData(res.data ?? null);
        } catch (err) {
            if (err.name === 'CanceledError' || err.code === 'ERR_CANCELED') return;
            setError(true);
            toast.error('No se pudo cargar el estado de cuenta del representante.');
        } finally {
            setLoading(false);
        }
    }, [representanteId, enabled, page]);

    useEffect(() => { setPage(1); }, [representanteId]);

    useEffect(() => {
        const controller = new AbortController();
        fetchEstadoCuenta(controller.signal);
        return () => controller.abort();
    }, [fetchEstadoCuenta]);

    const retry = useCallback(() => {
        const controller = new AbortController();
        fetchEstadoCuenta(controller.signal);
    }, [fetchEstadoCuenta]);

    const historial = data?.historial_pagos ?? { count: 0, results: [] };
    const totalPages = Math.max(1, Math.ceil((historial.count ?? 0) / PAGE_SIZE));

    return {
        representante: data?.representante ?? null,
        alumnos: data?.alumnos ?? [],
        cargos: data?.cargos ?? [],
        totales: data?.totales ?? null,
        historialPagos: historial.results ?? [],
        loading,
        error,
        retry,
        // Paginación del historial de pagos
        page, setPage, total: historial.count ?? 0, totalPages, pageSize: PAGE_SIZE,
    };
}

export default useEstadoCuentaRepresentante;
