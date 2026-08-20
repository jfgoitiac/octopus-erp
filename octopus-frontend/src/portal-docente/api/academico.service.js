import apiClient from '../../api/apiClient';

// Mis Materias
export const getMisMaterias = (signal) =>
  apiClient.get('academico/docente/mis-materias/', signal ? { signal } : undefined);

export const getMateria = (id, signal) =>
  apiClient.get(`academico/materias/${id}/`, signal ? { signal } : undefined);

// Mi Horario (próximas clases)
export const getMiHorario = (limite, signal) =>
  apiClient.get(`academico/docente/mi-horario/?limite=${limite || 5}`, signal ? { signal } : undefined);

// Próximas evaluaciones (ítems de plan de evaluación con fecha futura, hero)
export const getProximasEvaluaciones = (limite, signal) =>
  apiClient.get(`academico/docente/proximas-evaluaciones/?limite=${limite || 5}`, signal ? { signal } : undefined);

// Eventos de calendario (personales)
export const getEventosCalendario = (mes, anio, signal) =>
  apiClient.get(`academico/eventos-calendario/?mes=${mes}&anio=${anio}`, signal ? { signal } : undefined);

export const createEventoCalendario = (data) =>
  apiClient.post('academico/eventos-calendario/', data);

export const deleteEventoCalendario = (id) =>
  apiClient.delete(`academico/eventos-calendario/${id}/`);

// Lapsos — el docente solo lista (no crea/edita/cierra)
export const getLapsos = (periodoEscolar, signal) => {
  const url = periodoEscolar
    ? `academico/lapsos/?periodo_escolar=${encodeURIComponent(periodoEscolar)}`
    : 'academico/lapsos/';
  return apiClient.get(url, signal ? { signal } : undefined);
};

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

// Incidentes disciplinarios
export const getIncidentes = (filtros, signal) => {
  const params = new URLSearchParams(filtros || {});
  const qs = params.toString();
  return apiClient.get(`academico/incidentes/${qs ? `?${qs}` : ''}`, signal ? { signal } : undefined);
};

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

// Cambio de contraseña
export const cambiarContrasena = (data) =>
  apiClient.post('portal-docente/cambiar-contrasena/', data);

// NOTA: no existe un endpoint dedicado "alumnos de mi sección" para el docente.
// Se reutiliza el roster que ya retorna AsistenciaView (alumno_id, alumno_nombre
// para todos los alumnos del grado, tengan o no asistencia marcada ese día) como
// fuente de la lista de alumnos, evitando duplicar esa data. Ver useAlumnosSeccion.
export const getRosterSeccion = (gradoSeccion, fechaISO, signal) =>
  getAsistencia(gradoSeccion, fechaISO, signal);

// Comparación de la sección propia vs. otras secciones de la misma materia
export const getComparacionMateria = (materiaId, lapsoId, signal) =>
  apiClient.get(`academico/docente/comparacion-materia/${materiaId}/`, {
    params: { lapso_id: lapsoId },
    signal,
  });

// Alertas de alumnos en riesgo (asistente proactivo del hero)
export const getAlertasRiesgo = (signal) =>
  apiClient.get('academico/docente/alertas-riesgo/', { signal });

// Radar de cierre de lapso (planes de evaluación pendientes/vencidos)
export const getRadarCierreLapso = (diasAnticipacion = 5, signal) =>
  apiClient.get('academico/docente/radar-cierre-lapso/', {
    params: { dias_anticipacion: diasAnticipacion },
    signal,
  });

// Rendimiento histórico de un alumno (por lapso), para el modal de evolución
export const getRendimientoAlumno = (alumnoId, signal) =>
  apiClient.get(`academico/rendimiento/alumno/${alumnoId}/`, { signal });
