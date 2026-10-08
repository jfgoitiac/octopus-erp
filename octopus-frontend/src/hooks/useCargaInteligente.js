import { useState, useEffect, useCallback } from 'react';
import { toast } from 'react-toastify';
import { useSede } from '../context/SedeContext';

export const mensajeErrorInteligente = (err) =>
    err?.response?.data?.detail || 'No se pudo completar la acción. Intenta de nuevo.';

/**
 * Carga datos de Cobranza Inteligente para la sede activa.
 * `apagada` = el backend respondió 409 (módulo apagado en esa sede).
 */
export function useCargaInteligente(cargador) {
    const { sedeActiva } = useSede();
    const sedeId = sedeActiva?.id ?? null;
    const [estado, setEstado] = useState({ key: undefined, data: null, apagada: false });
    const [version, setVersion] = useState(0);
    const key = `${sedeId}:${version}`;

    useEffect(() => {
        const controller = new AbortController();
        cargador(sedeId, controller.signal)
            .then(res => setEstado({ key, data: res.data, apagada: false }))
            .catch(err => {
                if (err?.code === 'ERR_CANCELED') return;
                const apagada = err?.response?.status === 409;
                setEstado({ key, data: null, apagada });
                if (!apagada) toast.error(mensajeErrorInteligente(err));
            });
        return () => controller.abort();
    }, [cargador, sedeId, key]);

    const recargar = useCallback(() => setVersion(v => v + 1), []);
    const loading = estado.key !== key;
    return { data: loading ? null : estado.data, apagada: !loading && estado.apagada, loading, recargar, sedeId };
}
