import axios from 'axios';

// SEGURIDAD: La URL base debe venir de una variable de entorno Vite.
// En desarrollo: VITE_API_BASE_URL=http://127.0.0.1:8000
// En producción: VITE_API_BASE_URL=https://api.micolegio.edu.ve
// Si la variable no está definida, se usa el host local como fallback solo para desarrollo.
//
// NOTA SEGURIDAD (baja — arquitectural): portal_token (access) se sigue
// guardando en localStorage, lo que lo expone a ataques XSS. La mitigación
// principal es un CSP estricto en el servidor y evitar eval/innerHTML en el
// frontend. El REFRESH token ya NO vive en localStorage — viaja en una
// cookie HttpOnly (`portal_refresh_token`, path=/api/portal/) seteada por el
// backend (ver portal/views.py::PortalTokenView). Por eso withCredentials
// está activado: el navegador adjunta esa cookie automáticamente en cada
// petición a este baseURL, sin que JS pueda leerla ni manipularla.
const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8000';

const portalClient = axios.create({
  baseURL: `${API_BASE}/api/portal/`,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 15000,
  withCredentials: true,
});

// Interceptor de REQUEST — agrega el portal_token a cada petición
portalClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('portal_token');
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
portalClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (!error.response || error.response.status !== 401 || originalRequest._retry) {
      return Promise.reject(error);
    }

    // Contraseña temporal pendiente de cambio: el token es válido, pero el
    // backend bloquea el resto del portal hasta que el representante la
    // cambie. No tiene sentido refrescar el token ni cerrar sesión aquí.
    if (error.response.data?.code === 'debe_cambiar_password') {
      if (!window.location.pathname.includes('/portal/cambiar-contrasena')) {
        window.location.href = '/portal/cambiar-contrasena';
      }
      return Promise.reject(error);
    }

    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        failedQueue.push({ resolve, reject });
      }).then(token => {
        originalRequest.headers.Authorization = `Bearer ${token}`;
        return portalClient(originalRequest);
      }).catch(err => Promise.reject(err));
    }

    originalRequest._retry = true;
    isRefreshing = true;

    // El refresh token ya no se lee de localStorage: viaja solo en la cookie
    // HttpOnly `portal_refresh_token`, que el navegador adjunta solo gracias a
    // withCredentials: true. Si no hay cookie (o expiró), el backend responde 401.
    try {
      const res = await axios.post(
        `${API_BASE}/api/portal/token/refresh/`,
        {},
        { withCredentials: true }
      );

      const newAccessToken = res.data.access;
      localStorage.setItem('portal_token', newAccessToken);
      portalClient.defaults.headers.common['Authorization'] = `Bearer ${newAccessToken}`;

      processQueue(null, newAccessToken);

      originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
      return portalClient(originalRequest);

    } catch (refreshError) {
      processQueue(refreshError, null);
      localStorage.removeItem('portal_token');
      if (!window.location.pathname.includes('/portal/login')) {
        window.location.href = '/portal/login';
      }
      return Promise.reject(refreshError);
    } finally {
      isRefreshing = false;
    }
  }
);

export default portalClient;
