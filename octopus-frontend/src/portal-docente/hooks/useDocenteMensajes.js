import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'react-toastify';
import { getMensajes, enviarMensaje, marcarMensajeLeido } from '../api/comunicacion.service';

export function useDocenteMensajes(alumnoId) {
  const [mensajes, setMensajes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [enviando, setEnviando] = useState(false);

  const abortRef = useRef(null);
  useEffect(() => () => abortRef.current?.abort(), []);

  const fetchMensajes = useCallback(async () => {
    if (!alumnoId) { setMensajes([]); setLoading(false); return; }
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    try {
      const res = await getMensajes(alumnoId, controller.signal);
      if (controller.signal.aborted) return;
      setMensajes(res.data || []);
    } catch (err) {
      if (err.code === 'ERR_CANCELED' || controller.signal.aborted) return;
      toast.error('No se pudieron cargar los mensajes.');
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [alumnoId]);

  useEffect(() => { fetchMensajes(); }, [fetchMensajes]);

  const enviar = useCallback(async (cuerpo) => {
    if (!alumnoId) return false;
    setEnviando(true);
    try {
      const res = await enviarMensaje({ alumno_id: alumnoId, cuerpo });
      setMensajes(prev => [...prev, res.data]);
      return true;
    } catch (err) {
      const msg = err.response?.data?.error || 'No se pudo enviar el mensaje.';
      toast.error(msg);
      return false;
    } finally {
      setEnviando(false);
    }
  }, [alumnoId]);

  const marcarLeido = useCallback(async (id) => {
    try {
      await marcarMensajeLeido(id);
      setMensajes(prev => prev.map(m => (m.id === id ? { ...m, leido: true } : m)));
    } catch {
      // silencioso
    }
  }, []);

  return { mensajes, loading, enviando, enviar, marcarLeido, refetch: fetchMensajes };
}
