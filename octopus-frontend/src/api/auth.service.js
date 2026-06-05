import apiClient from './apiClient';
import { tokenStore } from './tokenStore';

export const authService = {
  async login(username, password) {
    const response = await apiClient.post('token/', { username, password });
    if (response.data.access) {
      tokenStore.set(response.data.access);
      // refresh llega como cookie HttpOnly — no manipular desde JS
    }
    return response.data;
  },

  logout() {
    tokenStore.clear();
    window.location.href = '/login';
  },

  isAuthenticated() {
    return !!tokenStore.get();
  },
};
