/**
 * Resuelve la URL final de un ItemMenu según su tipo_destino.
 * Compartido entre header y footer para no duplicar la lógica.
 *
 * El backend real (`MenuPublicoSerializer.get_items`) devuelve `pagina_slug`
 * y `articulo_slug` como strings planos (no objetos anidados) — se soportan
 * ambas formas por compatibilidad con los mocks previos.
 */
export const resolverUrlItemMenu = (item) => {
  if (item.tipo_destino === 'url_externa') return item.url_externa || '#';
  if (item.tipo_destino === 'articulo') {
    const slugArticulo = item.articulo?.slug ?? item.articulo_slug;
    return slugArticulo ? `/articulos/${slugArticulo}` : '/articulos';
  }
  if (item.tipo_destino === 'pagina') {
    const slug = item.pagina?.slug ?? item.pagina_slug;
    if (!slug || slug === 'home') return '/';
    return `/${slug}`;
  }
  return '#';
};

export const esUrlExterna = (item) => item.tipo_destino === 'url_externa' && /^https?:\/\//.test(item.url_externa || '');
