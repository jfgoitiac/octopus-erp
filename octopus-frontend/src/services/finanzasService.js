import apiClient from '../api/apiClient';

// Finanzas siempre consume la API: no hay datos simulados en producción ni desarrollo.
export const listarProveedores = (params = {}) => apiClient.get('finanzas/proveedores/', { params });
export const crearProveedor = (body) => apiClient.post('finanzas/proveedores/', body);
export const actualizarProveedor = (id, body) => apiClient.patch(`finanzas/proveedores/${id}/`, body);
export const listarCategorias = () => apiClient.get('finanzas/categorias/');
