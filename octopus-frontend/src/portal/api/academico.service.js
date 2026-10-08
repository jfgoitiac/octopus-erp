import portalClient from './portalClient';

/**
 * Rendimiento académico (promedios por lapso/materia + asistencia) de un
 * hijo del representante autenticado. El backend valida que el alumno
 * pertenezca a ese representante (404 si no).
 */
export const getRendimientoAlumnoPortal = (alumnoId, signal) =>
  portalClient.get(`academico/rendimiento/alumno/${alumnoId}/`, signal ? { signal } : undefined);

// Planes publicados por los docentes para un hijo del representante. El
// backend valida siempre la relación representante–alumno.
export const getPlanesEvaluacionAlumnoPortal = (alumnoId, signal) =>
  portalClient.get(`academico/planes-evaluacion/alumno/${alumnoId}/`, signal ? { signal } : undefined);
