import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'react-toastify';
import { useSede } from '../../../context/useSede';
import { usePolling } from '../../../hooks/usePolling';
import { mensajeErrorInteligente } from '../../../hooks/useCargaInteligente';
import { getPagosRevisionInteligente, getConveniosInteligente } from '../../../api/cobranza.service';
import { getCarteraCompleta } from './carteraApi';
import { agruparCartera } from './carteraUtils';

const pedir = async (sedeId, signal) => {
    const [ciclos, pagos, convenios] = await Promise.all([
        getCarteraCompleta(sedeId, signal),
        getPagosRevisionInteligente(sedeId, signal),
        getConveniosInteligente(signal),
    ]);
    const listaPagos = pagos.data?.results || [];
    return {
        filas: agruparCartera(ciclos, listaPagos, convenios.data?.results || []),
        pagos: listaPagos,
    };
};

/** Carga la cartera de la sede activa y la refresca sola con usePolling. */
export function useCartera() {
    const { sedeActiva } = useSede();
    const sedeId = sedeActiva?.id ?? null;
    // `key` indica para qué sede son los datos; si no coincide con la sede activa, está cargando.
    const [estado, setEstado] = useState({ key: undefined, filas: [], pagos: [], apagada: false });
    const sedeRef = useRef(sedeId);
    useEffect(() => {
        sedeRef.current = sedeId;
    }, [sedeId]);

    useEffect(() => {
        const controller = new AbortController();
        pedir(sedeId, controller.signal)
            .then(d => setEstado({ key: sedeId, ...d, apagada: false }))
            .catch(err => {
                if (err?.code === 'ERR_CANCELED') return;
                const apagada = err?.response?.status === 409;
                setEstado({ key: sedeId, filas: [], pagos: [], apagada });
                if (!apagada) toast.error(mensajeErrorInteligente(err));
            });
        return () => controller.abort();
    }, [sedeId]);

    // Refresco silencioso: si falla, usePolling aplica backoff y avisa una sola vez.
    const refrescar = useCallback(async () => {
        const d = await pedir(sedeRef.current);
        setEstado({ key: sedeRef.current, ...d, apagada: false });
    }, []);
    const loading = estado.key !== sedeId;
    usePolling(refrescar, { activo: !loading && !estado.apagada });

    return { filas: loading ? [] : estado.filas, pagos: estado.pagos, apagada: !loading && estado.apagada, loading, refrescar };
}

export default useCartera;
