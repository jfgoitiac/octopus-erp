import apiClient from './apiClient';

// Materias
export const getMaterias = (gradoSeccion, signal) =>
  apiClient.get(`academico/materias/?grado_seccion=${encodeURIComponent(gradoSeccion)}`, signal ? { signal } : undefined);

export const getMateria = (id, signal) =>
  apiClient.get(`academico/materias/${id}/`, signal ? { signal } : undefined);

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

// Incidentes disciplinarios
export const getIncidentes = (filtros, signal) => {
  const params = new URLSearchParams(filtros || {});
  const qs = params.toString();
  return apiClient.get(`academico/incidentes/${qs ? `?${qs}` : ''}`, signal ? { signal } : undefined);
};

export const getIncidente = (id) =>
  apiClient.get(`academico/incidentes/${id}/`);

export const createIncidente = (data) => {
  const formData = new FormData();
  formData.append('alumno_id', data.alumno_id);
  formData.append('descripcion', data.descripcion);
  formData.append('severidad', data.severidad);
  if (data.adjunto) formData.append('adjunto', data.adjunto);
  return apiClient.post('academico/incidentes/', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
};

// Portal Docente — Mis Materias
export const getMisMaterias = (signal) =>
  apiClient.get('academico/docente/mis-materias/', signal ? { signal } : undefined);

// Material de Estudio
export const getMateriales = (materiaId, signal) =>
  apiClient.get(`academico/materiales/?materia_id=${materiaId}`, signal ? { signal } : undefined);

export const createMaterial = (data) => {
  const formData = new FormData();
  formData.append('materia_id', data.materia_id);
  formData.append('titulo', data.titulo);
  if (data.descripcion) formData.append('descripcion', data.descripcion);
  if (data.enlace) formData.append('enlace', data.enlace);
  if (data.archivo) formData.append('archivo', data.archivo);
  return apiClient.post('academico/materiales/', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
};

export const deleteMaterial = (id) =>
  apiClient.delete(`academico/materiales/${id}/`);

// Rendimiento (Fase 4 — Seguimiento Gráfico)
export const getRendimientoSeccion = (gradoSeccion, lapsoId, signal) => {
  const qs = lapsoId ? `?lapso_id=${lapsoId}` : '';
  return apiClient.get(`academico/rendimiento/seccion/${encodeURIComponent(gradoSeccion)}/${qs}`, signal ? { signal } : undefined);
};

export const getAlertasRendimiento = (signal) =>
  apiClient.get('academico/rendimiento/alertas/', signal ? { signal } : undefined);
