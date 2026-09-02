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

  // Eliminación definitiva manual desde el módulo Representantes (no
  // Limpieza de Datos): solo para representantes sin ningún alumno
  // vinculado, ver secretaria/views.py::RepresentanteViewSet.eliminar_definitivo_manual.
  async eliminarRepresentanteDefinitivoManual(id) {
    await apiClient.delete(`secretaria/representantes/${id}/eliminar_definitivo_manual/`);
  },

  async eliminarTodosLosAlumnos() {
    const response = await apiClient.delete('secretaria/alumnos/eliminar_todos/');
    return response.data;
  },
};

export const buscarAlumnos = (termino, signal) =>
  apiClient.get(`secretaria/alumnos/?buscar=${encodeURIComponent(termino)}`, { signal });