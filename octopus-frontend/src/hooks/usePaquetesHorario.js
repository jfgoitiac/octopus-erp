import { useState, useCallback, useEffect, useRef } from 'react';
import { toast } from 'react-toastify';
import {
  getPaquetesHorario, createPaqueteHorario, updatePaqueteHorario, deletePaqueteHorario,
  publicarPaqueteHorario,
  getGradosPaquete, addGradoPaquete, removeGradoPaquete,
  getBloquesPaquete, addBloquePaquete, updateBloquePaquete, deleteBloquePaquete,
} from '../api/academico.service';

// CRUD de paquetes de horario (jornadas por sede/periodo) + sus grados y bloques.
// Mismo patrón de loading/saving/error-via-toast que useHorarios.js.
// `sedeId` es un filtro opcional (primitivo, no objeto) para no depender de
// una referencia inestable en el arreglo de dependencias del useCallback.
export function usePaquetesHorario(sedeId) {
  const [paquetes, setPaquetes] = useState([]);
  const [loading, setLoading]   = useState(false);
  const [saving, setSaving]     = useState(false);

  const abortRef = useRef(null);
  useEffect(() => () => { abortRef.current?.abort(); }, []);

  const recargar = useCallback(() => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const { signal } = controller;

    setLoading(true);
    getPaquetesHorario(sedeId ? { sede: sedeId } : undefined, signal)
      .then(res => { if (!signal.aborted) setPaquetes(res.data || []); })
      .catch(err => {
        if (err.code === 'ERR_CANCELED' || signal.aborted) return;
        toast.error('No se pudieron cargar los paquetes de horario.');
      })
      .finally(() => { if (!signal.aborted) setLoading(false); });
  }, [sedeId]);

  useEffect(() => { recargar(); }, [recargar]);

  const crear = useCallback(async (data) => {
    setSaving(true);
    try {
      const res = await createPaqueteHorario(data);
      toast.success('Paquete de horario creado.');
      recargar();
      return { ok: true, data: res.data };
    } catch (err) {
      const msg = err.response?.data?.error || err.response?.data?.nombre?.[0] || 'Error al crear el paquete.';
      toast.error(msg);
      return { ok: false };
    } finally {
      setSaving(false);
    }
  }, [recargar]);

  const actualizar = useCallback(async (id, data) => {
    setSaving(true);
    try {
      await updatePaqueteHorario(id, data);
      toast.success('Paquete actualizado.');
      recargar();
      return true;
    } catch (err) {
      const msg = err.response?.data?.error || 'Error al actualizar el paquete.';
      toast.error(msg);
      return false;
    } finally {
      setSaving(false);
    }
  }, [recargar]);

  const eliminar = useCallback(async (id) => {
    setSaving(true);
    try {
      await deletePaqueteHorario(id);
      toast.success('Paquete eliminado.');
      recargar();
      return true;
    } catch (err) {
      const msg = err.response?.data?.error || 'Error al eliminar el paquete.';
      toast.error(msg);
      return false;
    } finally {
      setSaving(false);
    }
  }, [recargar]);

  const publicar = useCallback(async (id) => {
    setSaving(true);
    try {
      await publicarPaqueteHorario(id);
      toast.success('Paquete publicado.');
      recargar();
      return true;
    } catch (err) {
      const msg = err.response?.data?.error || 'No se pudo publicar: verifica que tenga grados y bloques definidos.';
      toast.error(msg);
      return false;
    } finally {
      setSaving(false);
    }
  }, [recargar]);

  const agregarGrado = useCallback(async (paqueteId, gradoSeccion) => {
    setSaving(true);
    try {
      await addGradoPaquete(paqueteId, gradoSeccion);
      toast.success('Grado agregado al paquete.');
      recargar();
      return true;
    } catch (err) {
      const msg = err.response?.data?.error || 'Ese grado ya pertenece a otro paquete de este periodo.';
      toast.error(msg);
      return false;
    } finally {
      setSaving(false);
    }
  }, [recargar]);

  const quitarGrado = useCallback(async (paqueteId, gradoPk) => {
    setSaving(true);
    try {
      await removeGradoPaquete(paqueteId, gradoPk);
      toast.success('Grado quitado del paquete.');
      recargar();
      return true;
    } catch {
      toast.error('Error al quitar el grado del paquete.');
      return false;
    } finally {
      setSaving(false);
    }
  }, [recargar]);

  return {
    paquetes, loading, saving, recargar,
    crear, actualizar, eliminar, publicar,
    agregarGrado, quitarGrado,
  };
}

// Grados de un paquete específico (usado en la pantalla de detalle de paquete)
export function useGradosPaquete(paqueteId) {
  const [grados, setGrados] = useState([]);
  const [loading, setLoading] = useState(false);

  const recargar = useCallback(() => {
    if (!paqueteId) { setGrados([]); return; }
    const controller = new AbortController();
    setLoading(true);
    getGradosPaquete(paqueteId, controller.signal)
      .then(res => setGrados(res.data || []))
      .catch(err => {
        if (err.code === 'ERR_CANCELED') return;
        toast.error('No se pudieron cargar los grados del paquete.');
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [paqueteId]);

  useEffect(() => recargar(), [recargar]);

  return { grados, loading, recargar };
}

// Bloques (jornada horaria) de un paquete específico
export function useBloquesPaquete(paqueteId) {
  const [bloques, setBloques] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving]   = useState(false);

  const recargar = useCallback(() => {
    if (!paqueteId) { setBloques([]); return; }
    const controller = new AbortController();
    setLoading(true);
    getBloquesPaquete(paqueteId, controller.signal)
      .then(res => setBloques(res.data || []))
      .catch(err => {
        if (err.code === 'ERR_CANCELED') return;
        toast.error('No se pudieron cargar los bloques de la jornada.');
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [paqueteId]);

  useEffect(() => recargar(), [recargar]);

  const crear = useCallback(async (data) => {
    setSaving(true);
    try {
      await addBloquePaquete(paqueteId, data);
      toast.success('Bloque agregado.');
      recargar();
      return true;
    } catch (err) {
      const msg = err.response?.data?.error || 'Error al agregar el bloque.';
      toast.error(msg);
      return false;
    } finally {
      setSaving(false);
    }
  }, [paqueteId, recargar]);

  const actualizar = useCallback(async (bloqueId, data) => {
    setSaving(true);
    try {
      await updateBloquePaquete(paqueteId, bloqueId, data);
      toast.success('Bloque actualizado.');
      recargar();
      return true;
    } catch (err) {
      const msg = err.response?.data?.error || 'Error al actualizar el bloque.';
      toast.error(msg);
      return false;
    } finally {
      setSaving(false);
    }
  }, [paqueteId, recargar]);

  const eliminar = useCallback(async (bloqueId) => {
    setSaving(true);
    try {
      await deleteBloquePaquete(paqueteId, bloqueId);
      toast.success('Bloque eliminado.');
      recargar();
      return true;
    } catch (err) {
      const msg = err.response?.data?.error || 'Error al eliminar el bloque.';
      toast.error(msg);
      return false;
    } finally {
      setSaving(false);
    }
  }, [paqueteId, recargar]);

  return { bloques, loading, saving, recargar, crear, actualizar, eliminar };
}
