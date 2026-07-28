import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'react-toastify';
import { getMateriales, createMaterial, deleteMaterial } from '../api/academico.service';

export function useMateriales(materiaId) {
  const [materiales, setMateriales] = useState([]);
  const [loading, setLoading] = useState(true);

  const abortRef = useRef(null);
  useEffect(() => () => abortRef.current?.abort(), []);

  const fetchMateriales = useCallback(async () => {
    if (!materiaId) { setMateriales([]); setLoading(false); return; }
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    try {
      const res = await getMateriales(materiaId, controller.signal);
      if (controller.signal.aborted) return;
      setMateriales(res.data || []);
    } catch (err) {
      if (err.code === 'ERR_CANCELED' || controller.signal.aborted) return;
      toast.error('No se pudo cargar el material de estudio.');
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [materiaId]);

  useEffect(() => { fetchMateriales(); }, [fetchMateriales]);

  const publicarMaterial = useCallback(async (datos) => {
    try {
      const res = await createMaterial({ ...datos, materia_id: materiaId });
      setMateriales(prev => [res.data, ...prev]);
      toast.success('Material publicado correctamente.');
      return true;
    } catch (err) {
      const msg = err.response?.data?.error
        || err.response?.data?.titulo?.[0]
        || err.response?.data?.detail
        || 'No se pudo publicar el material.';
      toast.error(msg);
      return false;
    }
  }, [materiaId]);

  const eliminarMaterial = useCallback(async (id) => {
    try {
      await deleteMaterial(id);
      setMateriales(prev => prev.filter(m => m.id !== id));
      toast.success('Material eliminado.');
      return true;
    } catch {
      toast.error('No se pudo eliminar el material.');
      return false;
    }
  }, []);

  return { materiales, loading, publicarMaterial, eliminarMaterial, refetch: fetchMateriales };
}
