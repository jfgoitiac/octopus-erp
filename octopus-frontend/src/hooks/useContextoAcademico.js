import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'react-toastify';
import { SedeContext } from '../context/SedeContext';
import { getPeriodosEscolares } from '../api/academico.service';

export function useContextoAcademico() {
  const sede = useContext(SedeContext);
  const sedeId = sede?.sedeActiva?.id || '';
  const [periodos, setPeriodos] = useState([]);
  const [periodoId, setPeriodoId] = useState('');
  const [loadingPeriodos, setLoadingPeriodos] = useState(false);
  const abortRef = useRef(null);

  const cargarPeriodos = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoadingPeriodos(true);
    try {
      const respuesta = await getPeriodosEscolares(sedeId ? { sede: sedeId } : {}, controller.signal);
      if (controller.signal.aborted) return;
      const lista = respuesta.data?.results || respuesta.data || [];
      setPeriodos(lista);
      setPeriodoId(actual => {
        if (lista.some(periodo => String(periodo.id) === String(actual))) return actual;
        const activo = lista.find(periodo => periodo.estado === 'activo');
        return String(activo?.id || lista[0]?.id || '');
      });
    } catch (error) {
      if (error.code !== 'ERR_CANCELED' && !controller.signal.aborted) {
        setPeriodos([]);
        setPeriodoId('');
        toast.error('No se pudieron cargar los períodos escolares.');
      }
    } finally {
      if (!controller.signal.aborted) setLoadingPeriodos(false);
    }
  }, [sedeId]);

  useEffect(() => {
    cargarPeriodos();
    return () => abortRef.current?.abort();
  }, [cargarPeriodos]);

  const periodo = useMemo(
    () => periodos.find(item => String(item.id) === String(periodoId)) || null,
    [periodos, periodoId],
  );

  const filtrosGrado = useMemo(() => ({
    ...(periodoId ? { periodo_id: periodoId } : {}),
    ...(sedeId ? { sede: sedeId } : {}),
    activo: 'true',
  }), [periodoId, sedeId]);

  return {
    sedeId,
    periodos,
    periodo,
    periodoId,
    setPeriodoId,
    loadingPeriodos,
    filtrosGrado,
    recargarPeriodos: cargarPeriodos,
  };
}
