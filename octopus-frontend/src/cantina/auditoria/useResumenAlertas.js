import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { getResumenAlertas } from './api/auditoriaApi';
import { EVENTO_ALERTAS_CAMBIADAS } from './components/AlertaEventos';

// Contador de alertas abiertas de la Auditoría de Cantina (§6 GET
// alertas/resumen/), para los menús del panel y de la cantina. Solo pide
// datos si `activo` (rol director): para el resto de roles no hace ninguna
// llamada. Se refresca al navegar y cuando la bandeja avisa que se atendió
// una alerta. Si falla, devuelve 0 sin toast (es informativo).
export default function useResumenAlertas(activo) {
  const { pathname } = useLocation();
  const [resumen, setResumen] = useState(null);

  useEffect(() => {
    if (!activo) return undefined;
    let controller = new AbortController();
    const cargar = () => {
      controller.abort();
      controller = new AbortController();
      getResumenAlertas(controller.signal)
        .then((res) => setResumen(res.data ?? null))
        .catch(() => { /* informativo: sin toast si falla */ });
    };
    cargar();
    window.addEventListener(EVENTO_ALERTAS_CAMBIADAS, cargar);
    return () => {
      controller.abort();
      window.removeEventListener(EVENTO_ALERTAS_CAMBIADAS, cargar);
    };
  }, [activo, pathname]);

  return {
    abiertas: activo ? Number(resumen?.abiertas ?? 0) : 0,
    hayCriticas: activo && Number(resumen?.por_severidad?.critica ?? 0) > 0,
  };
}
