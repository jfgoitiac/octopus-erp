import { useState, useCallback, useEffect } from 'react';
import { toast } from 'react-toastify';
import { getSolvenciaMensual } from '../api/cobranza.service';

/**
 * Solvencia mensual del período escolar activo, para el bloque "Solvencia
 * por grado" del dashboard. El backend manda TODOS los meses del período de
 * una sola vez — cambiar de mes en el bloque no dispara una nueva llamada.
 */
export function useSolvenciaMensual({ anioEscolar, sede } = {}) {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);

    const fetchSolvencia = useCallback(async (signal) => {
        setLoading(true);
        setError(false);
        try {
            const params = {};
            if (anioEscolar) params.anio_escolar = anioEscolar;
            if (sede) params.sede = sede;
            const res = await getSolvenciaMensual(params, signal);
            setData(res.data ?? null);
        } catch (err) {
            if (err.name === 'CanceledError' || err.code === 'ERR_CANCELED') return;
            setError(true);
            toast.error('No se pudo cargar la solvencia por grado.');
        } finally {
            setLoading(false);
        }
    }, [anioEscolar, sede]);

    useEffect(() => {
        const controller = new AbortController();
        fetchSolvencia(controller.signal);
        return () => controller.abort();
    }, [fetchSolvencia]);

    const retry = useCallback(() => {
        const controller = new AbortController();
        fetchSolvencia(controller.signal);
    }, [fetchSolvencia]);

    return {
        periodoEscolar: data?.periodo_escolar ?? null,
        meses: data?.meses ?? [],
        porGrado: data?.por_grado ?? [],
        totales: data?.totales ?? null,
        loading,
        error,
        retry,
    };
}

export default useSolvenciaMensual;
