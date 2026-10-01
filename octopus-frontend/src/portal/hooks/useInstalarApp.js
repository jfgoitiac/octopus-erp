import { useCallback, useEffect, useState } from 'react';
import {
  suscribirInstalacion,
  hayEventoInstalacion,
  lanzarInstalacion,
  estaEnModoApp,
  esIOS,
  fueDescartadoRecientemente,
  marcarDescartado,
} from '../utils/instalarApp';

/**
 * Estado de "instalar el portal como app".
 * - `puedeInstalar`: el navegador ofrece instalación nativa (Android/Chrome) o
 *   es iOS (instalación manual con instrucciones) y aún no está instalada.
 * - `mostrarBanner`: igual que lo anterior, salvo que el usuario lo haya
 *   cerrado en los últimos días.
 */
export default function useInstalarApp() {
  const [, forzar] = useState(0);
  const [descartado, setDescartado] = useState(fueDescartadoRecientemente);

  useEffect(() => suscribirInstalacion(() => forzar((n) => n + 1)), []);

  const modoApp = estaEnModoApp();
  const ios = esIOS();
  const nativo = hayEventoInstalacion();
  const puedeInstalar = !modoApp && (nativo || ios);

  const instalar = useCallback(() => lanzarInstalacion(), []);

  const descartar = useCallback(() => {
    marcarDescartado();
    setDescartado(true);
  }, []);

  return {
    puedeInstalar,
    mostrarBanner: puedeInstalar && !descartado,
    esIOS: ios && !nativo,
    instalar,
    descartar,
  };
}
