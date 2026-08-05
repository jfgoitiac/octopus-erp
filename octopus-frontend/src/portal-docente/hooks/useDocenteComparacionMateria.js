import { useState, useEffect, useCallback, useRef } from 'react';
import { getComparacionMateria } from '../api/academico.service';

// Sin toast de error a propósito: es contexto secundario dentro del tab de
// notas, no debe interrumpir al docente si falla.
export function useDocenteComparacionMateria(materiaId, lapsoId) {
  const [comparacion, setComparacion] = useState(null);
  const [loading, setLoading] = useState(false);

  const abortRef = useRef(null);
  useEffect(() => () => abortRef.current?.abort(), []);

  const fetchComparacion = useCallback(async () => {
    if (!materiaId || !lapsoId) {
      setComparacion(null);
      setLoading(false);
      return;
    }
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    try {
      const res = await getComparacionMateria(materiaId, lapsoId, controller.signal);
      if (controller.signal.aborted) return;
      setComparacion(res.data || null);
    } catch (err) {
      if (err.code === 'ERR_CANCELED' || controller.signal.aborted) return;
      setComparacion(null);
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [materiaId, lapsoId]);

  useEffect(() => { fetchComparacion(); }, [fetchComparacion]);

  return { comparacion, loading };
}
