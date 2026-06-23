import apiClient from './apiClient';

export const secretariaService = {
  async getInventario() {
    const response = await apiClient.get('secretaria/bienes/');
    return response.data;
  },

  async registrarBien(datos) {
    const response = await apiClient.post('secretaria/bienes/', datos);
    return response.data;
  },
};

export const buscarAlumnos = (termino, signal) =>
  apiClient.get(`secretaria/alumnos/?buscar=${encodeURIComponent(termino)}`, { signal });