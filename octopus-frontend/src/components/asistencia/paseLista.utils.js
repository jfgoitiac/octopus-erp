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
