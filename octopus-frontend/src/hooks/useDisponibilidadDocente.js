import { useState, useCallback, useEffect } from 'react';
import { toast } from 'react-toastify';
import {
  getDisponibilidadDocente, addDisponibilidadDocente, deleteDisponibilidadDocente,
} from '../api/academico.service';

// Franjas de disponibilidad semanal de un docente — usadas por el generador
// automático para no asignarle clases fuera de esas franjas.
export function useDisponibilidadDocente(docenteId) {
  const [disponibilidad, setDisponibilidad] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving]   = useState(false);

  const recargar = useCallback(() => {
    if (!docenteId) { setDisponibilidad([]); return; }
    const controller = new AbortController();
    setLoading(true);
    getDisponibilidadDocente(docenteId, controller.signal)
      .then(res => setDisponibilidad(res.data || []))
      .catch(err => {
        if (err.code === 'ERR_CANCELED') return;
        toast.error('No se pudo cargar la disponibilidad del docente.');
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [docenteId]);

  useEffect(() => recargar(), [recargar]);

  const agregar = useCallback(async (data) => {
    setSaving(true);
    try {
      await addDisponibilidadDocente(docenteId, data);
      toast.success('Franja de disponibilidad agregada.');
      recargar();
      return true;
    } catch (err) {
      const msg = err.response?.data?.error || 'Esa franja se solapa con otra ya registrada.';
      toast.error(msg);
      return false;
    } finally {
      setSaving(false);
    }
  }, [docenteId, recargar]);

  const eliminar = useCallback(async (dispId) => {
    setSaving(true);
    try {
      await deleteDisponibilidadDocente(docenteId, dispId);
      toast.success('Franja eliminada.');
      recargar();
      return true;
    } catch {
      toast.error('Error al eliminar la franja.');
      return false;
    } finally {
      setSaving(false);
    }
  }, [docenteId, recargar]);

  return { disponibilidad, loading, saving, recargar, agregar, eliminar };
}
