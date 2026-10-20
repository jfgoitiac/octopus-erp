import { useState, useEffect, useCallback } from 'react';
import { toast } from 'react-toastify';
import { useSede } from '../context/SedeContext';

export const mensajeErrorInteligente = (err) =>
    err?.response?.data?.detail || 'No se pudo completar la acción. Intenta de nuevo.';

export const INTERVALO_REFRESCO_MS = 60_000;

/**
 * Carga datos de Cobranza Inteligente para la sede activa.
 * `apagada` = el backend respondió 409 (módulo apagado en esa sede).
 *
 * Se mantiene al día solo: vuelve a pedir los datos al regresar a la pestaña y
 * cada minuto mientras esté visible. Esas recargas son silenciosas (conservan
 * lo que ya se ve, sin skeleton ni toast si fallan); `loading` solo es true al
 * cargar por primera vez o al cambiar de sede.
 */
export function useCargaInteligente(cargador) {
    const { sedeActiva } = useSede();
    const sedeId = sedeActiva?.id ?? null;
    const [estado, setEstado] = useState({ sedeId: undefined, data: null, apagada: false });
    const [version, setVersion] = useState(0);

    useEffect(() => {
        const controller = new AbortController();
        const esRecarga = version > 0;
        cargador(sedeId, controller.signal)
            .then(res => setEstado({ sedeId, data: res.data, apagada: false }))
            .catch(err => {
                if (err?.code === 'ERR_CANCELED') return;
                const apagada = err?.response?.status === 409;
                // Una recarga que falla no borra lo que ya se ve ni molesta con toasts.
                if (esRecarga && !apagada) return;
                setEstado({ sedeId, data: null, apagada });
                if (!apagada) toast.error(mensajeErrorInteligente(err));
            });
        return () => controller.abort();
    }, [cargador, sedeId, version]);

    const recargar = useCallback(() => setVersion(v => v + 1), []);

    useEffect(() => {
        const refrescar = () => {
            if (document.visibilityState === 'visible') recargar();
        };
        const timer = setInterval(refrescar, INTERVALO_REFRESCO_MS);
        document.addEventListener('visibilitychange', refrescar);
        return () => {
            clearInterval(timer);
            document.removeEventListener('visibilitychange', refrescar);
        };
    }, [recargar]);

    const loading = estado.sedeId !== sedeId;
    return { data: loading ? null : estado.data, apagada: !loading && estado.apagada, loading, recargar, sedeId };
}
