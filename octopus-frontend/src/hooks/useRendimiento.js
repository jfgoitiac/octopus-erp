import { useState, useCallback, useEffect, useRef } from 'react';
import { toast } from 'react-toastify';
import { getLapsos, getRendimientoSeccion, getAlertasRendimiento } from '../api/academico.service';

export function useRendimiento() {
  const [grado, setGrado] = useState('');
  const [lapsos, setLapsos] = useState([]);
  const [lapsoId, setLapsoId] = useState('');
  const [seccion, setSeccion] = useState(null);
  const [loadingSeccion, setLoadingSeccion] = useState(false);

  const [alertas, setAlertas] = useState([]);
  const [loadingAlertas, setLoadingAlertas] = useState(true);

  const abortRef = useRef(null);
  useEffect(() => () => { abortRef.current?.abort(); }, []);

  useEffect(() => {
    getLapsos()
      .then(res => setLapsos(res.data || []))
      .catch(() => toast.error('No se pudieron cargar los lapsos.'));
  }, []);

  useEffect(() => {
    if (!grado) { setSeccion(null); return; }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoadingSeccion(true);
    getRendimientoSeccion(grado, lapsoId || undefined, controller.signal)
      .then(res => { if (!controller.signal.aborted) setSeccion(res.data); })
      .catch(err => {
        if (err.code === 'ERR_CANCELED' || controller.signal.aborted) return;
        toast.error('No se pudo cargar el rendimiento de la sección.');
      })
      .finally(() => { if (!controller.signal.aborted) setLoadingSeccion(false); });
  }, [grado, lapsoId]);

  const cargarAlertas = useCallback((signal) => {
    setLoadingAlertas(true);
    getAlertasRendimiento(signal)
      .then(res => setAlertas(res.data || []))
      .catch(err => {
        if (err.code === 'ERR_CANCELED') return;
        toast.error('No se pudieron cargar las alertas de rendimiento.');
      })
      .finally(() => setLoadingAlertas(false));
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    cargarAlertas(controller.signal);
    return () => controller.abort();
  }, [cargarAlertas]);

  return {
    grado, setGrado,
    lapsos, lapsoId, setLapsoId,
    seccion, loadingSeccion,
    alertas, loadingAlertas,
  };
}
