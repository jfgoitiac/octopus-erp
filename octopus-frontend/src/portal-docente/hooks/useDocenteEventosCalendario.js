import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'react-toastify';
import { getEventosCalendario, createEventoCalendario, deleteEventoCalendario } from '../api/academico.service';

export function useDocenteEventosCalendario(mes, anio) {
  const [eventos, setEventos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creando, setCreando] = useState(false);

  const abortRef = useRef(null);
  useEffect(() => () => abortRef.current?.abort(), []);

  const fetchEventos = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    try {
      const res = await getEventosCalendario(mes, anio, controller.signal);
      if (controller.signal.aborted) return;
      setEventos(res.data || []);
    } catch (err) {
      if (err.code === 'ERR_CANCELED' || controller.signal.aborted) return;
      toast.error('No se pudieron cargar los eventos del calendario.');
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [mes, anio]);

  useEffect(() => { fetchEventos(); }, [fetchEventos]);

  const crearEvento = useCallback(async (datos) => {
    setCreando(true);
    try {
      const res = await createEventoCalendario(datos);
      setEventos(prev => [...prev, res.data].sort((a, b) => a.fecha.localeCompare(b.fecha)));
      toast.success('Evento agregado al calendario.');
      return true;
    } catch (err) {
      const msg = err.response?.data?.error
        || err.response?.data?.titulo?.[0]
        || err.response?.data?.fecha?.[0]
        || 'No se pudo agregar el evento.';
      toast.error(msg);
      return false;
    } finally {
      setCreando(false);
    }
  }, []);

  const eliminarEvento = useCallback(async (id) => {
    try {
      await deleteEventoCalendario(id);
      setEventos(prev => prev.filter(e => e.id !== id));
      toast.success('Evento eliminado.');
      return true;
    } catch {
      toast.error('No se pudo eliminar el evento.');
      return false;
    }
  }, []);

  return { eventos, loading, creando, crearEvento, eliminarEvento, refetch: fetchEventos };
}
