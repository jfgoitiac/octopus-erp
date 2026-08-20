// Servicio de datos del sitio público. Expone una función por endpoint del
// contrato (SITIO_CONTRATO_API.md sección 3). Cada función retorna la
// promesa de `sitioClient` (axios) tal cual — un objeto `{ data }` — para
// que páginas y componentes sigan consumiendo `res.data` sin cambios.
//
// Conectado al backend real (app `sitio`) — ver `./sitioClient.js` para la
// configuración de base URL (VITE_API_BASE_URL).

import sitioClient from './sitioClient';

/** GET /api/sitio/configuracion/ */
export const getConfiguracion = async () => sitioClient.get('configuracion/');

/** GET /api/sitio/menus/<nombre>/ */
export const getMenu = async (nombre) => sitioClient.get(`menus/${nombre}/`);

/** GET /api/sitio/paginas/home/ */
export const getPaginaHome = async () => sitioClient.get('paginas/home/');

/** GET /api/sitio/paginas/<slug>/ — 404 si no existe/no publicada. */
export const getPagina = async (slug) => sitioClient.get(`paginas/${slug}/`);

/** GET /api/sitio/articulos/ — listado paginado, filtros categoria/search. */
export const getArticulos = async ({ page = 1, categoria = '', search = '' } = {}) =>
  sitioClient.get('articulos/', { params: { page, categoria, search } });

/** GET /api/sitio/articulos/<slug>/ — 404 si no existe/no publicado. */
export const getArticulo = async (slug) => sitioClient.get(`articulos/${slug}/`);

/** GET /api/sitio/categorias/ */
export const getCategorias = async () => sitioClient.get('categorias/');

/**
 * GET /api/sitio/preview/<token>/ — página en borrador o plantilla sin
 * guardar, generada desde el panel admin (botón "Vista previa" en
 * CrearPaginaModal/ConstructorPaginas). 404 si el token expiró (TTL 30min).
 */
export const getPreview = async (token) => sitioClient.get(`preview/${token}/`);
