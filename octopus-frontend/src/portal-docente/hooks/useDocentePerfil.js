import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'react-toastify';
import { getMiPerfil, actualizarMiPerfil, subirFotoPerfil } from '../api/perfil.service';

export function useDocentePerfil() {
  const [perfil, setPerfil] = useState(null);
  const [loading, setLoading] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [subiendoFoto, setSubiendoFoto] = useState(false);

  const abortRef = useRef(null);
  useEffect(() => () => abortRef.current?.abort(), []);

  const fetchPerfil = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    try {
      const res = await getMiPerfil(controller.signal);
      if (controller.signal.aborted) return;
      setPerfil(res.data || null);
    } catch (err) {
      if (err.code === 'ERR_CANCELED' || controller.signal.aborted) return;
      toast.error('No se pudo cargar tu perfil.');
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => { fetchPerfil(); }, [fetchPerfil]);

  const guardarPerfil = useCallback(async (datos) => {
    setGuardando(true);
    try {
      const res = await actualizarMiPerfil(datos);
      setPerfil(res.data);
      toast.success('Perfil actualizado correctamente.');
      return true;
    } catch (err) {
      const msg = err.response?.data?.error || err.response?.data?.detail || 'Error al guardar el perfil.';
      toast.error(msg);
      return false;
    } finally {
      setGuardando(false);
    }
  }, []);

  const subirFoto = useCallback(async (file) => {
    setSubiendoFoto(true);
    try {
      const res = await subirFotoPerfil(file);
      setPerfil(res.data);
      toast.success('Foto de perfil actualizada.');
      return true;
    } catch (err) {
      const msg = err.response?.data?.error || err.response?.data?.detail || 'Error al subir la foto.';
      toast.error(msg);
      return false;
    } finally {
      setSubiendoFoto(false);
    }
  }, []);

  return { perfil, loading, guardando, subiendoFoto, guardarPerfil, subirFoto, refetch: fetchPerfil };
}
