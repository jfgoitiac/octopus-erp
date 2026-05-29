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

  async buscarAlumno(cedula) {
    const response = await apiClient.get(`cobranza/buscar/${cedula}/`);
    return response.data;
  }
};