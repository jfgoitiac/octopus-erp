import apiClient from '../api/apiClient';

// Revisión de comprobantes subidos desde el portal de representantes
// (ver contrato de revisión de comprobantes). Todas las rutas son relativas
// al baseURL `/api/` de apiClient.

const conSignal = (signal, extra = {}) => (signal ? { ...extra, signal } : extra);

export const listarComprobantes = (estatus, signal) =>
  apiClient.get('portal/admin/comprobantes/', conSignal(signal, { params: { estatus } }));

export const obtenerComprobante = (id, signal) =>
  apiClient.get(`portal/admin/comprobantes/${id}/`, conSignal(signal));

// La aprobación ya no tiene endpoint propio: un comprobante se aprueba
// registrando el pago en caja (`POST cobranza/registrar-pago/` con
// `comprobante_portal_id`). Aquí solo queda el rechazo.

/**
 * Id del primer comprobante pendiente distinto de `excluirId`, o null.
 * Se usa al terminar una revisión (rechazo o pago en caja) para seguir con el
 * siguiente. Si la consulta falla devuelve null y el caller vuelve a la lista.
 */
export const buscarSiguientePendiente = async (excluirId) => {
  try {
    const { data } = await listarComprobantes('pendiente');
    const lista = Array.isArray(data) ? data : data?.results || [];
    return lista.find((c) => String(c.id) !== String(excluirId))?.id ?? null;
  } catch {
    return null;
  }
};

export const rechazarComprobante = (id, { motivo_rechazo_id, observaciones }) =>
  apiClient.patch(`portal/admin/comprobantes/${id}/`, {
    estatus: 'rechazado',
    ...(motivo_rechazo_id ? { motivo_rechazo_id } : {}),
    observaciones: observaciones || '',
  });

// El archivo vive en una ruta protegida: se descarga como blob con el token
// del panel y el caller crea/revoca el object URL.
export const descargarArchivoComprobante = (url, signal) =>
  apiClient.get(url, conSignal(signal, { responseType: 'blob' }));

/* ── Motivos de rechazo ── */
export const listarMotivosRechazo = ({ soloActivos = false } = {}, signal) =>
  apiClient.get('portal/admin/motivos-rechazo/', conSignal(signal, soloActivos ? { params: { activos: 1 } } : {}));

export const crearMotivoRechazo = (datos) =>
  apiClient.post('portal/admin/motivos-rechazo/', datos);

export const actualizarMotivoRechazo = (id, datos) =>
  apiClient.patch(`portal/admin/motivos-rechazo/${id}/`, datos);

export const eliminarMotivoRechazo = (id) =>
  apiClient.delete(`portal/admin/motivos-rechazo/${id}/`);

/* ── Plantillas de aviso del portal ── */
export const listarPlantillasAviso = (signal) =>
  apiClient.get('notificaciones/plantillas-aviso/', conSignal(signal));

export const actualizarPlantillaAviso = (id, datos) =>
  apiClient.patch(`notificaciones/plantillas-aviso/${id}/`, datos);
