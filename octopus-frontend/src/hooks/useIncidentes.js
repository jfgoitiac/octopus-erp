import { useState, useCallback, useEffect, useRef } from 'react';
import { toast } from 'react-toastify';
import { getIncidentes, createIncidente } from '../api/academico.service';

export function useIncidentes() {
  const [incidentes, setIncidentes] = useState([]);
  const [loading, setLoading]       = useState(true);
  const [severidad, setSeveridad]   = useState('');

  const abortRef = useRef(null);
  useEffect(() => () => abortRef.current?.abort(), []);

  const fetchIncidentes = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    try {
      const filtros = severidad ? { severidad } : {};
      const res = await getIncidentes(filtros, controller.signal);
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
    try {
      const res = await createIncidente(datos);
      setIncidentes(prev => [res.data, ...prev]);
      toast.success('Incidente registrado correctamente.');
      return true;
    } catch (err) {
      const msg = err.response?.data?.descripcion?.[0]
        || err.response?.data?.error
        || err.response?.data?.detail
        || 'No se pudo registrar el incidente.';
      toast.error(msg);
      return false;
    }
  }, []);

  return {
    incidentes,
    loading,
    severidad,
    setSeveridad,
    registrarIncidente,
    refetch: fetchIncidentes,
  };
}
