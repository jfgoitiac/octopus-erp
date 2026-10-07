import apiClient from '../api/apiClient';

// Egresos siempre consume la API; una deuda se origina exclusivamente en CxP.
export const listarEgresos = (params = {}) => apiClient.get('egresos/', { params });
export const obtenerEgreso = (id) => apiClient.get(`egresos/${id}/`);
export const crearEgreso = async (body) => {
  // El API crea primero un borrador para poder validar y calcular; el alta desde
  // Egresos siempre lo confirma como contado en la misma operación de UI.
  const { data: borrador } = await apiClient.post('egresos/', body);
  return apiClient.post(`egresos/${borrador.id}/guardar/`, body);
};
export const anularEgreso = (id, motivo) => apiClient.post(`egresos/${id}/anular/`, { motivo });
// El contrato expone el cálculo en un egreso ya creado (borrador), no como ruta de colección.
export const calcularTotales = (id, body) => apiClient.post(`egresos/${id}/calcular-totales/`, body);
export const buscarArticulos = (params) => apiClient.get('egresos/articulos/', { params });
export const subirComprobante = (id, formData) => apiClient.post(`egresos/${id}/comprobantes/`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
export const listarComprobantes = (id) => apiClient.get(`egresos/${id}/comprobantes/`);
export const eliminarComprobante = (id, comprobanteId) => apiClient.delete(`egresos/${id}/comprobantes/${comprobanteId}/`);
export const obtenerConfiguracionEgresos = () => apiClient.get('egresos/configuracion/');
