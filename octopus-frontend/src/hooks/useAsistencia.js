import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { format } from 'date-fns';
import { toast } from 'react-toastify';
import { getAsistencia, saveAsistencia } from '../api/academico.service';
import { ESTADO } from '../constants/asistencia';

function normalizeRegistro(r) {
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
        presente:    estado === ESTADO.PRESENTE,
        justificada: estado === ESTADO.JUSTIFICADO,
        // Limpiar observación al marcar presente
        observacion: estado === ESTADO.PRESENTE ? '' : r.observacion,
      };
    }));
  }, []);

  const actualizarObservacion = useCallback((alumnoId, valor) => {
    setDirty(true);
    setRegistros(prev =>
      prev.map(r => r.alumno_id !== alumnoId ? r : { ...r, observacion: valor })
    );
  }, []);

  const guardar = useCallback(async () => {
    if (!grado || !fecha) { toast.warning('Selecciona grado y fecha.'); return; }
    setSaving(true);
    try {
      const fechaStr = format(fecha, 'yyyy-MM-dd');
      const payload = registros.map(r => ({
        alumno_id:   r.alumno_id,
        presente:    r.estado === ESTADO.PRESENTE,
        justificada: r.estado === ESTADO.JUSTIFICADO,
        observacion: r.observacion || '',
      }));
      await saveAsistencia(grado, fechaStr, payload);
      toast.success('Asistencia guardada correctamente.');
      setDirty(false);
    } catch (err) {
      const msg = err.response?.data?.error || err.response?.data?.detail || 'Error al guardar asistencia.';
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }, [grado, fecha, registros]);

  const conteos = useMemo(
    () => registros.reduce(
      (acc, r) => {
        if      (r.estado === ESTADO.PRESENTE)    acc.presentes++;
        else if (r.estado === ESTADO.AUSENTE)     acc.ausentes++;
        else if (r.estado === ESTADO.JUSTIFICADO) acc.justificados++;
        else                                      acc.sinMarcar++;
        return acc;
      },
      { presentes: 0, ausentes: 0, justificados: 0, sinMarcar: 0 }
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
    actualizarObservacion,
    guardar,
  };
}
