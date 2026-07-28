import { useState, useCallback, useEffect, useRef } from 'react';
import { toast } from 'react-toastify';
import { getCirculares, createCircular } from '../api/comunicacion.service';

export function useCirculares() {
  const [circulares, setCirculares] = useState([]);
  const [loading, setLoading]       = useState(true);

  const abortRef = useRef(null);
  useEffect(() => () => abortRef.current?.abort(), []);

  const fetchCirculares = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    try {
      const res = await getCirculares(1, controller.signal);
      if (controller.signal.aborted) return;
      setCirculares(res.data?.results ?? res.data ?? []);
    } catch (err) {
      if (err.code === 'ERR_CANCELED' || controller.signal.aborted) return;
      toast.error('No se pudieron cargar las circulares.');
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => { fetchCirculares(); }, [fetchCirculares]);

  const publicarCircular = useCallback(async (datos) => {
    try {
      const res = await createCircular(datos);
      setCirculares(prev => [res.data, ...prev]);
      toast.success('Circular publicada correctamente.');
      return true;
    } catch (err) {
      const msg = err.response?.data?.error
        || err.response?.data?.titulo?.[0]
        || err.response?.data?.detail
        || 'No se pudo publicar la circular.';
      toast.error(msg);
      return false;
    }
  }, []);

  return {
    circulares,
    loading,
    publicarCircular,
    refetch: fetchCirculares,
  };
}
