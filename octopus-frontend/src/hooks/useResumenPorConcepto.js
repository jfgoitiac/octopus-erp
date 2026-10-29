import { useState, useCallback, useEffect } from 'react';
import { toast } from 'react-toastify';
import { getResumenPorConcepto } from '../api/cobranza.service';
import { useAutoRefresh } from './useAutoRefresh';

/**
 * Resumen de líneas de un concepto cobrable (una por mes si es periódico,
 * una sola si no) para la pestaña "Pagos por concepto" de Reportes.
 * `autoRefresh`: se refresca en silencio cada minuto y al volver a la pestaña.
 */
export function useResumenPorConcepto({ concepto, vista = 'global', periodoEscolar, sede, autoRefresh = false } = {}) {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(false);

    const fetchResumen = useCallback(async (signal, silencioso = false) => {
        if (!concepto) { setData(null); return; }
        if (!silencioso) {
            setLoading(true);
            setError(false);
        }
        try {
            const params = { concepto, vista };
            if (periodoEscolar) params.periodo_escolar = periodoEscolar;
            if (sede) params.sede = sede;
            const res = await getResumenPorConcepto(params, signal);
            setData(res.data ?? null);
        } catch (err) {
            if (err.name === 'CanceledError' || err.code === 'ERR_CANCELED') return;
            if (silencioso) return;
            setError(true);
            toast.error('No se pudo cargar el resumen del concepto.');
        } finally {
            if (!silencioso) setLoading(false);
        }
    }, [concepto, vista, periodoEscolar, sede]);

    const refrescar = useCallback(() => {
        if (autoRefresh) fetchResumen(undefined, true);
    }, [autoRefresh, fetchResumen]);
    useAutoRefresh(refrescar);

    useEffect(() => {
        const controller = new AbortController();
        fetchResumen(controller.signal);
        return () => controller.abort();
    }, [fetchResumen]);

    const retry = useCallback(() => {
        const controller = new AbortController();
        fetchResumen(controller.signal);
    }, [fetchResumen]);

    return {
        conceptoNombre: data?.concepto_nombre ?? null,
        periodico: data?.periodico ?? true,
        nivel: data?.nivel ?? 'alumno',
        lineas: data?.lineas ?? [],
        totales: data?.totales ?? null,
        loading,
        error,
        retry,
    };
}

export default useResumenPorConcepto;
