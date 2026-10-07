import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { format } from 'date-fns';
import { toast } from 'react-toastify';
import { getAsistencia, saveAsistencia } from '../api/academico.service';
import { ESTADO, ESTADO_A_BACKEND, BACKEND_A_ESTADO } from '../../constants/asistencia';

export function normalizeRegistro(r) {
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

/**
 * Asistencia diaria de una sección (portal docente). Extraída tal cual de
 * DocenteMateriaDetalle para compartirla entre la vista Lista (FilaAlumno) y
 * el pase de lista por tarjetas.
 *
 * `activo` replica la condición original `tab === 'asistencia'`: solo se
 * consulta la API cuando la pestaña está visible.
 */
export function useAsistenciaClase(gradoSeccion, fecha, activo) {
  const [registros, setRegistros] = useState([]);
  const [loadingAsistencia, setLoadingAsistencia] = useState(false);
  const [savingAsistencia, setSavingAsistencia] = useState(false);
  const [dirtyAsistencia, setDirtyAsistencia] = useState(false);
  const abortAsistenciaRef = useRef(null);

  const fetchAsistencia = useCallback(async () => {
    if (!gradoSeccion || !fecha) return;
    abortAsistenciaRef.current?.abort();
    const controller = new AbortController();
    abortAsistenciaRef.current = controller;

    setLoadingAsistencia(true);
    setDirtyAsistencia(false);
    try {
      const fechaStr = format(fecha, 'yyyy-MM-dd');
      const res = await getAsistencia(gradoSeccion, fechaStr, controller.signal);
      if (controller.signal.aborted) return;
      setRegistros((res.data || []).map(normalizeRegistro));
    } catch (err) {
      if (err.code === 'ERR_CANCELED' || controller.signal.aborted) return;
      toast.error('No se pudo cargar la asistencia.');
    } finally {
      if (!controller.signal.aborted) setLoadingAsistencia(false);
    }
  }, [gradoSeccion, fecha]);

  useEffect(() => { if (activo) fetchAsistencia(); }, [activo, fetchAsistencia]);

  const marcar = useCallback((alumnoId, estado) => {
    setDirtyAsistencia(true);
    setRegistros(prev => prev.map(r => {
      if (r.alumno_id !== alumnoId) return r;
      return {
        ...r,
        estado,
        presente: estado === ESTADO.PRESENTE || estado === ESTADO.RETARDADO,
        justificada: estado === ESTADO.JUSTIFICADO,
        observacion: estado === ESTADO.PRESENTE ? '' : r.observacion,
      };
    }));
  }, []);

  const actualizarObservacion = useCallback((alumnoId, valor) => {
    setDirtyAsistencia(true);
    setRegistros(prev => prev.map(r => (r.alumno_id !== alumnoId ? r : { ...r, observacion: valor })));
  }, []);

  // Deshacer del pase por tarjetas: devuelve un registro exactamente a una
  // copia previa (estado + observación), en lugar de re-marcarlo.
  const restaurarRegistro = useCallback((registroPrevio) => {
    setDirtyAsistencia(true);
    setRegistros(prev => prev.map(r => (r.alumno_id !== registroPrevio.alumno_id ? r : registroPrevio)));
  }, []);

  // Devuelve true si se guardó, para que el resumen pueda confirmar en pantalla.
  const guardarAsistencia = async () => {
    setSavingAsistencia(true);
    try {
      const fechaStr = format(fecha, 'yyyy-MM-dd');
      const payload = registros.map(r => ({
        alumno_id: r.alumno_id,
        estado: ESTADO_A_BACKEND[r.estado] || 'A',
        observacion: r.observacion || '',
      }));
      await saveAsistencia(gradoSeccion, fechaStr, payload);
      toast.success('Asistencia guardada correctamente.');
      setDirtyAsistencia(false);
      return true;
    } catch (err) {
      const msg = err.response?.data?.error || err.response?.data?.detail || 'Error al guardar asistencia.';
      toast.error(msg);
      return false;
    } finally {
      setSavingAsistencia(false);
    }
  };

  const conteos = useMemo(
    () => registros.reduce((acc, r) => {
      if (r.estado === ESTADO.PRESENTE) acc.presentes++;
      else if (r.estado === ESTADO.AUSENTE) acc.ausentes++;
      else if (r.estado === ESTADO.JUSTIFICADO) acc.justificados++;
      else if (r.estado === ESTADO.RETARDADO) acc.retardados++;
      return acc;
    }, { presentes: 0, ausentes: 0, justificados: 0, retardados: 0 }),
    [registros]
  );

  return {
    registros,
    loadingAsistencia,
    savingAsistencia,
    dirtyAsistencia,
    fetchAsistencia,
    marcar,
    actualizarObservacion,
    restaurarRegistro,
    guardarAsistencia,
    conteos,
  };
}
