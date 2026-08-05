import { useState, useEffect, useCallback, useRef } from 'react';
import { getRadarCierreLapso } from '../api/academico.service';

// Sin toast de error a propósito: alimenta un slide secundario del hero
// (mismo criterio que useDocenteProximasEvaluaciones) — si falla, simplemente
// se muestra el estado vacío en vez de interrumpir con un toast.
export function useDocenteRadarCierreLapso(diasAnticipacion = 5) {
  const [radar, setRadar] = useState(null);
  const [loading, setLoading] = useState(true);

  const abortRef = useRef(null);
  useEffect(() => () => abortRef.current?.abort(), []);

  const fetchRadar = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    try {
      const res = await getRadarCierreLapso(diasAnticipacion, controller.signal);
      if (controller.signal.aborted) return;
      setRadar(res.data || null);
    } catch (err) {
      if (err.code === 'ERR_CANCELED' || controller.signal.aborted) return;
      setRadar(null);
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [diasAnticipacion]);

  useEffect(() => { fetchRadar(); }, [fetchRadar]);

  return { radar, loading };
}
