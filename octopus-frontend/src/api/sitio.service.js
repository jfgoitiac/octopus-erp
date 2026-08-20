import apiClient from './apiClient';

/**
 * Servicio admin del módulo "Sitio Institucional" (CMS).
 *
 * Contrato de referencia: SITIO_CONTRATO_API.md (raíz del repo).
 * Prefijo real: api/sitio/admin/
 *
 * Conectado al backend real (app Django `sitio`). Respeta exactamente los
 * nombres de campo y la paginación DRF ({count, next, previous, results})
 * del contrato, por lo que los componentes que consumen este servicio no
 * requieren cambios de forma de datos respecto a los mocks previos.
 */

// ─── Configuración del sitio ───────────────────────────────────────────────

export const getConfiguracionSitio = (signal) =>
  apiClient.get('sitio/admin/configuracion/', { signal });

export const patchConfiguracionSitio = (data) =>
  apiClient.patch('sitio/admin/configuracion/', data);

// ─── Páginas ────────────────────────────────────────────────────────────────

export const getPaginas = ({ page = 1, estado, search, page_size } = {}, signal) => {
  const params = { page };
  if (estado) params.estado = estado;
  if (search) params.search = search;
  if (page_size) params.page_size = page_size;
  return apiClient.get('sitio/admin/paginas/', { params, signal });
};

export const getPagina = (id, signal) =>
  apiClient.get(`sitio/admin/paginas/${id}/`, { signal });

export const createPagina = (data) =>
  apiClient.post('sitio/admin/paginas/', data);

export const crearPaginaConSecciones = (data) =>
  apiClient.post('sitio/admin/paginas/con-secciones/', data);

export const updatePagina = (id, data) =>
  apiClient.patch(`sitio/admin/paginas/${id}/`, data);

export const deletePagina = (id) =>
  apiClient.delete(`sitio/admin/paginas/${id}/`);

export const publicarPagina = (id) =>
  apiClient.post(`sitio/admin/paginas/${id}/publicar/`);

export const despublicarPagina = (id) =>
  apiClient.post(`sitio/admin/paginas/${id}/despublicar/`);

// Papelera (Fase 2) — "Eliminar" en TablaPaginas manda aquí, no a deletePagina
// directo; el borrado permanente solo se hace desde la vista de papelera.
export const enviarPaginaAPapelera = (id) =>
  apiClient.post(`sitio/admin/paginas/${id}/papelera/`);

export const restaurarPaginaDePapelera = (id) =>
  apiClient.post(`sitio/admin/paginas/${id}/restaurar/`);

export const getPaginasPapelera = ({ page = 1, page_size } = {}, signal) => {
  const params = { page };
  if (page_size) params.page_size = page_size;
  return apiClient.get('sitio/admin/paginas/papelera/', { params, signal });
};

export const duplicarPagina = (id) =>
  apiClient.post(`sitio/admin/paginas/${id}/duplicar/`);

export const guardarPaginaComoPlantilla = (id, nombre) =>
  apiClient.post(`sitio/admin/paginas/${id}/guardar-como-plantilla/`, { nombre });

// Vista previa animada (sitio público, octopus-sitio) de una página guardada
// (cualquier estado) o de secciones sueltas de una plantilla todavía no
// creada. Ambas devuelven {token, expira_en}; el token se abre en
// `${VITE_SITIO_URL}/preview/<token>`.
export const crearPreviewPagina = (id) =>
  apiClient.post(`sitio/admin/paginas/${id}/preview/`);

export const crearPreviewPlantilla = (data) =>
  apiClient.post('sitio/admin/preview-plantilla/', data);

// ─── Secciones (bloques) ────────────────────────────────────────────────────

export const getSecciones = (paginaId, signal) =>
  apiClient.get(`sitio/admin/paginas/${paginaId}/secciones/`, { signal });

export const createSeccion = (paginaId, data) =>
  apiClient.post(`sitio/admin/paginas/${paginaId}/secciones/`, data);

export const updateSeccion = (id, data) =>
  apiClient.patch(`sitio/admin/secciones/${id}/`, data);

export const deleteSeccion = (id) =>
  apiClient.delete(`sitio/admin/secciones/${id}/`);

export const reordenarSecciones = (paginaId, ordenIds) =>
  apiClient.post(`sitio/admin/paginas/${paginaId}/secciones/reordenar/`, { orden: ordenIds });

// ─── Patrones de bloque y plantillas de página del usuario (Fase 2) ────────

export const getPatronesBloque = (tipo, signal) =>
  apiClient.get('sitio/admin/patrones/', { params: tipo ? { tipo } : undefined, signal });

export const createPatronBloque = (data) =>
  apiClient.post('sitio/admin/patrones/', data);

export const deletePatronBloque = (id) =>
  apiClient.delete(`sitio/admin/patrones/${id}/`);

export const getPlantillasUsuario = (signal) =>
  apiClient.get('sitio/admin/plantillas-usuario/', { signal });

export const deletePlantillaUsuario = (id) =>
  apiClient.delete(`sitio/admin/plantillas-usuario/${id}/`);

// ─── Artículos ──────────────────────────────────────────────────────────────

export const getArticulos = ({ page = 1, estado, categoria, search, page_size } = {}, signal) => {
  const params = { page };
  if (estado) params.estado = estado;
  if (categoria) params.categoria = categoria;
  if (search) params.search = search;
  if (page_size) params.page_size = page_size;
  return apiClient.get('sitio/admin/articulos/', { params, signal });
};

export const getArticulo = (id, signal) =>
  apiClient.get(`sitio/admin/articulos/${id}/`, { signal });

export const createArticulo = (data) =>
  apiClient.post('sitio/admin/articulos/', data);

export const updateArticulo = (id, data) =>
  apiClient.patch(`sitio/admin/articulos/${id}/`, data);

export const deleteArticulo = (id) =>
  apiClient.delete(`sitio/admin/articulos/${id}/`);

export const publicarArticulo = (id) =>
  apiClient.post(`sitio/admin/articulos/${id}/publicar/`);

// ─── Categorías ─────────────────────────────────────────────────────────────

export const getCategorias = (signal) =>
  apiClient.get('sitio/admin/categorias/', { signal });

export const createCategoria = (data) =>
  apiClient.post('sitio/admin/categorias/', data);

export const updateCategoria = (id, data) =>
  apiClient.patch(`sitio/admin/categorias/${id}/`, data);

export const deleteCategoria = (id) =>
  apiClient.delete(`sitio/admin/categorias/${id}/`);

// ─── Biblioteca de media ────────────────────────────────────────────────────

export const getMedia = ({ page = 1, search } = {}, signal) => {
  const params = { page };
  if (search) params.search = search;
  return apiClient.get('sitio/admin/media/', { params, signal });
};

export const subirMedia = (file, altText = '') => {
  const formData = new FormData();
  formData.append('archivo_original', file);
  if (altText) formData.append('alt_text', altText);
  return apiClient.post('sitio/admin/media/', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
};

export const deleteMedia = (id) =>
  apiClient.delete(`sitio/admin/media/${id}/`);

export const updateMedia = (id, data) =>
  apiClient.patch(`sitio/admin/media/${id}/`, data);

// ─── Menús ──────────────────────────────────────────────────────────────────

export const getMenus = (signal) =>
  apiClient.get('sitio/admin/menus/', { signal });

export const createMenu = (nombre) =>
  apiClient.post('sitio/admin/menus/', { nombre });

export const actualizarItemsMenu = (menuId, items) =>
  apiClient.put(`sitio/admin/menus/${menuId}/items/`, { items });

// ─── Métricas ───────────────────────────────────────────────────────────────

export const getMetricasSitio = (signal) =>
  apiClient.get('sitio/admin/metricas/', { signal });
