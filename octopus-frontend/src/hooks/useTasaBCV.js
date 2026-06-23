import { useState, useEffect, useCallback, useRef } from 'react';
import axiosInstance from '../api/apiClient';

export const useTasaBCV = () => {
    const [tasa, setTasa] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [ultimaActualizacion, setUltimaActualizacion] = useState(null);
    const timerRef    = useRef(null);
    const isMountedRef = useRef(true);
    const abortFetchRef = useRef(null);

    const estaEnHorarioBancario = () => {
        const ahora = new Date();
        const dia = ahora.getUTCDay();
        const horaVE = (ahora.getUTCHours() - 4 + 24) % 24; // UTC-4 Venezuela
        return dia >= 1 && dia <= 5 && horaVE >= 8 && horaVE < 17;
    };

    const fetchTasa = useCallback(async () => {
        abortFetchRef.current?.abort();
        abortFetchRef.current = new AbortController();
        try {
            const res = await axiosInstance.get('cobranza/stats/', {
                signal: abortFetchRef.current.signal,
            });
            const nuevaTasa = res.data?.tasa_bcv;
            if (nuevaTasa && nuevaTasa > 0) {
                setTasa(nuevaTasa);
                setUltimaActualizacion(new Date());
                setError(null);
            }
        } catch (err) {
            if (err.name === 'CanceledError' || err.code === 'ERR_CANCELED') return;
            setError('Tasa no actualizada');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        isMountedRef.current = true;
        fetchTasa();

        const iniciarPolling = () => {
            const intervalo = estaEnHorarioBancario() ? 10 * 60 * 1000 : 60 * 60 * 1000;
            timerRef.current = setTimeout(async () => {
                if (!isMountedRef.current) return;
                await fetchTasa();
                if (isMountedRef.current) iniciarPolling();
            }, intervalo);
        };

        iniciarPolling();

        return () => {
            isMountedRef.current = false;
            if (timerRef.current) clearTimeout(timerRef.current);
            abortFetchRef.current?.abort();
        };
    }, [fetchTasa]);

    return { tasa, loading, error, ultimaActualizacion, refetch: fetchTasa };
};
