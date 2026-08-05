import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'react-toastify';
import { getLapsos, getNotasGrado } from '../api/academico.service';

/**
 * Progreso de carga de notas por materia para el lapso activo.
 * No existe un endpoint de resumen: se arma consultando notas por materia
 * (una request por materia del docente, típicamente pocas) contra el lapso
 * marcado como activo (Lapso.activo en el backend).
 */
export function useDocenteProgresoNotas(materias) {
  const [progreso, setProgreso] = useState([]);
  const [lapsoActivo, setLapsoActivo] = useState(null);
  const [loading, setLoading] = useState(true);

  const abortRef = useRef(null);
  useEffect(() => () => abortRef.current?.abort(), []);

  const fetchProgreso = useCallback(async () => {
    if (materias.length === 0) {
      setProgreso([]);
      setLoading(false);
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    try {
      const resLapsos = await getLapsos(null, controller.signal);
      if (controller.signal.aborted) return;
      const activo = (resLapsos.data || []).find(l => l.activo) || null;
      setLapsoActivo(activo);

      if (!activo) {
        setProgreso([]);
        return;
      }

      const resultados = await Promise.all(
        materias.map(async (m) => {
          const res = await getNotasGrado(m.id, activo.id, controller.signal);
          const notas = res.data || [];
          const cargadas = notas.filter(n => n.definitiva !== null).length;
          return { materiaId: m.id, nombre: m.nombre, cargadas, total: notas.length };
        })
      );
      if (controller.signal.aborted) return;
      setProgreso(resultados);
    } catch (err) {
      if (err.code === 'ERR_CANCELED' || controller.signal.aborted) return;
      toast.error('No se pudo cargar el progreso de notas.');
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [materias]);

  useEffect(() => { fetchProgreso(); }, [fetchProgreso]);

  return { progreso, lapsoActivo, loading };
}
