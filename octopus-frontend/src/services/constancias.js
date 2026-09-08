import apiClient from '../api/apiClient';

/**
 * Cliente Axios del módulo Constancias.
 * Contrato de endpoints: base `/api/constancias/...` (ver PROMPT_MODULO_CONSTANCIAS.md).
 * Todas las funciones aceptan un `signal` opcional (AbortController) para
 * cancelar peticiones en curso, siguiendo el patrón ya usado en el resto
 * del proyecto (ver src/api/cobranza.service.js).
 */

/* ── Plantillas ── */

export const getPlantillas = (params, signal) =>
  apiClient.get('constancias/plantillas/', { params, signal });

export const getPlantilla = (id, signal) =>
  apiClient.get(`constancias/plantillas/${id}/`, { signal });

export const crearPlantilla = (payload, signal) =>
  apiClient.post('constancias/plantillas/', payload, { signal });

export const actualizarPlantilla = (id, payload, signal) =>
  apiClient.put(`constancias/plantillas/${id}/`, payload, { signal });

export const eliminarPlantilla = (id, signal) =>
  apiClient.delete(`constancias/plantillas/${id}/`, { signal });

/* ── Placeholders (catálogo de tokens para el editor de plantillas) ── */

export const getPlaceholders = (destinatario, signal) =>
  apiClient.get('constancias/placeholders/', { params: { destinatario }, signal });

/* ── Previsualización y emisión ── */

export const previsualizarConstancia = (payload, signal) =>
  apiClient.post('constancias/previsualizar/', payload, { signal });

export const emitirConstancia = (payload, signal) =>
  apiClient.post('constancias/emitir/', payload, { signal });

/* ── Histórico de constancias emitidas ── */

export const getConstanciasEmitidas = (params, signal) =>
  apiClient.get('constancias/emitidas/', { params, signal });

export const getConstanciaEmitida = (id, signal) =>
  apiClient.get(`constancias/emitidas/${id}/`, { signal });

/**
 * Descarga el PDF de una constancia emitida como blob, para abrirlo/mostrarlo
 * en una nueva pestaña sin depender de que `pdf_url` sea públicamente accesible
 * (el cliente Axios ya envía el Authorization header via interceptor).
 */
export const getConstanciaEmitidaPdfBlob = (pdfUrl, signal) =>
  apiClient.get(pdfUrl, { responseType: 'blob', signal });

/* ── Configuración del firmante (singleton) ── */

export const getFirmante = (signal) =>
  apiClient.get('constancias/firmante/', { signal });

/**
 * `payload` puede ser un objeto plano (se envía como JSON) o una instancia de
 * FormData (se envía como multipart, cuando incluye firma_imagen/sello_imagen).
 */
export const actualizarFirmante = (payload, signal) => {
  const isMultipart = payload instanceof FormData;
  return apiClient.put('constancias/firmante/', payload, {
    signal,
    headers: isMultipart ? { 'Content-Type': 'multipart/form-data' } : undefined,
  });
};

/* ── Firma delegada (quién puede emitir con la firma del director) ── */

export const getFirmaDelegada = (signal) =>
  apiClient.get('constancias/firma-delegada/', { signal });

export const agregarFirmaDelegada = (userId, signal) =>
  apiClient.post(`constancias/firma-delegada/${userId}/`, {}, { signal });

export const quitarFirmaDelegada = (userId, signal) =>
  apiClient.delete(`constancias/firma-delegada/${userId}/`, { signal });
