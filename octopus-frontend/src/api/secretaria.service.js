import apiClient from '../api/apiClient';

export const secretariaService = {
  // Gestión de Bienes Nacionales (Inventario)
  async getInventario() {
    const response = await apiClient.get('/secretaria/inventario/');
    return response.data;
  },

  async registrarBien(datos) {
    const response = await apiClient.post('/secretaria/inventario/', datos);
    return response.data;
  },

  async buscarAlumno(cedula) {
    const response = await apiClient.get(`/cobranza/buscar-alumno/${cedula}/`);
    return response.data;
  }
};