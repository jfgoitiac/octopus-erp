import axios from 'axios';

// Cliente axios para los endpoints "generales" de la API (academico/, comunicacion/,
// etc. — NO bajo /api/portal-docente/) que el docente también necesita consumir desde
// el portal. El backend autoriza estos endpoints leyendo request.user.perfil.rol en
// vivo, así que el mismo docente_token (emitido por POST /api/portal-docente/login/)
// sirve aquí sin cambios — solo cambia la baseURL respecto a portalDocenteClient.js.
// Mismo patrón que src/portal/api/academico.service.js + comunicacion.service.js
// (que reutilizan portal_token con una baseURL distinta a portalClient para /api/).
export const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8000';

const docenteApiClient = axios.create({
  baseURL: `${API_BASE}/api/`,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 15000,
});

// Interceptor de REQUEST — agrega el docente_token a cada petición
docenteApiClient.interceptors.request.use(
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

// Interceptor de RESPONSE — maneja 401 con refresh automático (mismo flujo que
// portalDocenteClient.js, contra el mismo endpoint de refresh del portal docente)
docenteApiClient.interceptors.response.use(
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
        return docenteApiClient(originalRequest);
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
      const res = await axios.post(`${API_BASE}/api/portal-docente/token/refresh/`, {
        refresh: refreshToken,
      });

      const newAccessToken = res.data.access;
      localStorage.setItem('docente_token', newAccessToken);
      docenteApiClient.defaults.headers.common['Authorization'] = `Bearer ${newAccessToken}`;

      processQueue(null, newAccessToken);

      originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
      return docenteApiClient(originalRequest);

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

export default docenteApiClient;
