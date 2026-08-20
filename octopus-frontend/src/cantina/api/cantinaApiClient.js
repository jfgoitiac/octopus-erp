import axios from 'axios';
import { tokenStore } from '../../api/tokenStore';

// Cliente axios de NEGOCIO para el módulo cantina (productos, categorías,
// movimientos de inventario, reportes — todos bajo /api/cantina/). Login
// unificado con el resto del staff (ver src/pages/Login.jsx +
// src/context/AuthContext.jsx): el access token vive en memoria
// (tokenStore, mismo singleton que usa apiClient.js) y el refresh viaja en
// la cookie httpOnly que puso POST /api/token/ — ya no hay localStorage ni
// un refresh endpoint propio de cantina.
export const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8000';

const cantinaApiClient = axios.create({
  baseURL: `${API_BASE}/api/cantina/`,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true,
  timeout: 15000,
});

// Interceptor de REQUEST — adjunta el access token en memoria
cantinaApiClient.interceptors.request.use(
  (config) => {
    const token = tokenStore.get();
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

// Interceptor de RESPONSE — refresh silencioso usando la cookie httpOnly
// del login unificado (mismo flujo que apiClient.js)
cantinaApiClient.interceptors.response.use(
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
        return cantinaApiClient(originalRequest);
      }).catch(err => Promise.reject(err));
    }

    originalRequest._retry = true;
    isRefreshing = true;

    try {
      const res = await axios.post(
        `${API_BASE}/api/token/refresh/`,
        {},
        { withCredentials: true }
      );

      const newAccessToken = res.data.access;
      tokenStore.set(newAccessToken);
      cantinaApiClient.defaults.headers.common['Authorization'] = `Bearer ${newAccessToken}`;

      processQueue(null, newAccessToken);

      originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
      return cantinaApiClient(originalRequest);

    } catch (refreshError) {
      processQueue(refreshError, null);
      tokenStore.clear();
      if (!window.location.pathname.includes('/login')) {
        window.location.href = '/login';
      }
      return Promise.reject(refreshError);
    } finally {
      isRefreshing = false;
    }
  }
);

export default cantinaApiClient;
