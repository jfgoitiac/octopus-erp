import { useState, useEffect, useCallback, useRef } from 'react';
import axiosInstance from '../api/apiClient';

export const useTasaBCV = () => {
    const [tasa, setTasa] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [ultimaActualizacion, setUltimaActualizacion] = useState(null);
    const timerRef = useRef(null);

    const estaEnHorarioBancario = () => {
        const ahora = new Date();
        const dia = ahora.getDay();
        const hora = ahora.getHours();
        return dia >= 1 && dia <= 5 && hora >= 8 && hora < 17;
    };

    const fetchTasa = useCallback(async () => {
        try {
            const res = await axiosInstance.get('cobranza/stats/');
            const nuevaTasa = res.data?.tasa_bcv;

            if (nuevaTasa && nuevaTasa > 0) {
                setTasa(nuevaTasa);
                setUltimaActualizacion(new Date());
                setError(null);
            }
        } catch (err) {
            setError('Tasa no actualizada');
            console.error('Fallo al refrescar tasa BCV:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchTasa();

        const iniciarPolling = () => {
            const intervalo = estaEnHorarioBancario() ? 10 * 60 * 1000 : 60 * 60 * 1000;

            timerRef.current = setTimeout(async () => {
                await fetchTasa();
                iniciarPolling();
            }, intervalo);
        };

        iniciarPolling();

        return () => {
            if (timerRef.current) clearTimeout(timerRef.current);
        };
    }, [fetchTasa]);

    return { tasa, loading, error, ultimaActualizacion, refetch: fetchTasa };
};
