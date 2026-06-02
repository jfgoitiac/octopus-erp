import { useState, useCallback, useEffect, useRef } from 'react';
import { toast } from 'react-toastify';
import { getDashboardConsolidado } from '../api/multisede.service';
import { useSede } from '../context/SedeContext';

export const useMultiSedeDashboard = () => {
  const { setSedes } = useSede();
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(false);
  const [data, setData]       = useState(null);
  const ctrlRef               = useRef(null);

  const cargar = useCallback(async () => {
    ctrlRef.current?.abort();
    const ctrl = new AbortController();
    ctrlRef.current = ctrl;

    setLoading(true);
    setError(false);
    try {
      const res = await getDashboardConsolidado(ctrl.signal);
      setData(res);
      setSedes(res.sedes || []);
    } catch (err) {
      if (err.name === 'CanceledError' || err.code === 'ERR_CANCELED') return;
      setError(true);
      toast.error('Error al cargar el dashboard consolidado');
    } finally {
      setLoading(false);
    }
  }, [setSedes]);

  useEffect(() => {
    cargar();
    return () => ctrlRef.current?.abort();
  }, [cargar]);

  return {
    loading,
    error,
    cargar,
    totales: data?.totales ?? {},
    sedes:   data?.sedes   ?? [],
  };
};
