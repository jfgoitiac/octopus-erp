import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { getComprobantes } from '../api/portal.service';

/**
 * Comprobantes enviados desde el portal y su estado de revisión.
 *
 * `ultimoPorMensualidad` resuelve, para cada mensualidad, el comprobante más
 * reciente: con él el inicio marca "En revisión" (y no ofrece pagar de nuevo,
 * que el backend rechazaría con 409) o "Rechazado" con el motivo del revisor.
 * Un fallo de esta consulta no bloquea el inicio: se muestra sin estados.
 */
export function useComprobantesPortal() {
  const [comprobantes, setComprobantes] = useState([]);
  const [loading, setLoading] = useState(true);
  const abortRef = useRef(null);

  const cargar = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const res = await getComprobantes(controller.signal);
      if (!controller.signal.aborted) setComprobantes(res.data || []);
    } catch {
      // Fallo silencioso: el estado de los comprobantes es complementario.
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    cargar();
    return () => abortRef.current?.abort();
  }, [cargar]);

  const ultimoPorMensualidad = useMemo(() => {
    const mapa = {};
    // El backend ordena por fecha de subida descendente: el primero que
    // aparece para cada mensualidad es el más reciente.
    comprobantes.forEach((c) => {
      if (!(c.mensualidad in mapa)) mapa[c.mensualidad] = c;
    });
    return mapa;
  }, [comprobantes]);

  return { comprobantes, ultimoPorMensualidad, loading, recargar: cargar };
}
