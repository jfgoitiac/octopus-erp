import apiClient from './apiClient';

// Circulares — panel admin
export const getCirculares = (page = 1, signal) =>
  apiClient.get('comunicacion/circulares/', { params: { page }, ...(signal ? { signal } : {}) });

export const getCircular = (id, signal) =>
  apiClient.get(`comunicacion/circulares/${id}/`, signal ? { signal } : undefined);

export const createCircular = (data) => {
  const formData = new FormData();
  formData.append('titulo', data.titulo);
  formData.append('cuerpo', data.cuerpo);
  formData.append('requiere_confirmacion', data.requiere_confirmacion ? 'true' : 'false');
  if (data.adjunto) formData.append('adjunto', data.adjunto);
  return apiClient.post('comunicacion/circulares/', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
};

export const getLecturasCircular = (id, signal) =>
  apiClient.get(`comunicacion/circulares/${id}/lecturas/`, signal ? { signal } : undefined);

// Mensajes directos — panel admin/docente
export const getMensajes = (alumnoId, signal) => {
  const url = alumnoId ? `comunicacion/mensajes/?alumno_id=${alumnoId}` : 'comunicacion/mensajes/';
  return apiClient.get(url, signal ? { signal } : undefined);
};

export const enviarMensaje = (data) => {
  const formData = new FormData();
  formData.append('alumno_id', data.alumno_id);
  formData.append('cuerpo', data.cuerpo);
  if (data.adjunto) formData.append('adjunto', data.adjunto);
  return apiClient.post('comunicacion/mensajes/', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
};

export const marcarMensajeLeido = (id) =>
  apiClient.patch(`comunicacion/mensajes/${id}/leer/`);
