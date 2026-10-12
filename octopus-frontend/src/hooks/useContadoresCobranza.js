import { useCallback, useEffect, useRef, useState } from 'react';
import { useSede } from '../context/SedeContext';
import { usePolling } from './usePolling';
import { getContadoresInteligente } from '../api/cobranza.service';

// Sin permiso (403), módulo apagado (409) o ruta inexistente: el badge simplemente no se muestra.
const SIN_BADGE = [403, 404, 409];

/**
 * Contadores del badge de la entrada "Cobranza Inteligente" del sidebar
 * (no leídos + tarjetas urgentes) desde GET cobranza/inteligente/contadores/,
 * refrescados con usePolling. Nunca muestra toasts: es solo un adorno.
 */
export function useContadoresCobranza() {
    const { sedeActiva } = useSede();
    const sedeId = sedeActiva?.id ?? null;
    const [estado, setEstado] = useState({ sedeId: undefined, total: 0, inactivo: false });
    const sedeRef = useRef(sedeId);
    useEffect(() => {
        sedeRef.current = sedeId;
    }, [sedeId]);

    const consultar = useCallback(async (signal) => {
        const pedida = sedeRef.current;
        try {
            const res = await getContadoresInteligente(pedida, signal);
            setEstado({ sedeId: pedida, total: Number(res.data?.total) || 0, inactivo: false });
        } catch (err) {
            if (err?.code === 'ERR_CANCELED') return;
            if (SIN_BADGE.includes(err?.response?.status)) {
                setEstado({ sedeId: pedida, total: 0, inactivo: true });
                return;
            }
            // Error transitorio: se conserva el último valor y se reintenta en el siguiente ciclo (sin toast).
        }
    }, []);

    useEffect(() => {
        const controller = new AbortController();
        consultar(controller.signal).catch(() => {});
        return () => controller.abort();
    }, [sedeId, consultar]);

    const vigente = estado.sedeId === sedeId;
    usePolling(() => consultar(), { activo: !(vigente && estado.inactivo) });

    return { total: vigente ? estado.total : 0 };
}

export default useContadoresCobranza;
