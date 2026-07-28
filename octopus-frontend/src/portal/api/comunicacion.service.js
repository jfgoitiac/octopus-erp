import portalClient from './portalClient';

/**
 * Lista las circulares visibles para el representante autenticado, con su
 * propio estado de lectura (leido, fecha_lectura) anotado por el backend.
 */
export const getCirculares = (signal) =>
  portalClient.get('comunicacion/circulares/', signal ? { signal } : undefined);

/**
 * Marca una circular como leída por el representante autenticado.
 * @param {number|string} circularId
 */
export const confirmarLectura = (circularId) =>
  portalClient.post(`comunicacion/circulares/${circularId}/confirmar/`);

// Mensajes directos — portal representante
export const getMensajesPortal = (alumnoId, signal) => {
  const url = alumnoId ? `comunicacion/mensajes/?alumno_id=${alumnoId}` : 'comunicacion/mensajes/';
  return portalClient.get(url, signal ? { signal } : undefined);
};

export const enviarMensajePortal = (data) => {
  const formData = new FormData();
  formData.append('alumno_id', data.alumno_id);
  formData.append('cuerpo', data.cuerpo);
  if (data.adjunto) formData.append('adjunto', data.adjunto);
  return portalClient.post('comunicacion/mensajes/', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
};

export const marcarMensajeLeidoPortal = (id) =>
  portalClient.patch(`comunicacion/mensajes/${id}/leer/`);
