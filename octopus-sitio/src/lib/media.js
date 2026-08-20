// Helpers para resolver URLs de `Media` que vienen del backend real.
//
// Discrepancia con el contrato/mocks (ver resumen del agente Renderer
// público): los mocks simulaban `Media` expandida como objeto plano
// `{id, thumb, sm, md, lg, original}`, pero el serializer real
// (`sitio/serializers.py::_media_a_dict`) expande a
// `{id, variantes: {thumb, sm, md, lg, original}, alt_text}` — las variantes
// van anidadas bajo `variantes`, no en el nivel superior. Además esas URLs
// las genera `ImageField`/`FileField.url` de Django (MEDIA_URL='/media/...'),
// que son **relativas** al backend, no absolutas — hay que anteponerles el
// origin de la API (no el de este sitio) para que carguen.

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8000';
const API_ORIGIN = API_BASE.replace(/\/$/, '');

/** Antepone el origin de la API a una URL relativa (`/media/...`). URLs ya absolutas se devuelven tal cual. */
export const resolverUrlMedia = (url) => {
  if (!url) return '';
  if (/^https?:\/\//i.test(url) || url.startsWith('data:')) return url;
  return `${API_ORIGIN}${url.startsWith('/') ? '' : '/'}${url}`;
};

/**
 * Devuelve la URL resuelta de la primera variante disponible, en el orden de
 * prioridad pasado (ej. `urlVariante(imagen, 'lg', 'md', 'original')`).
 * Acepta `media` como el objeto expandido `{id, variantes, alt_text}`, un
 * string URL directo (plantillas demo del panel admin, que no pasan por la
 * biblioteca de Media), o `null`/`undefined` (retorna '').
 */
export const urlVariante = (media, ...prioridad) => {
  if (!media) return '';
  if (typeof media === 'string') return resolverUrlMedia(media);
  const variantes = media?.variantes;
  if (!variantes) return '';
  for (const clave of prioridad) {
    if (variantes[clave]) return resolverUrlMedia(variantes[clave]);
  }
  return '';
};
