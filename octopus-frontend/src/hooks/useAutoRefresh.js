import { useEffect, useRef } from 'react';

const DEFAULT_INTERVAL_MS = 60_000;

/**
 * Refresca datos periódicamente y al volver a la pestaña. Sin esto, un
 * dashboard abierto durante horas muestra cifras (solventes, morosos, cobros
 * del día) congeladas desde el primer fetch — el usuario tiene que recargar
 * la página a mano para verlas al día.
 */
export function useAutoRefresh(retry, intervalMs = DEFAULT_INTERVAL_MS) {
    const retryRef = useRef(retry);
    useEffect(() => {
        retryRef.current = retry;
    }, [retry]);

    useEffect(() => {
        const interval = setInterval(() => {
            if (document.visibilityState === 'visible') retryRef.current();
        }, intervalMs);

        const onVisibility = () => {
            if (document.visibilityState === 'visible') retryRef.current();
        };
        document.addEventListener('visibilitychange', onVisibility);

        return () => {
            clearInterval(interval);
            document.removeEventListener('visibilitychange', onVisibility);
        };
    }, [intervalMs]);
}
