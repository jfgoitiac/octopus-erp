import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'react-toastify';
import { createMateria, deleteMateria, getMaterias, updateMateria } from '../api/academico.service';

export function useMaterias() {
  const [materias, setMaterias] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const abortRef = useRef(null);

  const cargar = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const { signal } = controller;

    setLoading(true);
    try {
      const response = await getMaterias(undefined, signal);
      if (signal.aborted) return;
      setMaterias(response.data || []);
    } catch (err) {
      if (err.code === 'ERR_CANCELED' || signal.aborted) return;
      toast.error('No se pudieron cargar las materias.');
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void (async () => { await cargar(); })();
    return () => { abortRef.current?.abort(); };
  }, [cargar]);

  const crear = useCallback(async (form) => {
    setSaving(true);
    try {
      await createMateria(form);
      toast.success('Materia agregada correctamente.');
      await cargar();
      return true;
    } catch (error) {
      const message = error.response?.data?.error || error.response?.data?.nombre?.[0] || 'Error al crear la materia.';
      toast.error(message);
      return false;
    } finally {
      setSaving(false);
    }
  }, [cargar]);

  const actualizar = useCallback(async (form) => {
    setSaving(true);
    try {
      await updateMateria(form.id, form);
      toast.success('Materia actualizada correctamente.');
      await cargar();
      return true;
    } catch (error) {
      const message = error.response?.data?.error || error.response?.data?.nombre?.[0] || 'Error al actualizar la materia.';
      toast.error(message);
      return false;
    } finally {
      setSaving(false);
    }
  }, [cargar]);

  const eliminar = useCallback(async (id) => {
    setSaving(true);
    try {
      await deleteMateria(id);
      toast.success('Materia desactivada.');
      await cargar();
      return true;
    } catch (error) {
      toast.error(error.response?.data?.error || 'Error al desactivar la materia.');
      return false;
    } finally {
      setSaving(false);
    }
  }, [cargar]);

  return { materias, loading, saving, crear, actualizar, eliminar };
}
