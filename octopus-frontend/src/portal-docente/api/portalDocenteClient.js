import axios from 'axios';

// SEGURIDAD: La URL base debe venir de una variable de entorno Vite.
// En desarrollo: VITE_API_BASE_URL=http://127.0.0.1:8000
// En producción: VITE_API_BASE_URL=https://api.micolegio.edu.ve
// Si la variable no está definida, se usa el host local como fallback solo para desarrollo.
//
// NOTA SEGURIDAD (baja — arquitectural): docente_token se guarda en localStorage,
// lo que lo expone a ataques XSS. Mismo riesgo/mitigación que portal_token
// (ver src/portal/api/portalClient.js) — anotado en NOTAS_TECNICAS.md.
const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8000';

const portalDocenteClient = axios.create({
  baseURL: `${API_BASE}/api/portal-docente/`,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 15000,
});

// Interceptor de REQUEST — agrega el docente_token a cada petición
portalDocenteClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('docente_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Variable para evitar múltiples refresh simultáneos
let isRefreshing = false;
let failedQueue = [];

const processQueue = (error, token = null) => {
  failedQueue.forEach(prom => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

// Interceptor de RESPONSE — maneja 401 con refresh automático
portalDocenteClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (!error.response || error.response.status !== 401 || originalRequest._retry) {
      return Promise.reject(error);
    }

    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        failedQueue.push({ resolve, reject });
      }).then(token => {
        originalRequest.headers.Authorization = `Bearer ${token}`;
        return portalDocenteClient(originalRequest);
      }).catch(err => Promise.reject(err));
    }

    originalRequest._retry = true;
    isRefreshing = true;

    const refreshToken = localStorage.getItem('docente_refresh_token');

    if (!refreshToken) {
      localStorage.removeItem('docente_token');
      localStorage.removeItem('docente_refresh_token');
      if (!window.location.pathname.includes('/portal-docente/login')) {
        window.location.href = '/portal-docente/login';
      }
      return Promise.reject(error);
    }

    try {
      // NOTA: endpoint de refresh asumido por simetría con /api/portal/token/refresh/.
      // Confirmar con backend si difiere.
      const res = await axios.post(`${API_BASE}/api/portal-docente/token/refresh/`, {
        refresh: refreshToken,
      });

      const newAccessToken = res.data.access;
      localStorage.setItem('docente_token', newAccessToken);
      portalDocenteClient.defaults.headers.common['Authorization'] = `Bearer ${newAccessToken}`;

      processQueue(null, newAccessToken);

      originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
      return portalDocenteClient(originalRequest);

    } catch (refreshError) {
      processQueue(refreshError, null);
      localStorage.removeItem('docente_token');
      localStorage.removeItem('docente_refresh_token');
      if (!window.location.pathname.includes('/portal-docente/login')) {
        window.location.href = '/portal-docente/login';
      }
      return Promise.reject(refreshError);
    } finally {
      isRefreshing = false;
    }
  }
);

export default portalDocenteClient;
