import { ESTADO } from '../../constants/asistencia';

// Hacia dónde sale la tarjeta al marcarla: Presente/Retardado a la derecha
// ("adentro"), Ausente a la izquierda y Justificado hacia arriba.
export const SALIDA_POR_ESTADO = Object.freeze({
  [ESTADO.PRESENTE]:    'der',
  [ESTADO.RETARDADO]:   'der',
  [ESTADO.AUSENTE]:     'izq',
  [ESTADO.JUSTIFICADO]: 'arriba',
});

export const requiereObservacion = (estado) =>
  estado === ESTADO.AUSENTE || estado === ESTADO.JUSTIFICADO;

/** Índice del primer alumno sin marcar, o -1 si todos tienen estado. */
export const primerSinMarcar = (registros) =>
  registros.findIndex(r => !r.estado);

const PARTICULAS = new Set(['de', 'del', 'la', 'las', 'los', 'y', 'e', 'da', 'do', 'dos', 'van', 'von']);

/**
 * Nombre para mostrar: si viene todo en MAYÚSCULAS (habitual en planillas)
 * pasa a "Tipo Título" con partículas en minúscula ("María de los Ángeles").
 * Nombres que ya traen minúsculas se respetan tal cual (p. ej. "McDonald").
 */
export function nombreLegible(nombre) {
  const limpio = (nombre || '').trim().replace(/\s+/g, ' ');
  if (!limpio || limpio !== limpio.toUpperCase() || limpio === limpio.toLowerCase()) return limpio;
  return limpio
    .toLowerCase()
    .split(' ')
    .map((palabra, i) => (i > 0 && PARTICULAS.has(palabra)
      ? palabra
      : palabra.replace(/(^|[-'’])(\p{L})/gu, (_, sep, letra) => sep + letra.toUpperCase())))
    .join(' ');
}

/** "María José Pérez" → "MJ"; tolera nombres vacíos o con espacios extra. */
export function iniciales(nombre) {
  const partes = (nombre || '').trim().split(/\s+/).filter(Boolean);
  if (!partes.length) return '?';
  return partes.slice(0, 2).map(p => p.charAt(0)).join('').toUpperCase();
}

export const prefiereMenosMovimiento = () =>
  typeof window !== 'undefined'
  && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;

/** Vibración corta de confirmación en móviles que la soportan. */
export function vibrar() {
  try { navigator.vibrate?.(10); } catch { /* algunos navegadores lanzan sin gesto previo */ }
}
