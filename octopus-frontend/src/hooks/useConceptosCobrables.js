import { useState, useCallback, useEffect } from 'react';
import { toast } from 'react-toastify';
import { getConceptosCobrables } from '../api/cobranza.service';

/**
 * Lista de conceptos cobrables (mensualidad, inscripción, solvencia, cargos
 * especiales…). Poblada 100% por el backend — nunca hardcodear conceptos.
 */
export function useConceptosCobrables() {
    const [conceptos, setConceptos] = useState([]);
    const [loading, setLoading] = useState(true);

    const fetchConceptos = useCallback(async (signal) => {
        setLoading(true);
        try {
            const res = await getConceptosCobrables(signal);
            setConceptos(res.data?.conceptos ?? []);
        } catch (err) {
            if (err.name === 'CanceledError' || err.code === 'ERR_CANCELED') return;
            toast.error('No se pudo cargar la lista de conceptos cobrables.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        const controller = new AbortController();
        fetchConceptos(controller.signal);
        return () => controller.abort();
    }, [fetchConceptos]);

    return { conceptos, loading };
}

export default useConceptosCobrables;
