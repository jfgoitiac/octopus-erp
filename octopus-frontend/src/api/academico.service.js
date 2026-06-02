import apiClient from './apiClient';

// Materias
export const getMaterias = (gradoSeccion, signal) =>
  apiClient.get(`academico/materias/?grado_seccion=${encodeURIComponent(gradoSeccion)}`, signal ? { signal } : undefined);

export const createMateria = (data) =>
  apiClient.post('academico/materias/', data);

export const updateMateria = (id, data) =>
  apiClient.put(`academico/materias/${id}/`, data);

export const deleteMateria = (id) =>
  apiClient.delete(`academico/materias/${id}/`);

// Lapsos
export const getLapsos = (periodoEscolar) => {
  const url = periodoEscolar
    ? `academico/lapsos/?periodo_escolar=${encodeURIComponent(periodoEscolar)}`
    : 'academico/lapsos/';
  return apiClient.get(url);
};

export const createLapso = (data) =>
  apiClient.post('academico/lapsos/', data);

// Notas
export const getNotasGrado = (materiaId, lapsoId, signal) =>
  apiClient.get(`academico/notas/?materia_id=${materiaId}&lapso_id=${lapsoId}`, { signal });

export const saveNotas = (materiaId, lapsoId, notas) =>
  apiClient.post('academico/notas/', { materia_id: materiaId, lapso_id: lapsoId, notas });

// Asistencia
export const getAsistencia = (gradoSeccion, fecha, signal) =>
  apiClient.get(`academico/asistencia/?grado_seccion=${encodeURIComponent(gradoSeccion)}&fecha=${fecha}`, { signal });

export const saveAsistencia = (gradoSeccion, fecha, registros) =>
  apiClient.post('academico/asistencia/', { grado_seccion: gradoSeccion, fecha, registros });

export const getResumenAsistencia = (alumnoId, mes, anio) =>
  apiClient.get(`academico/asistencia/resumen/?alumno_id=${alumnoId}&mes=${mes}&anio=${anio}`);

// Horarios
export const getHorarios = (gradoSeccion, signal) =>
  apiClient.get(`academico/horarios/?grado_seccion=${encodeURIComponent(gradoSeccion)}`, signal ? { signal } : undefined);

export const saveHorario = (data) =>
  apiClient.post('academico/horarios/', data);

export const updateHorario = (id, data) =>
  apiClient.put(`academico/horarios/${id}/`, data);

export const deleteHorario = (id) =>
  apiClient.delete(`academico/horarios/${id}/`);

// Boletín
export const getBoletin = (alumnoId, lapsoId, signal) =>
  apiClient.get(`academico/boletin/?alumno_id=${alumnoId}&lapso_id=${lapsoId}`, { signal });

// Generador automático de horarios
export const generarHorario = (data) =>
  apiClient.post('academico/horarios/generar/', data);

// Lapsos — CRUD completo
export const getLapso = (id) =>
  apiClient.get(`academico/lapsos/${id}/`);

export const updateLapso = (id, data) =>
  apiClient.put(`academico/lapsos/${id}/`, data);

export const deleteLapso = (id) =>
  apiClient.delete(`academico/lapsos/${id}/`);
