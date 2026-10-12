import { useEffect, useRef } from 'react';
import { toast } from 'react-toastify';

export const INTERVALO_POLLING_MS = 12_000;
// Espera tras 1 fallo y tras 2 o más fallos seguidos (sin fallos se usa `intervalo`).
const ESPERA_TRAS_FALLO_MS = [30_000, 60_000];
const TOAST_ID = 'usePolling-error';

/**
 * Ejecuta `consulta` cada `intervalo` ms (12 s por defecto) mientras la pestaña esté visible.
 *  - Con `document.hidden` no consulta; al volver a la pestaña consulta de inmediato.
 *  - Si `consulta` falla, aplica backoff 12 → 30 → 60 s y muestra UN solo toast
 *    hasta que una consulta vuelva a funcionar.
 *  - No hace la primera consulta al montar: la carga inicial la hace quien llama.
 * `consulta` puede ser síncrona o devolver una promesa; si rechaza, cuenta como fallo.
 */
export function usePolling(consulta, {
    intervalo = INTERVALO_POLLING_MS,
    activo = true,
    mensajeError = 'No se pudo actualizar la información. Reintentando…',
} = {}) {
    const consultaRef = useRef(consulta);
    useEffect(() => {
        consultaRef.current = consulta;
    }, [consulta]);

    useEffect(() => {
        if (!activo) return undefined;
        let timer = null;
        let fallos = 0;
        let avisado = false;
        let enCurso = false;
        let cancelado = false;

        const espera = () => (
            fallos === 0
                ? intervalo
                : ESPERA_TRAS_FALLO_MS[Math.min(fallos - 1, ESPERA_TRAS_FALLO_MS.length - 1)]
        );

        const programar = () => {
            clearTimeout(timer);
            if (cancelado || document.hidden) return;
            timer = setTimeout(ejecutar, espera());
        };

        async function ejecutar() {
            if (cancelado || enCurso || document.hidden) return;
            enCurso = true;
            try {
                await consultaRef.current();
                fallos = 0;
                avisado = false;
            } catch (err) {
                if (err?.code !== 'ERR_CANCELED') {
                    fallos += 1;
                    if (!avisado) {
                        avisado = true;
                        toast.error(mensajeError, { toastId: TOAST_ID });
                    }
                }
            } finally {
                enCurso = false;
                programar();
            }
        }

        const alCambiarVisibilidad = () => {
            clearTimeout(timer);
            if (!document.hidden) ejecutar();
        };

        document.addEventListener('visibilitychange', alCambiarVisibilidad);
        programar();
        return () => {
            cancelado = true;
            clearTimeout(timer);
            document.removeEventListener('visibilitychange', alCambiarVisibilidad);
        };
    }, [intervalo, activo, mensajeError]);
}

export default usePolling;
