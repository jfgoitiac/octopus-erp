import apiClient from '../api/apiClient';

export const USE_STUBS = false;
const proveedores = [{ id: 1, razon_social: 'Papelería C.A.', rif: 'J-12345678-9', condicion_habitual: 'contado', activo: true }];
const resultado = (data) => Promise.resolve({ data });
export const listarProveedores = (params = {}) => USE_STUBS ? resultado(proveedores.filter((p) => !params.q || p.razon_social.toLowerCase().includes(params.q.toLowerCase()))) : apiClient.get('finanzas/proveedores/', { params });
export const crearProveedor = (body) => USE_STUBS ? resultado({ ...body, id: Date.now(), activo: true }) : apiClient.post('finanzas/proveedores/', body);
export const actualizarProveedor = (id, body) => apiClient.patch(`finanzas/proveedores/${id}/`, body);
export const listarCategorias = () => USE_STUBS ? resultado([]) : apiClient.get('finanzas/categorias/');
