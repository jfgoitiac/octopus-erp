import apiClient from '../api/apiClient';

// Mientras el backend se integra, permite recorrer el flujo sin datos remotos.
export const USE_STUBS = false;
const stub = [
  { id: 1, numero_documento: 'A-102', proveedor_nombre: 'Papelería C.A.', categoria_nombre: 'Material didáctico', fecha_egreso: '2026-10-07', moneda: 'VES', monto_ves: '5800.00', monto_usd: '38.67', estado: 'registrado', origen: 'factura' },
  { id: 2, numero_documento: 'CxP-44', proveedor_nombre: 'Servicios Norte', categoria_nombre: 'Mantenimiento', fecha_egreso: '2026-10-06', moneda: 'USD', monto_ves: '7500.00', monto_usd: '50.00', estado: 'registrado', origen: 'cuenta_por_pagar', pagos_cuenta_por_pagar: [] },
];
const result = (data) => Promise.resolve({ data });
export const listarEgresos = (params = {}) => USE_STUBS ? result(stub.filter((x) => !params.origen || x.origen === params.origen)) : apiClient.get('egresos/', { params });
export const obtenerEgreso = (id) => USE_STUBS ? result(stub.find((x) => x.id === Number(id)) || stub[0]) : apiClient.get(`egresos/${id}/`);
export const crearEgreso = (body) => USE_STUBS ? result({ ...body, id: Date.now(), estado: 'registrado' }) : apiClient.post('egresos/', body);
export const anularEgreso = (id, motivo) => USE_STUBS ? result({ id, estado: 'anulado', motivo }) : apiClient.post(`egresos/${id}/anular/`, { motivo });
export const calcularTotales = (body) => USE_STUBS ? result(body) : apiClient.post('egresos/calcular-totales/', body);
export const buscarArticulos = (params) => USE_STUBS ? result([]) : apiClient.get('egresos/articulos/', { params });
export const subirComprobante = (id, formData) => apiClient.post(`egresos/${id}/comprobantes/`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
export const listarComprobantes = (id) => apiClient.get(`egresos/${id}/comprobantes/`);
export const eliminarComprobante = (id, comprobanteId) => apiClient.delete(`egresos/${id}/comprobantes/${comprobanteId}/`);
