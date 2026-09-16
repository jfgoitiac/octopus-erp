import apiClient from './apiClient';

// Materias
export const getMaterias = (gradoSeccion, signal) =>
  apiClient.get(
    gradoSeccion ? `academico/materias/?grado_seccion=${encodeURIComponent(gradoSeccion)}` : 'academico/materias/',
    signal ? { signal } : undefined
  );

export const getMateria = (id, signal) =>
  apiClient.get(`academico/materias/${id}/`, signal ? { signal } : undefined);

export const createMateria = (data) =>
  apiClient.post('academico/materias/', data);

export const updateMateria = (id, data) =>
  apiClient.put(`academico/materias/${id}/`, data);

export const deleteMateria = (id) =>
  apiClient.delete(`academico/materias/${id}/`);

// Docentes
export const listarDocentes = (filtros, signal) => {
  const params = new URLSearchParams(filtros || {});
  const qs = params.toString();
  return apiClient.get(`academico/docentes/${qs ? `?${qs}` : ''}`, signal ? { signal } : undefined);
};

export const crearDocente = (data) =>
  apiClient.post('academico/docentes/', data);

export const actualizarDocente = (id, data) =>
  apiClient.put(`academico/docentes/${id}/`, data);

export const eliminarDocente = (id) =>
  apiClient.delete(`academico/docentes/${id}/`);

export const asignarMateriasDocente = (id, materias) =>
  apiClient.post(`academico/docentes/${id}/asignar-materias/`, { materias });

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

// Horarios — ahora se filtran por paquete + grado_seccion (ver PaquetesHorario)
export const getHorarios = (paqueteId, gradoSeccion, signal) => {
  const params = new URLSearchParams();
  if (paqueteId) params.set('paquete', paqueteId);
  if (gradoSeccion) params.set('grado_seccion', gradoSeccion);
  return apiClient.get(`academico/horarios/?${params.toString()}`, signal ? { signal } : undefined);
};

export const saveHorario = (data) =>
  apiClient.post('academico/horarios/', data);

export const updateHorario = (id, data) =>
  apiClient.put(`academico/horarios/${id}/`, data);

export const deleteHorario = (id) =>
  apiClient.delete(`academico/horarios/${id}/`);

// Paquetes de Horario
export const getPaquetesHorario = (filtros, signal) => {
  const params = new URLSearchParams(filtros || {});
  const qs = params.toString();
  return apiClient.get(`academico/paquetes-horario/${qs ? `?${qs}` : ''}`, signal ? { signal } : undefined);
};

export const getPaqueteHorario = (id, signal) =>
  apiClient.get(`academico/paquetes-horario/${id}/`, signal ? { signal } : undefined);

export const createPaqueteHorario = (data) =>
  apiClient.post('academico/paquetes-horario/', data);

export const updatePaqueteHorario = (id, data) =>
  apiClient.put(`academico/paquetes-horario/${id}/`, data);

export const deletePaqueteHorario = (id) =>
  apiClient.delete(`academico/paquetes-horario/${id}/`);

export const publicarPaqueteHorario = (id) =>
  apiClient.post(`academico/paquetes-horario/${id}/publicar/`);

// Grados dentro de un paquete
export const getGradosPaquete = (paqueteId, signal) =>
  apiClient.get(`academico/paquetes-horario/${paqueteId}/grados/`, signal ? { signal } : undefined);

export const addGradoPaquete = (paqueteId, gradoSeccion) =>
  apiClient.post(`academico/paquetes-horario/${paqueteId}/grados/`, { grado_seccion: gradoSeccion });

export const removeGradoPaquete = (paqueteId, gradoPk) =>
  apiClient.delete(`academico/paquetes-horario/${paqueteId}/grados/${gradoPk}/`);

// Bloques (jornada horaria) dentro de un paquete
export const getBloquesPaquete = (paqueteId, signal) =>
  apiClient.get(`academico/paquetes-horario/${paqueteId}/bloques/`, signal ? { signal } : undefined);

export const addBloquePaquete = (paqueteId, data) =>
  apiClient.post(`academico/paquetes-horario/${paqueteId}/bloques/`, data);

export const updateBloquePaquete = (paqueteId, bloqueId, data) =>
  apiClient.put(`academico/paquetes-horario/${paqueteId}/bloques/${bloqueId}/`, data);

export const deleteBloquePaquete = (paqueteId, bloqueId) =>
  apiClient.delete(`academico/paquetes-horario/${paqueteId}/bloques/${bloqueId}/`);

// Disponibilidad de un docente (usada por el generador y por su ficha)
export const getDisponibilidadDocente = (docenteId, signal) =>
  apiClient.get(`academico/docentes/${docenteId}/disponibilidad/`, signal ? { signal } : undefined);

export const addDisponibilidadDocente = (docenteId, data) =>
  apiClient.post(`academico/docentes/${docenteId}/disponibilidad/`, data);

export const deleteDisponibilidadDocente = (docenteId, dispId) =>
  apiClient.delete(`academico/docentes/${docenteId}/disponibilidad/${dispId}/`);

// Deshacer la última generación automática de horarios de un paquete
export const deshacerGenerarHorario = (paqueteId) =>
  apiClient.post('academico/horarios/generar/deshacer/', { paquete_id: paqueteId });

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
