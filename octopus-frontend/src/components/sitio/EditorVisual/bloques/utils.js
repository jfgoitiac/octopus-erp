/**
 * Helpers compartidos por los componentes de bloques/ (preview simplificada
 * para el editor admin).
 *
 * Los campos de imagen en `Seccion.contenido` referencian `Media` por id,
 * pero el serializer del backend expande el campo a `{id, variantes, alt_text}`
 * al leer. Estos helpers manejan ambos casos sin romper.
 */

// Devuelve la mejor URL disponible para mostrar en preview (o null si el
// campo todavía no tiene una `Media` expandida asociada). Acepta también un
// string URL directo (plantillas.js siembra imágenes demo así, sin pasar por
// la biblioteca de Media).
export const resolverImagenUrl = (valor, variante = 'md') => {
  if (!valor) return null;
  if (typeof valor === 'string') return valor;
  return valor.variantes?.[variante] || valor.variantes?.thumb || valor.variantes?.original || null;
};

export const resolverAltText = (valor, fallback = '') => {
  if (valor && typeof valor === 'object') return valor.alt_text || fallback;
  return fallback;
};

// `config_estilo` por defecto para una Seccion nueva (ver contrato §4).
export const CONFIG_ESTILO_DEFAULT = { ancho: 'contenido', espaciado_top: 'md', espaciado_bottom: 'md', fondo: 'blanco' };

// `contenido` por defecto para una Seccion nueva, según su `tipo`. Se usa
// tanto al agregar un bloque en blanco desde el editor (ConstructorPaginas)
// como al sembrar las secciones de una plantilla (components/sitio/plantillas.js).
export const contenidoPorDefecto = (tipo) => {
  switch (tipo) {
    case 'hero':
      return { titulo: 'Título principal', subtitulo: 'Subtítulo del bloque', imagen_fondo: null, cta_texto: '', cta_url: '', overlay: 'oscuro' };
    case 'texto_imagen':
      return { titulo: 'Título', texto: 'Escribe aquí el contenido del bloque.', imagen: null, posicion_imagen: 'derecha', cta_texto: '', cta_url: '' };
    case 'galeria':
      return { titulo: '', imagenes: [], columnas: 3 };
    case 'cards':
      return { titulo: '', items: [], columnas: 3 };
    case 'cta':
      return { titulo: 'Título de llamada a la acción', texto: 'Texto descriptivo breve.', boton_texto: 'Saber más', boton_url: '', fondo: null };
    case 'testimonios':
      return { titulo: '', items: [] };
    case 'carrusel':
      return { slides: [], autoplay: true, intervalo_ms: 5000 };
    default:
      return {};
  }
};
