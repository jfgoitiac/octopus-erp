import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { toast } from 'react-toastify';
import { getLapsos, getBoletin } from '../api/academico.service';
import { buscarAlumnos } from '../api/secretaria.service';

export function useBoletin() {
  const [busqueda, setBusqueda] = useState('');
  const [alumnos, setAlumnos] = useState([]);
  const [busquedaLoading, setBusquedaLoading] = useState(false);
  const [alumnoSeleccionado, setAlumnoSeleccionado] = useState(null);
  const [lapsos, setLapsos] = useState([]);
  const [lapsoId, setLapsoId] = useState('');
  const [boletin, setBoletin] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);

  // Un único ref cancela tanto búsquedas como cargas de boletín en vuelo
  const abortRef = useRef(null);
  useEffect(() => () => abortRef.current?.abort(), []);

  useEffect(() => {
    getLapsos()
      .then(res => setLapsos(res.data || []))
      .catch(() => toast.error('No se pudieron cargar los lapsos.'));
  }, []);

  // Búsqueda de alumnos con debounce y cancelación
  useEffect(() => {
    if (busqueda.length < 2) {
      setAlumnos([]);
      setShowDropdown(false);
      return;
    }

    const timer = setTimeout(async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setBusquedaLoading(true);
      try {
        const res = await buscarAlumnos(busqueda, controller.signal);
        setAlumnos(res.data || []);
        setShowDropdown(true);
      } catch (err) {
        if (err.name === 'CanceledError' || err.code === 'ERR_CANCELED') return;
        toast.error('Error al buscar alumnos.');
      } finally {
        setBusquedaLoading(false);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [busqueda]);

  const handleChangeBusqueda = useCallback((valor) => {
    setBusqueda(valor);
    setAlumnoSeleccionado(null);
    setBoletin(null);
  }, []);

  const handleChangeLapso = useCallback((valor) => {
    setLapsoId(valor);
    setBoletin(null);
  }, []);

  const handleSelectAlumno = useCallback((alumno) => {
    setAlumnoSeleccionado(alumno);
    setBusqueda(`${alumno.nombre} ${alumno.apellido}`);
    setShowDropdown(false);
    setBoletin(null);
  }, []);

  const handleVistaPrev = useCallback(async () => {
    if (!alumnoSeleccionado) { toast.warning('Selecciona un alumno.'); return; }
    if (!lapsoId) { toast.warning('Selecciona un lapso.'); return; }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    try {
      const res = await getBoletin(alumnoSeleccionado.id, lapsoId, controller.signal);
      setBoletin(res.data);
    } catch (err) {
      if (err.name === 'CanceledError' || err.code === 'ERR_CANCELED') return;
      toast.error(err.response?.data?.error || err.response?.data?.detail || 'No se pudo cargar el boletín.');
    } finally {
      setLoading(false);
    }
  }, [alumnoSeleccionado, lapsoId]);

  // Calculado una sola vez; usado tanto en la UI como pasado a generarBoletinPDF
  const promedioGeneral = useMemo(() => {
    if (!boletin?.materias?.length) return null;
    const vals = boletin.materias.map(m => parseFloat(m.definitiva)).filter(v => !isNaN(v));
    return vals.length ? (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2) : null;
  }, [boletin]);

  return {
    busqueda,
    alumnos,
    busquedaLoading,
    alumnoSeleccionado,
    lapsos,
    lapsoId,
    boletin,
    loading,
    showDropdown,
    promedioGeneral,
    setShowDropdown,
    handleChangeBusqueda,
    handleChangeLapso,
    handleSelectAlumno,
    handleVistaPrev,
  };
}
