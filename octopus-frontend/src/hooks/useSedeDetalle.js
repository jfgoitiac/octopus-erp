import { useState, useCallback, useEffect, useRef } from 'react';
import { toast } from 'react-toastify';
import { getDashboardSede } from '../api/multisede.service';

export const useSedeDetalle = (sedeId) => {
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(false);
  const [data, setData]       = useState(null);
  const ctrlRef               = useRef(null);

  const cargar = useCallback(async () => {
    if (!sedeId) {
      toast.error('Sede no identificada');
      setLoading(false);
      return;
    }
    ctrlRef.current?.abort();
    const ctrl = new AbortController();
    ctrlRef.current = ctrl;

    setLoading(true);
    setError(false);
    try {
      const res = await getDashboardSede(sedeId, ctrl.signal);
      setData(res);
    } catch (err) {
      if (err.name === 'CanceledError' || err.code === 'ERR_CANCELED') return;
      setError(true);
      toast.error('Error al cargar los detalles de la sede');
    } finally {
      setLoading(false);
    }
  }, [sedeId]);

  useEffect(() => {
    cargar();
    return () => ctrlRef.current?.abort();
  }, [cargar]);

  return {
    loading,
    error,
    cargar,
    sede:            data?.sede              ?? {},
    metricas:        data?.metricas          ?? {},
    ultimosPagos:    data?.ultimos_pagos     ?? [],
    alumnosPorGrado: data?.alumnos_por_grado ?? [],
    morosos:         data?.morosos_detalle   ?? [],
  };
};
