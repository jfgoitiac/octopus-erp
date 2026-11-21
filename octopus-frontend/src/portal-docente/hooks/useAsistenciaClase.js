import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { format } from 'date-fns';
import { toast } from 'react-toastify';
import { getAsistencia, saveAsistencia } from '../api/academico.service';
import { ESTADO, BACKEND_A_ESTADO } from '../../constants/asistencia';
import { aPayloadAsistencia, aplicarConflictos, aplicarVersiones, esConflictoAsistencia } from '../../utils/asistenciaVersiones';
import { encolarEnvio } from '../utils/asistenciaLocal';
import { esErrorDeRed } from '../utils/colaAsistencia';

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
export function useAsistenciaClase(gradoOContexto, fecha, activo) {
  const gradoSeccion = typeof gradoOContexto === 'object' ? gradoOContexto?.grado_seccion : gradoOContexto;
  const seccionId = typeof gradoOContexto === 'object' ? gradoOContexto?.seccion_id : undefined;
  const periodoId = typeof gradoOContexto === 'object' ? gradoOContexto?.periodo_id : undefined;
  const sedeId = typeof gradoOContexto === 'object' ? gradoOContexto?.sede : undefined;
  const contextoBase = useMemo(() => ({
    grado_seccion: gradoSeccion,
    ...(seccionId ? { seccion_id: seccionId } : {}),
    ...(periodoId ? { periodo_id: periodoId } : {}),
    ...(sedeId ? { sede: sedeId } : {}),
  }), [gradoSeccion, seccionId, periodoId, sedeId]);
  const claveScope = [sedeId, periodoId, seccionId]
    .filter(valor => valor !== undefined && valor !== null && valor !== '')
    .join(':') || gradoSeccion;
  const [registros, setRegistros] = useState([]);
  const [loadingAsistencia, setLoadingAsistencia] = useState(false);
  const [savingAsistencia, setSavingAsistencia] = useState(false);
  const [dirtyAsistencia, setDirtyAsistencia] = useState(false);
  const [jornada, setJornada] = useState({ id: null, version: 0, esLectiva: true });
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
      const res = await getAsistencia(contextoBase, fechaStr, controller.signal);
      if (controller.signal.aborted) return;
      setRegistros((res.data || []).map(normalizeRegistro));
      setJornada({
        id: res.headers?.['x-asistencia-jornada-id'] || res.data?.[0]?.jornada_id || null,
        version: Number(res.headers?.['x-asistencia-version'] ?? res.data?.[0]?.jornada_version ?? 0),
        esLectiva: res.headers?.['x-asistencia-fecha-lectiva'] !== 'false',
      });
    } catch (err) {
      if (err.code === 'ERR_CANCELED' || controller.signal.aborted) return;
      toast.error('No se pudo cargar la asistencia.');
    } finally {
      if (!controller.signal.aborted) setLoadingAsistencia(false);
    }
  }, [gradoSeccion, fecha, contextoBase]);

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

  // Recuperar un borrador local: aplica estado + observación por alumno.
  const aplicarCambios = useCallback((cambios) => {
    const porAlumno = new Map(cambios.map(c => [c.alumno_id, c]));
    setDirtyAsistencia(true);
    setRegistros(prev => prev.map(r => {
      const c = porAlumno.get(r.alumno_id);
      if (!c) return r;
      return {
        ...r,
        estado: c.estado,
        presente: c.estado === ESTADO.PRESENTE || c.estado === ESTADO.RETARDADO,
        justificada: c.estado === ESTADO.JUSTIFICADO,
        observacion: c.observacion || '',
      };
    }));
  }, []);

  const sinMarcar = useMemo(() => registros.reduce((n, r) => n + (r.estado ? 0 : 1), 0), [registros]);

  // Devuelve true si se guardó, 'encolado' si no había conexión (queda en este
  // dispositivo y se reenvía solo, ver colaAsistencia.js) o false si falló.
  // No se guarda con alumnos sin marcar: antes viajaban como 'A' sin aviso.
  const guardarAsistencia = async () => {
    if (sinMarcar > 0) {
      toast.warning(`Falta${sinMarcar === 1 ? '' : 'n'} ${sinMarcar} alumno${sinMarcar === 1 ? '' : 's'} por marcar.`);
      return false;
    }
    setSavingAsistencia(true);
    try {
      const fechaStr = format(fecha, 'yyyy-MM-dd');
      const res = await saveAsistencia(
        { ...contextoBase, jornada_id: jornada.id ? Number(jornada.id) : null, version: jornada.version },
        fechaStr,
        aPayloadAsistencia(registros),
      );
      setRegistros(prev => aplicarVersiones(prev, res.data?.guardadas));
      setJornada(prev => ({
        ...prev,
        id: res.data?.jornada?.id ?? prev.id,
        version: Number(res.data?.jornada?.version ?? prev.version + 1),
      }));
      toast.success('Asistencia guardada correctamente.');
      setDirtyAsistencia(false);
      return true;
    } catch (err) {
      // Alguien la modificó desde el panel mientras estaba abierta: se muestra
      // su versión en esas filas y queda pendiente volver a guardar.
      if (esConflictoAsistencia(err)) {
        setRegistros(prev => aplicarConflictos(prev, err.response.data?.conflictos, normalizeRegistro));
        if (err.response.data?.jornada) setJornada(prev => ({ ...prev, ...err.response.data.jornada }));
        toast.warning(err.response.data?.error);
        return false;
      }
      if (esErrorDeRed(err)) {
        // La versión viaja en la cola: si al reconectar alguien ya la cambió,
        // el servidor la rechaza en vez de pisar ese cambio (ver colaAsistencia).
        encolarEnvio({
          gradoSeccion,
          claveScope,
          fecha: format(fecha, 'yyyy-MM-dd'),
          registros: aPayloadAsistencia(registros),
          jornada_id: jornada.id ? Number(jornada.id) : null,
          version: jornada.version,
        });
        toast.warning('Sin conexión: la asistencia quedó guardada en este dispositivo y se enviará sola al volver la señal.');
        setDirtyAsistencia(false);
        return 'encolado';
      }
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
    aplicarCambios,
    guardarAsistencia,
    conteos,
    sinMarcar,
    jornada,
  };
}
