import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { toast } from 'react-toastify';
import { getMensajes, enviarMensaje as enviarMensajeApi, marcarMensajeLeido } from '../api/comunicacion.service';

export function useMensajes() {
  const [mensajes, setMensajes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [alumnoActivo, setAlumnoActivo] = useState(null); // { id, nombre }
  const [enviando, setEnviando] = useState(false);

  const abortRef = useRef(null);
  useEffect(() => () => abortRef.current?.abort(), []);

  const fetchMensajes = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    try {
      const res = await getMensajes(null, controller.signal);
      if (controller.signal.aborted) return;
      setMensajes(res.data || []);
    } catch (err) {
      if (err.code === 'ERR_CANCELED' || controller.signal.aborted) return;
      toast.error('No se pudieron cargar los mensajes.');
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => { fetchMensajes(); }, [fetchMensajes]);

  // Agrupa mensajes por alumno para armar la lista de conversaciones.
  const conversaciones = useMemo(() => {
    const porAlumno = new Map();
    for (const m of mensajes) {
      const existente = porAlumno.get(m.alumno_id);
      if (!existente || new Date(m.fecha) > new Date(existente.ultimoMensaje.fecha)) {
        porAlumno.set(m.alumno_id, {
          alumnoId: m.alumno_id,
          alumnoNombre: m.alumno_nombre,
          ultimoMensaje: m,
        });
      }
    }
    return Array.from(porAlumno.values()).sort(
      (a, b) => new Date(b.ultimoMensaje.fecha) - new Date(a.ultimoMensaje.fecha)
    );
  }, [mensajes]);

  const mensajesConversacionActiva = useMemo(() => {
    if (!alumnoActivo) return [];
    return mensajes
      .filter(m => m.alumno_id === alumnoActivo.id)
      .sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
  }, [mensajes, alumnoActivo]);

  const enviar = useCallback(async (cuerpo) => {
    if (!alumnoActivo) return false;
    setEnviando(true);
    try {
      const res = await enviarMensajeApi({ alumno_id: alumnoActivo.id, cuerpo });
      setMensajes(prev => [...prev, res.data]);
      return true;
    } catch (err) {
      const msg = err.response?.data?.error || 'No se pudo enviar el mensaje.';
      toast.error(msg);
      return false;
    } finally {
      setEnviando(false);
    }
  }, [alumnoActivo]);

  // Inicia una conversación nueva con un alumno que todavía no tiene mensajes.
  const iniciarConversacion = useCallback(async (alumno, cuerpo) => {
    setEnviando(true);
    try {
      const res = await enviarMensajeApi({ alumno_id: alumno.id, cuerpo });
      setMensajes(prev => [...prev, res.data]);
      setAlumnoActivo({ id: alumno.id, nombre: `${alumno.nombre} ${alumno.apellido}` });
      return true;
    } catch (err) {
      const msg = err.response?.data?.error || 'No se pudo iniciar la conversación.';
      toast.error(msg);
      return false;
    } finally {
      setEnviando(false);
    }
  }, []);

  const marcarLeido = useCallback(async (id) => {
    try {
      await marcarMensajeLeido(id);
      setMensajes(prev => prev.map(m => (m.id === id ? { ...m, leido: true } : m)));
    } catch {
      // silencioso: no bloquea la lectura del chat si falla el marcado
    }
  }, []);

  return {
    conversaciones,
    mensajesConversacionActiva,
    alumnoActivo,
    setAlumnoActivo,
    loading,
    enviando,
    enviar,
    iniciarConversacion,
    marcarLeido,
    refetch: fetchMensajes,
  };
}
