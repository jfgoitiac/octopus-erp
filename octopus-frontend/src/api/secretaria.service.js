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

  // TODO-TEMPORAL: quitar junto con LimpiezaDatosTab tras limpieza de datos de prueba
  async eliminarAlumnoDefinitivo(id) {
    await apiClient.delete(`secretaria/alumnos/${id}/eliminar_definitivo/`);
  },

  async eliminarRepresentanteDefinitivo(id) {
    await apiClient.delete(`secretaria/representantes/${id}/eliminar_definitivo/`);
  },

  async eliminarTodosLosAlumnos() {
    const response = await apiClient.delete('secretaria/alumnos/eliminar_todos/');
    return response.data;
  },
};

export const buscarAlumnos = (termino, signal) =>
  apiClient.get(`secretaria/alumnos/?buscar=${encodeURIComponent(termino)}`, { signal });