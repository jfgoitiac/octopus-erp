import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { format } from 'date-fns';
import { toast } from 'react-toastify';
import { getAsistencia, saveAsistencia } from '../api/academico.service';
import { ESTADO, BACKEND_A_ESTADO } from '../constants/asistencia';
import { aPayloadAsistencia, aplicarConflictos, aplicarVersiones, esConflictoAsistencia } from '../utils/asistenciaVersiones';

function normalizeRegistro(r) {
  // El backend ya manda `estado` (P/A/J/R) para registros creados con la UI
  // nueva. Si viene null (registro legado o sin marcar), se deriva de los
  // booleanos como antes — así no se pierden datos existentes.
  if (r.estado && BACKEND_A_ESTADO[r.estado]) {
    return { ...r, estado: BACKEND_A_ESTADO[r.estado] };
  }
  return {
    ...r,
    estado: r.presente === true && !r.justificada ? ESTADO.PRESENTE
          : r.justificada                          ? ESTADO.JUSTIFICADO
          : r.presente === false                   ? ESTADO.AUSENTE
          : ESTADO.SIN_MARCAR,
  };
}

export function useAsistencia() {
  const [fecha, setFecha]       = useState(new Date());
  const [grado, setGrado]       = useState('');
  const [registros, setRegistros] = useState([]);
  const [loading, setLoading]   = useState(false);
  const [saving, setSaving]     = useState(false);
  const [dirty, setDirty]       = useState(false);

  const abortRef = useRef(null);

  // Cancelar cualquier petición en vuelo al desmontar
  useEffect(() => () => { abortRef.current?.abort(); }, []);

  const fetchAsistencia = useCallback(async () => {
    if (!grado || !fecha) { setRegistros([]); return; }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setDirty(false);
    try {
      const fechaStr = format(fecha, 'yyyy-MM-dd');
      const res = await getAsistencia(grado, fechaStr, controller.signal);
      if (controller.signal.aborted) return;
      setRegistros((res.data || []).map(normalizeRegistro));
    } catch (err) {
      if (err.code === 'ERR_CANCELED' || controller.signal.aborted) return;
      toast.error('No se pudo cargar la asistencia.');
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [grado, fecha]);

  useEffect(() => { fetchAsistencia(); }, [fetchAsistencia]);

  const marcar = useCallback((alumnoId, estado) => {
    setDirty(true);
    setRegistros(prev => prev.map(r => {
      if (r.alumno_id !== alumnoId) return r;
      return {
        ...r,
        estado,
        presente:    estado === ESTADO.PRESENTE || estado === ESTADO.RETARDADO,
        justificada: estado === ESTADO.JUSTIFICADO,
        // Limpiar observación al marcar presente
        observacion: estado === ESTADO.PRESENTE ? '' : r.observacion,
      };
    }));
  }, []);

  const marcarTodosPresentes = useCallback(() => {
    setDirty(true);
    setRegistros(prev => prev.map(r => ({
      ...r,
      estado:      ESTADO.PRESENTE,
      presente:    true,
      justificada: false,
      observacion: '',
    })));
  }, []);

  const actualizarObservacion = useCallback((alumnoId, valor) => {
    setDirty(true);
    setRegistros(prev =>
      prev.map(r => r.alumno_id !== alumnoId ? r : { ...r, observacion: valor })
    );
  }, []);

  // Deshacer del pase por tarjetas: devuelve un registro a su copia previa.
  const restaurarRegistro = useCallback((registroPrevio) => {
    setDirty(true);
    setRegistros(prev => prev.map(r => (r.alumno_id !== registroPrevio.alumno_id ? r : registroPrevio)));
  }, []);

  const sinMarcar = useMemo(() => registros.reduce((n, r) => n + (r.estado ? 0 : 1), 0), [registros]);

  // Devuelve true si se guardó. Misma regla que el portal docente: no se
  // guarda con alumnos sin marcar (antes viajaban como 'A' sin aviso).
  const guardar = useCallback(async () => {
    if (!grado || !fecha) { toast.warning('Selecciona grado y fecha.'); return false; }
    if (sinMarcar > 0) {
      toast.warning(`Falta${sinMarcar === 1 ? '' : 'n'} ${sinMarcar} alumno${sinMarcar === 1 ? '' : 's'} por marcar.`);
      return false;
    }
    setSaving(true);
    try {
      const fechaStr = format(fecha, 'yyyy-MM-dd');
      const res = await saveAsistencia(grado, fechaStr, aPayloadAsistencia(registros));
      setRegistros(prev => aplicarVersiones(prev, res.data?.guardadas));
      toast.success('Asistencia guardada correctamente.');
      setDirty(false);
      return true;
    } catch (err) {
      // Alguien la modificó desde el portal docente mientras estaba abierta:
      // se muestra su versión en esas filas y queda pendiente volver a guardar.
      if (esConflictoAsistencia(err)) {
        setRegistros(prev => aplicarConflictos(prev, err.response.data?.conflictos, normalizeRegistro));
        toast.warning(err.response.data?.error);
        return false;
      }
      const msg = err.response?.data?.error || err.response?.data?.detail || 'Error al guardar asistencia.';
      toast.error(msg);
      return false;
    } finally {
      setSaving(false);
    }
  }, [grado, fecha, registros, sinMarcar]);

  const conteos = useMemo(
    () => registros.reduce(
      (acc, r) => {
        if      (r.estado === ESTADO.PRESENTE)    acc.presentes++;
        else if (r.estado === ESTADO.AUSENTE)     acc.ausentes++;
        else if (r.estado === ESTADO.JUSTIFICADO) acc.justificados++;
        else if (r.estado === ESTADO.RETARDADO)   acc.retardados++;
        else                                      acc.sinMarcar++;
        return acc;
      },
      { presentes: 0, ausentes: 0, justificados: 0, retardados: 0, sinMarcar: 0 }
    ),
    [registros]
  );

  return {
    fecha, setFecha,
    grado, setGrado,
    registros,
    loading,
    saving,
    dirty,
    conteos,
    marcar,
    marcarTodosPresentes,
    actualizarObservacion,
    restaurarRegistro,
    guardar,
    sinMarcar,
  };
}
