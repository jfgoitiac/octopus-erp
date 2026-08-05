import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'react-toastify';
import { getIncidentes, createIncidente } from '../api/academico.service';

export function useDocenteIncidentes(severidad) {
  const [incidentes, setIncidentes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creando, setCreando] = useState(false);

  const abortRef = useRef(null);
  useEffect(() => () => abortRef.current?.abort(), []);

  const fetchIncidentes = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    try {
      const res = await getIncidentes(severidad ? { severidad } : null, controller.signal);
      if (controller.signal.aborted) return;
      setIncidentes(res.data || []);
    } catch (err) {
      if (err.code === 'ERR_CANCELED' || controller.signal.aborted) return;
      toast.error('No se pudieron cargar los incidentes.');
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [severidad]);

  useEffect(() => { fetchIncidentes(); }, [fetchIncidentes]);

  const registrarIncidente = useCallback(async (datos) => {
    setCreando(true);
    try {
      const res = await createIncidente(datos);
      setIncidentes(prev => [res.data, ...prev]);
      toast.success('Incidente registrado correctamente.');
      return true;
    } catch (err) {
      const msg = err.response?.data?.error
        || err.response?.data?.descripcion?.[0]
        || err.response?.data?.detail
        || 'No se pudo registrar el incidente.';
      toast.error(msg);
      return false;
    } finally {
      setCreando(false);
    }
  }, []);

  return { incidentes, loading, creando, registrarIncidente, refetch: fetchIncidentes };
}
