import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'react-toastify';
import {
  getAvisosPortal,
  marcarAvisoLeido,
  marcarTodosAvisosLeidos,
} from '../api/notificaciones.service';

const INTERVALO_MS = 2 * 60 * 1000;

const esCancelacion = (err) => err?.name === 'CanceledError' || err?.code === 'ERR_CANCELED';

/**
 * Bandeja de avisos del portal (campana del encabezado).
 *
 * Se refresca al montar, al volver el foco a la pestaña y cada ~2 minutos
 * mientras la pestaña está visible. Los fallos de la consulta son silenciosos
 * (el polling no debe llenar la pantalla de toasts): se exponen en `error`
 * para que el panel muestre un reintento. Solo las acciones del usuario
 * (marcar leído) avisan con toast si fallan.
 */
export function useAvisosPortal() {
  const [avisos, setAvisos] = useState([]);
  const [noLeidos, setNoLeidos] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const abortRef = useRef(null);

  // Cadena de promesas (sin setState síncrono) para poder llamarla desde el
  // efecto de montaje sin cascadas de render.
  const cargar = useCallback(() => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    return getAvisosPortal(controller.signal)
      .then((res) => {
        if (controller.signal.aborted) return;
        const resultados = Array.isArray(res.data?.resultados) ? res.data.resultados : [];
        setAvisos(resultados);
        setNoLeidos(Number(res.data?.no_leidos ?? resultados.filter((a) => !a.leido).length) || 0);
        setError(false);
      })
      .catch((err) => {
        if (esCancelacion(err) || controller.signal.aborted) return;
        setError(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
  }, []);

  useEffect(() => {
    cargar();
    const intervalo = setInterval(() => {
      if (document.visibilityState === 'visible') cargar();
    }, INTERVALO_MS);
    const alCambiarVisibilidad = () => {
      if (document.visibilityState === 'visible') cargar();
    };
    document.addEventListener('visibilitychange', alCambiarVisibilidad);
    return () => {
      clearInterval(intervalo);
      document.removeEventListener('visibilitychange', alCambiarVisibilidad);
      abortRef.current?.abort();
    };
  }, [cargar]);

  // Optimista: el aviso se ve leído al instante; si el servidor falla se
  // avisa una vez y se recarga el estado real.
  const marcarLeido = useCallback(async (aviso) => {
    if (!aviso || aviso.leido) return;
    setAvisos((lista) => lista.map((a) => (a.id === aviso.id ? { ...a, leido: true } : a)));
    setNoLeidos((n) => Math.max(0, n - 1));
    try {
      await marcarAvisoLeido(aviso.id);
    } catch {
      toast.error('No se pudo marcar el aviso como leído.', { toastId: 'portal-aviso-leer' });
      cargar();
    }
  }, [cargar]);

  const marcarTodos = useCallback(async () => {
    const previos = avisos;
    const previoNoLeidos = noLeidos;
    setAvisos((lista) => lista.map((a) => ({ ...a, leido: true })));
    setNoLeidos(0);
    try {
      await marcarTodosAvisosLeidos();
      toast.success('Listo, marcaste todo como leído.', { toastId: 'portal-avisos-todos' });
    } catch {
      setAvisos(previos);
      setNoLeidos(previoNoLeidos);
      toast.error('No se pudieron marcar los avisos. Intenta nuevamente.', { toastId: 'portal-avisos-todos' });
    }
  }, [avisos, noLeidos]);

  return { avisos, noLeidos, loading, error, recargar: cargar, marcarLeido, marcarTodos };
}
