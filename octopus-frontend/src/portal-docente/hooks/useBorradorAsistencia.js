import { useCallback, useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { borradorDifiere, borrarBorrador, escribirBorrador, leerBorrador } from '../utils/asistenciaLocal';

/**
 * Borrador local del pase de asistencia (por sección y fecha).
 *
 * - Mientras hay cambios sin guardar, se escribe en localStorage.
 * - Al cargar la asistencia sin cambios propios, si hay un borrador distinto
 *   a lo del servidor se ofrece recuperarlo (`pendiente`).
 * - `limpiar()` se llama al guardar con éxito o al descartar a propósito.
 *
 * `onAplicar(cambios)` recibe [{ alumno_id, estado, observacion }].
 */
export function useBorradorAsistencia({ gradoSeccion, fecha, registros, dirty, loading, onAplicar }) {
  const fechaStr = fecha ? format(fecha, 'yyyy-MM-dd') : null;
  const clave = gradoSeccion && fechaStr ? `${gradoSeccion}:${fechaStr}` : null;
  // Clave cuyo aviso ya se resolvió (recuperado o descartado) en esta visita.
  const [resuelto, setResuelto] = useState(null);

  useEffect(() => {
    if (dirty && clave && registros.length) escribirBorrador(gradoSeccion, fechaStr, registros);
  }, [dirty, clave, gradoSeccion, fechaStr, registros]);

  const pendiente = useMemo(() => {
    if (!clave || dirty || loading || resuelto === clave || !registros.length) return null;
    const borrador = leerBorrador(gradoSeccion, fechaStr);
    return borrador && borradorDifiere(borrador, registros) ? borrador : null;
  }, [clave, dirty, loading, resuelto, registros, gradoSeccion, fechaStr]);

  const recuperar = useCallback(() => {
    if (!pendiente) return;
    onAplicar(pendiente.registros);
    setResuelto(clave);
  }, [pendiente, onAplicar, clave]);

  const limpiar = useCallback(() => {
    if (!clave) return;
    borrarBorrador(gradoSeccion, fechaStr);
    setResuelto(clave);
  }, [clave, gradoSeccion, fechaStr]);

  return { pendiente, recuperar, descartar: limpiar, limpiar };
}
