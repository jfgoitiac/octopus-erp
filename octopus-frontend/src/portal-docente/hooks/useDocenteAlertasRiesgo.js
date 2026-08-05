import { useState, useEffect, useCallback, useRef } from 'react';
import { getAlertasRiesgo } from '../api/academico.service';

// Sin toast de error a propósito: alimenta un slide secundario del hero
// (mismo criterio que useDocenteProximasEvaluaciones) — si falla, simplemente
// se muestra el estado vacío en vez de interrumpir con un toast.
export function useDocenteAlertasRiesgo() {
  const [alertasRiesgo, setAlertasRiesgo] = useState([]);
  const [loading, setLoading] = useState(true);

  const abortRef = useRef(null);
  useEffect(() => () => abortRef.current?.abort(), []);

  const fetchAlertasRiesgo = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    try {
      const res = await getAlertasRiesgo(controller.signal);
      if (controller.signal.aborted) return;
      setAlertasRiesgo(res.data || []);
    } catch (err) {
      if (err.code === 'ERR_CANCELED' || controller.signal.aborted) return;
      setAlertasRiesgo([]);
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAlertasRiesgo(); }, [fetchAlertasRiesgo]);

  return { alertasRiesgo, loading };
}
