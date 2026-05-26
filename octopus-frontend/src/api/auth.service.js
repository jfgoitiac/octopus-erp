import apiClient from '../api/apiClient';

export const authService = {
  async login(username, password) {
    const response = await apiClient.post('/token/', { username, password });
    if (response.data.access) {
      localStorage.setItem('access_token', response.data.access);
      localStorage.setItem('refresh_token', response.data.refresh);
      // Guardamos datos del perfil si el serializer los devuelve
      localStorage.setItem('user_role', response.data.perfil?.rol);
    }
    return response.data;
  },

  logout() {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('user_role');
    window.location.href = '/login';
  },

  isAuthenticated() {
    return !!localStorage.getItem('access_token');
  },

  getCurrentUserRole() {
    return localStorage.getItem('user_role');
  }
};