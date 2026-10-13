import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'react-toastify';
import { useSede } from '../context/useSede';
import { usePolling } from './usePolling';
import { mensajeErrorInteligente } from './useCargaInteligente';
import { getHoyInteligente } from '../api/cobranza.service';

/**
 * Carga la pestaña "Hoy" (GET cobranza/inteligente/hoy/) de la sede activa y la
 * refresca sola con usePolling (12 s). `apagada` = el backend respondió 409.
 */
export function useCobranzaHoy() {
    const { sedeActiva } = useSede();
    const sedeId = sedeActiva?.id ?? null;
    // `key` indica para qué sede son los datos; si no coincide con la sede activa, está cargando.
    const [estado, setEstado] = useState({ key: undefined, data: null, apagada: false });
    const sedeRef = useRef(sedeId);
    useEffect(() => {
        sedeRef.current = sedeId;
    }, [sedeId]);

    useEffect(() => {
        const controller = new AbortController();
        getHoyInteligente(sedeId, controller.signal)
            .then(res => setEstado({ key: sedeId, data: res.data, apagada: false }))
            .catch(err => {
                if (err?.code === 'ERR_CANCELED') return;
                const apagada = err?.response?.status === 409;
                setEstado({ key: sedeId, data: null, apagada });
                if (!apagada) toast.error(mensajeErrorInteligente(err));
            });
        return () => controller.abort();
    }, [sedeId]);

    // Refresco silencioso: si falla, usePolling aplica backoff y avisa una sola vez.
    const refrescar = useCallback(async () => {
        const res = await getHoyInteligente(sedeRef.current);
        setEstado({ key: sedeRef.current, data: res.data, apagada: false });
    }, []);

    const loading = estado.key !== sedeId;
    usePolling(refrescar, { activo: !loading && !estado.apagada });

    return {
        data: loading ? null : estado.data,
        apagada: !loading && estado.apagada,
        loading,
        refrescar,
    };
}

export default useCobranzaHoy;
