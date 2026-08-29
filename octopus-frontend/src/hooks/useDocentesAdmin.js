import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'react-toastify';
import {
  actualizarDocente,
  asignarMateriasDocente,
  crearDocente,
  eliminarDocente,
  listarDocentes,
} from '../api/academico.service';

export function useDocentesAdmin() {
  const [docentes, setDocentes] = useState([]);
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
      const response = await listarDocentes(undefined, signal);
      if (signal.aborted) return;
      setDocentes(response.data || []);
    } catch (err) {
      if (err.code === 'ERR_CANCELED' || signal.aborted) return;
      toast.error('No se pudieron cargar los docentes.');
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
      await crearDocente(form);
      toast.success('Docente agregado correctamente.');
      await cargar();
      return true;
    } catch (error) {
      const message = error.response?.data?.error || error.response?.data?.user?.[0] || 'Error al crear el docente.';
      toast.error(message);
      return false;
    } finally {
      setSaving(false);
    }
  }, [cargar]);

  const actualizar = useCallback(async (form) => {
    setSaving(true);
    try {
      await actualizarDocente(form.id, form);
      toast.success('Docente actualizado correctamente.');
      await cargar();
      return true;
    } catch (error) {
      const message = error.response?.data?.error || 'Error al actualizar el docente.';
      toast.error(message);
      return false;
    } finally {
      setSaving(false);
    }
  }, [cargar]);

  const eliminar = useCallback(async (id) => {
    setSaving(true);
    try {
      await eliminarDocente(id);
      toast.success('Docente desactivado.');
      await cargar();
      return true;
    } catch (error) {
      toast.error(error.response?.data?.error || 'Error al desactivar el docente.');
      return false;
    } finally {
      setSaving(false);
    }
  }, [cargar]);

  const asignarMaterias = useCallback(async (id, materiaIds) => {
    setSaving(true);
    try {
      await asignarMateriasDocente(id, materiaIds);
      toast.success('Materias asignadas correctamente.');
      await cargar();
      return true;
    } catch (error) {
      toast.error(error.response?.data?.error || 'Error al asignar las materias.');
      return false;
    } finally {
      setSaving(false);
    }
  }, [cargar]);

  return { docentes, loading, saving, crear, actualizar, eliminar, asignarMaterias };
}
