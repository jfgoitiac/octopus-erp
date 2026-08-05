import docenteApiClient from './docenteApiClient';

// Mensajes directos — portal docente
// GET sin alumno_id: todas las conversaciones donde el docente participa (bandeja plana).
// GET con alumno_id: la conversación de un alumno puntual.
export const getMensajes = (alumnoId, signal) => {
  const url = alumnoId ? `comunicacion/mensajes/?alumno_id=${alumnoId}` : 'comunicacion/mensajes/';
  return docenteApiClient.get(url, signal ? { signal } : undefined);
};

export const enviarMensaje = (data) =>
  docenteApiClient.post('comunicacion/mensajes/', { alumno_id: data.alumno_id, cuerpo: data.cuerpo });

export const marcarMensajeLeido = (id) =>
  docenteApiClient.patch(`comunicacion/mensajes/${id}/leer/`);
