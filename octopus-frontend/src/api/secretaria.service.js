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

  // Eliminación definitiva manual desde el módulo Representantes (no
  // Limpieza de Datos): solo para representantes sin ningún alumno
  // vinculado, ver secretaria/views.py::RepresentanteViewSet.eliminar_definitivo_manual.
  async eliminarRepresentanteDefinitivoManual(id) {
    await apiClient.delete(`secretaria/representantes/${id}/eliminar_definitivo_manual/`);
  },

};

export const buscarAlumnos = (termino, signal) =>
  apiClient.get(`secretaria/alumnos/?buscar=${encodeURIComponent(termino)}`, { signal });
