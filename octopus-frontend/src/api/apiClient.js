import axios from 'axios';
import { tokenStore } from './tokenStore';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8000';

const apiClient = axios.create({
  baseURL: `${API_BASE}/api/`,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,  // envia la cookie HttpOnly del refresh token automaticamente
});

// Interceptor REQUEST — adjunta el access token en memoria
apiClient.interceptors.request.use(
  (config) => {
    const token = tokenStore.get();
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
  },
  (error) => Promise.reject(error)
);

let isRefreshing = false;
let failedQueue  = [];

const processQueue = (error, token = null) => {
  failedQueue.forEach(p => error ? p.reject(error) : p.resolve(token));
  failedQueue = [];
};

// Interceptor RESPONSE — refresh silencioso usando cookie HttpOnly
apiClient.interceptors.response.use(
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
        return apiClient(originalRequest);
      });
    }

    originalRequest._retry = true;
    isRefreshing = true;

    try {
      // La cookie HttpOnly se envia automaticamente (withCredentials: true)
      const res = await axios.post(
        `${API_BASE}/api/token/refresh/`,
        {},
        { withCredentials: true }
      );
      const newToken = res.data.access;
      tokenStore.set(newToken);
      apiClient.defaults.headers.common['Authorization'] = `Bearer ${newToken}`;
      processQueue(null, newToken);
      originalRequest.headers.Authorization = `Bearer ${newToken}`;
      return apiClient(originalRequest);
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

export default apiClient;
