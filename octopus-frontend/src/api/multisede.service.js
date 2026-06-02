import apiClient from './apiClient';

// ── Sedes ────────────────────────────────────────────────────────────────────
export const getSedes = () =>
  apiClient.get('multisede/sedes/').then(r => r.data);

export const createSede = (data) =>
  apiClient.post('multisede/sedes/', data).then(r => r.data);

export const updateSede = (id, data) =>
  apiClient.put(`multisede/sedes/${id}/`, data).then(r => r.data);

export const deleteSede = (id) =>
  apiClient.delete(`multisede/sedes/${id}/`).then(r => r.data);

// ── Usuarios por sede ────────────────────────────────────────────────────────
export const getUsuariosSede = (sedeId) =>
  apiClient.get(`multisede/sedes/${sedeId}/usuarios/`).then(r => r.data);

export const asignarUsuarioSede = (sedeId, data) =>
  apiClient.post(`multisede/sedes/${sedeId}/usuarios/`, data).then(r => r.data);

export const revocarUsuarioSede = (sedeId, userId) =>
  apiClient.delete(`multisede/sedes/${sedeId}/usuarios/${userId}/`).then(r => r.data);

// ── Dashboard ────────────────────────────────────────────────────────────────
export const getDashboardConsolidado = (signal) =>
  apiClient.get('multisede/dashboard/', { signal }).then(r => r.data);

export const getDashboardSede = (sedeId, signal) =>
  apiClient.get(`multisede/dashboard/${sedeId}/`, { signal }).then(r => r.data);
