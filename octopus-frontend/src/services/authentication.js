import apiClient from '../api/apiClient';

/**
 * Cliente Axios mínimo del dominio `authentication`. El endpoint
 * `GET /api/authentication/users/` (authentication/views.py::UserManagementViewSet)
 * ya se consulta hoy directamente con `apiClient` desde
 * `src/hooks/useUsuariosSistemas.js` (panel de Sistemas) — este archivo
 * existe para que otros módulos (ej. constancias/firma delegada) lo
 * reutilicen sin duplicar la ruta ni mezclar dominios.
 */

export const getUsuarios = (params, signal) =>
  apiClient.get('authentication/users/', { params, signal });
