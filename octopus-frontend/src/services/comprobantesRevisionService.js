import apiClient from '../api/apiClient';

// Revisión de comprobantes subidos desde el portal de representantes
// (ver contrato de revisión de comprobantes). Todas las rutas son relativas
// al baseURL `/api/` de apiClient.

const conSignal = (signal, extra = {}) => (signal ? { ...extra, signal } : extra);

export const listarComprobantes = (estatus, signal) =>
  apiClient.get('portal/admin/comprobantes/', conSignal(signal, { params: { estatus } }));

export const obtenerComprobante = (id, signal) =>
  apiClient.get(`portal/admin/comprobantes/${id}/`, conSignal(signal));

export const obtenerTasaComprobante = (fecha, signal) =>
  apiClient.get('portal/admin/comprobantes/tasa/', conSignal(signal, { params: { fecha } }));

export const aprobarComprobante = (id, datos) =>
  apiClient.patch(`portal/admin/comprobantes/${id}/`, { ...datos, estatus: 'aprobado' });

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
