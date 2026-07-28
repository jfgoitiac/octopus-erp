import portalClient from './portalClient';

/**
 * Rendimiento académico (promedios por lapso/materia + asistencia) de un
 * hijo del representante autenticado. El backend valida que el alumno
 * pertenezca a ese representante (404 si no).
 */
export const getRendimientoAlumnoPortal = (alumnoId, signal) =>
  portalClient.get(`academico/rendimiento/alumno/${alumnoId}/`, signal ? { signal } : undefined);
