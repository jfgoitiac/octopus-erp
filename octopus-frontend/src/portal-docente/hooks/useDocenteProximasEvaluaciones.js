import { useState, useEffect, useCallback, useRef } from 'react';
import { getProximasEvaluaciones } from '../api/academico.service';

// Sin toast de error a propósito: alimenta un slide secundario del hero
// (mismo criterio que otros widgets "de apoyo" del dashboard) — si falla,
// simplemente se muestra el estado vacío en vez de interrumpir con un toast.
export function useDocenteProximasEvaluaciones(limite = 5) {
  const [proximasEvaluaciones, setProximasEvaluaciones] = useState([]);
  const [loading, setLoading] = useState(true);

  const abortRef = useRef(null);
  useEffect(() => () => abortRef.current?.abort(), []);

  const fetchProximasEvaluaciones = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    try {
      const res = await getProximasEvaluaciones(limite, controller.signal);
      if (controller.signal.aborted) return;
      setProximasEvaluaciones(res.data || []);
    } catch (err) {
      if (err.code === 'ERR_CANCELED' || controller.signal.aborted) return;
      setProximasEvaluaciones([]);
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [limite]);

  useEffect(() => { fetchProximasEvaluaciones(); }, [fetchProximasEvaluaciones]);

  return { proximasEvaluaciones, loading };
}
