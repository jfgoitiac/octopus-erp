import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'react-toastify';
import {
  getPlanEvaluacion,
  guardarPlanEvaluacion,
  getNotasPlan,
  guardarNotasPlan,
} from '../api/planEvaluacion.service';

/**
 * Plan de Evaluación (bloques/ítems) + notas cargadas sobre ese plan, para
 * una materia + lapso puntual. Mismo patrón AbortController+loading+toast
 * que los demás hooks del portal docente (ver useDocenteMateriales.js).
 */
export function useDocentePlanEvaluacion(materiaId, lapsoId) {
  const [plan, setPlan] = useState(null);
  const [loadingPlan, setLoadingPlan] = useState(false);
  const [savingPlan, setSavingPlan] = useState(false);

  const [alumnos, setAlumnos] = useState([]);
  const [loadingNotas, setLoadingNotas] = useState(false);
  const [savingNotas, setSavingNotas] = useState(false);

  const abortPlanRef = useRef(null);
  const abortNotasRef = useRef(null);
  useEffect(() => () => {
    abortPlanRef.current?.abort();
    abortNotasRef.current?.abort();
  }, []);

  const fetchPlan = useCallback(async () => {
    if (!materiaId || !lapsoId) { setPlan(null); return; }
    abortPlanRef.current?.abort();
    const controller = new AbortController();
    abortPlanRef.current = controller;

    setLoadingPlan(true);
    try {
      const res = await getPlanEvaluacion(materiaId, lapsoId, controller.signal);
      if (controller.signal.aborted) return;
      setPlan(res.data || null);
    } catch (err) {
      if (err.code === 'ERR_CANCELED' || controller.signal.aborted) return;
      if (err.response?.status === 404) {
        setPlan(null);
      } else {
        toast.error('No se pudo cargar el plan de evaluación.');
      }
    } finally {
      if (!controller.signal.aborted) setLoadingPlan(false);
    }
  }, [materiaId, lapsoId]);

  useEffect(() => { fetchPlan(); }, [fetchPlan]);

  const fetchNotas = useCallback(async () => {
    if (!materiaId || !lapsoId || !plan) { setAlumnos([]); return; }
    abortNotasRef.current?.abort();
    const controller = new AbortController();
    abortNotasRef.current = controller;

    setLoadingNotas(true);
    try {
      const res = await getNotasPlan(materiaId, lapsoId, controller.signal);
      if (controller.signal.aborted) return;
      setAlumnos(res.data?.alumnos || []);
    } catch (err) {
      if (err.code === 'ERR_CANCELED' || controller.signal.aborted) return;
      toast.error('No se pudieron cargar las notas del plan.');
    } finally {
      if (!controller.signal.aborted) setLoadingNotas(false);
    }
  }, [materiaId, lapsoId, plan]);

  useEffect(() => { fetchNotas(); }, [fetchNotas]);

  const guardarPlan = useCallback(async (bloques) => {
    setSavingPlan(true);
    try {
      const res = await guardarPlanEvaluacion({
        id: plan?.id ?? null,
        materia_id: materiaId,
        lapso_id: lapsoId,
        bloques,
      });
      setPlan(res.data);
      toast.success('Plan de evaluación guardado correctamente.');
      return true;
    } catch (err) {
      const msg = err.response?.data?.error || err.response?.data?.detail || 'No se pudo guardar el plan de evaluación.';
      toast.error(msg);
      return false;
    } finally {
      setSavingPlan(false);
    }
  }, [plan, materiaId, lapsoId]);

  // El backend siempre responde 200 con {guardadas, errores} — un fallo
  // parcial (ej. una celda con item_id inválido) NO llega como excepción acá,
  // así que hay que inspeccionar el body para dar feedback granular en vez
  // de un solo toast genérico de éxito/error para toda la grilla.
  const guardarNotas = useCallback(async (notas) => {
    setSavingNotas(true);
    try {
      const res = await guardarNotasPlan(materiaId, lapsoId, notas);
      const { guardadas = [], errores = [] } = res.data || {};

      if (errores.length === 0) {
        toast.success('Notas guardadas correctamente.');
      } else if (guardadas.length === 0) {
        toast.error(`No se pudo guardar ninguna nota (${errores.length} error${errores.length === 1 ? '' : 'es'}).`);
      } else {
        toast.warning(`${guardadas.length} nota${guardadas.length === 1 ? '' : 's'} guardada${guardadas.length === 1 ? '' : 's'}, ${errores.length} con error.`);
      }

      await fetchNotas();
      return { ok: errores.length === 0, guardadas, errores };
    } catch (err) {
      const msg = err.response?.data?.error || err.response?.data?.detail || 'No se pudieron guardar las notas.';
      toast.error(msg);
      return { ok: false, guardadas: [], errores: [] };
    } finally {
      setSavingNotas(false);
    }
  }, [materiaId, lapsoId, fetchNotas]);

  return {
    plan, loadingPlan, savingPlan, guardarPlan, refetchPlan: fetchPlan,
    alumnos, loadingNotas, savingNotas, guardarNotas, refetchNotas: fetchNotas,
  };
}
