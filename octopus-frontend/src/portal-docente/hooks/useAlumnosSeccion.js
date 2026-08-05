import { useState, useEffect, useCallback, useRef } from 'react';
import { format } from 'date-fns';
import { toast } from 'react-toastify';
import { getRosterSeccion } from '../api/academico.service';

/**
 * Lista de alumnos (id, nombre) de una sección — reutiliza el roster que
 * retorna AsistenciaView del día de hoy (siempre incluye a todos los alumnos
 * del grado, tengan o no asistencia marcada) ya que no existe un endpoint
 * dedicado "alumnos de mi sección" para el portal docente.
 */
export function useAlumnosSeccion(gradoSeccion) {
  const [alumnos, setAlumnos] = useState([]);
  const [loading, setLoading] = useState(false);

  const abortRef = useRef(null);
  useEffect(() => () => abortRef.current?.abort(), []);

  const fetchAlumnos = useCallback(async () => {
    if (!gradoSeccion) { setAlumnos([]); return; }
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    try {
      const hoy = format(new Date(), 'yyyy-MM-dd');
      const res = await getRosterSeccion(gradoSeccion, hoy, controller.signal);
      if (controller.signal.aborted) return;
      const lista = (res.data || []).map(r => ({ id: r.alumno_id, nombre: r.alumno_nombre }));
      setAlumnos(lista);
    } catch (err) {
      if (err.code === 'ERR_CANCELED' || controller.signal.aborted) return;
      toast.error('No se pudo cargar la lista de alumnos.');
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [gradoSeccion]);

  useEffect(() => { fetchAlumnos(); }, [fetchAlumnos]);

  return { alumnos, loading };
}
