import apiClient from '../../api/apiClient';

/**
 * Llamada mínima al endpoint de catálogo de placeholders para constancias.
 * Se hace directo con apiClient (no se importa src/services/constancias.js
 * a propósito, para no crear dependencia cruzada con el agente que lo construye
 * en paralelo).
 *
 * GET /api/constancias/placeholders/?destinatario=alumno|trabajador|representante
 *
 * Forma esperada de la respuesta (catálogo agrupado por entidad):
 * {
 *   grupos: [
 *     { clave: 'alumno', etiqueta: 'Alumno', placeholders: [
 *       { token: 'alumno.nombres', etiqueta: 'Nombres del alumno' }, ...
 *     ]},
 *     ...
 *   ],
 *   sexo: { pares_sugeridos: [{ a: 'el', b: 'la' }, ...] }
 * }
 */
export const getPlaceholdersCatalog = async (destinatario) => {
  const res = await apiClient.get('constancias/placeholders/', {
    params: destinatario ? { destinatario } : undefined,
  });
  return res.data;
};

// Fallback de pares de género sugeridos, por si el endpoint no responde
// todavía (desarrollo en paralelo) o no trae `sexo.pares_sugeridos`.
export const PARES_GENERO_FALLBACK = [
  ['el', 'la'],
  ['alumno', 'alumna'],
  ['ciudadano', 'ciudadana'],
  ['portador', 'portadora'],
  ['inscrito', 'inscrita'],
  ['trabajador', 'trabajadora'],
  ['nacido', 'nacida'],
  ['promovido', 'promovida'],
  ['representado', 'representada'],
  ['hijo', 'hija'],
].map(([a, b]) => ({ a, b }));
