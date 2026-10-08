import { ESTADO_A_BACKEND } from '../constants/asistencia';

/**
 * Control de versión de la asistencia, compartido por el panel (useAsistencia)
 * y el portal docente (useAsistenciaClase): ambos escriben el mismo registro.
 *
 * Cada fila viaja con el `actualizado_en` que se cargó del servidor. Si otra
 * persona la guardó entretanto, el backend rechaza todo con 409 y devuelve las
 * filas actuales en `conflictos`.
 */

/** Payload de POST /academico/asistencia/ con la versión de cada fila. */
export const aPayloadAsistencia = (registros) =>
  registros.map(r => ({
    alumno_id: r.alumno_id,
    estado: ESTADO_A_BACKEND[r.estado],
    observacion: r.observacion || '',
    actualizado_en: r.actualizado_en ?? null,
  }));

export const esConflictoAsistencia = (err) => err?.response?.status === 409;

/**
 * Tras guardar: adopta la versión nueva de cada fila (si no, el siguiente
 * guardado desde la misma pantalla chocaría consigo mismo).
 */
export function aplicarVersiones(registros, guardadas = []) {
  const versiones = new Map(guardadas.map(g => [g.alumno_id, g.actualizado_en]));
  return registros.map(r => (versiones.has(r.alumno_id) ? { ...r, actualizado_en: versiones.get(r.alumno_id) } : r));
}

/**
 * Tras un 409: las filas en conflicto toman la versión del servidor (gana el
 * cambio ajeno, que es el más reciente); el resto conserva lo marcado aquí.
 * `normalizar` convierte una fila del backend al formato de la UI.
 */
export function aplicarConflictos(registros, conflictos = [], normalizar) {
  const porAlumno = new Map(conflictos.map(c => [c.alumno_id, normalizar(c)]));
  return registros.map(r => (porAlumno.has(r.alumno_id) ? { ...r, ...porAlumno.get(r.alumno_id) } : r));
}
