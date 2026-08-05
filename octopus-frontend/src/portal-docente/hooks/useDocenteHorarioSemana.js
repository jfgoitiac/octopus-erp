import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'react-toastify';
import { getMiHorario } from '../api/academico.service';

export function useDocenteHorarioSemana(limite = 5) {
  const [proximasClases, setProximasClases] = useState([]);
  const [loading, setLoading] = useState(true);

  const abortRef = useRef(null);
  useEffect(() => () => abortRef.current?.abort(), []);

  const fetchHorario = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    try {
      const res = await getMiHorario(limite, controller.signal);
      if (controller.signal.aborted) return;
      setProximasClases(res.data || []);
    } catch (err) {
      if (err.code === 'ERR_CANCELED' || controller.signal.aborted) return;
      toast.error('No se pudo cargar tu horario.');
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [limite]);

  useEffect(() => { fetchHorario(); }, [fetchHorario]);

  return { proximasClases, loading, refetch: fetchHorario };
}
