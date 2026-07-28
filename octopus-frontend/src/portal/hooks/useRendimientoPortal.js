import { useState, useEffect, useRef } from 'react';
import { toast } from 'react-toastify';
import { getDashboard } from '../api/portal.service';
import { getRendimientoAlumnoPortal } from '../api/academico.service';

export function useRendimientoPortal() {
  const [alumnos, setAlumnos] = useState([]);
  const [alumnoActivo, setAlumnoActivo] = useState(null);
  const [loadingAlumnos, setLoadingAlumnos] = useState(true);

  const [rendimiento, setRendimiento] = useState(null);
  const [loadingRendimiento, setLoadingRendimiento] = useState(false);

  const abortRef = useRef(null);
  useEffect(() => () => { abortRef.current?.abort(); }, []);

  useEffect(() => {
    const controller = new AbortController();
    setLoadingAlumnos(true);
    getDashboard(controller.signal)
      .then(res => {
        const lista = res.data?.alumnos || [];
        setAlumnos(lista);
        if (lista.length > 0) setAlumnoActivo(lista[0]);
      })
      .catch(err => {
        if (err.code === 'ERR_CANCELED' || err.name === 'CanceledError') return;
        toast.error('No se pudo cargar la lista de estudiantes.');
      })
      .finally(() => setLoadingAlumnos(false));
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!alumnoActivo) { setRendimiento(null); return; }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoadingRendimiento(true);
    getRendimientoAlumnoPortal(alumnoActivo.id, controller.signal)
      .then(res => { if (!controller.signal.aborted) setRendimiento(res.data); })
      .catch(err => {
        if (err.code === 'ERR_CANCELED' || controller.signal.aborted) return;
        toast.error('No se pudo cargar el rendimiento académico.');
      })
      .finally(() => { if (!controller.signal.aborted) setLoadingRendimiento(false); });
  }, [alumnoActivo]);

  return {
    alumnos, alumnoActivo, setAlumnoActivo, loadingAlumnos,
    rendimiento, loadingRendimiento,
  };
}
