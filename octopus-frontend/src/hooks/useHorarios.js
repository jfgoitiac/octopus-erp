import { useState, useCallback, useEffect, useRef } from 'react';
import { toast } from 'react-toastify';
import {
  getMaterias, getHorarios,
  saveHorario, updateHorario, deleteHorario,
  generarHorario,
} from '../api/academico.service';
import { DIA_MAP } from '../constants/horarios';

export function useHorarios() {
  const [grado, setGrado]         = useState('');
  const [horarios, setHorarios]   = useState([]);
  const [materias, setMaterias]   = useState([]);
  const [loading, setLoading]     = useState(false);
  const [saving, setSaving]       = useState(false);
  const [generando, setGenerando] = useState(false);
  const abortRef = useRef(null);

  // Cancelar cualquier petición en vuelo al desmontar
  useEffect(() => () => { abortRef.current?.abort(); }, []);

  const recargar = useCallback(() => {
    if (!grado) { setHorarios([]); setMaterias([]); return; }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const { signal } = controller;

    setLoading(true);
    Promise.all([getHorarios(grado, signal), getMaterias(grado, signal)])
      .then(([resH, resM]) => {
        if (signal.aborted) return;
        setHorarios(resH.data || []);
        setMaterias(resM.data || []);
      })
      .catch(err => {
        if (err.code === 'ERR_CANCELED' || signal.aborted) return;
        toast.error('No se pudo cargar el horario.');
      })
      .finally(() => { if (!signal.aborted) setLoading(false); });
  }, [grado]);

  useEffect(() => { recargar(); }, [recargar]);

  const getClaseEnCelda = useCallback((dia, hora) => {
    const diaNum = DIA_MAP[dia];
    return horarios.find(h => h.dia_semana === diaNum && h.hora_inicio === hora) ?? null;
  }, [horarios]);

  const guardar = useCallback(async (form) => {
    if (form.hora_inicio >= form.hora_fin) {
      toast.warning('La hora de fin debe ser posterior a la de inicio.');
      return false;
    }
    setSaving(true);
    try {
      const payload = {
        grado_seccion: grado,
        materia_id:    form.materia_id,
        dia_semana:    parseInt(form.dia_semana, 10),
        hora_inicio:   form.hora_inicio,
        hora_fin:      form.hora_fin,
        aula:          form.aula,
      };
      if (form.id) {
        await updateHorario(form.id, payload);
        toast.success('Clase actualizada.');
      } else {
        await saveHorario(payload);
        toast.success('Clase agregada al horario.');
      }
      recargar();
      return true;
    } catch (err) {
      const msg = err.response?.data?.error || err.response?.data?.detail || 'Error al guardar la clase.';
      toast.error(msg);
      return false;
    } finally {
      setSaving(false);
    }
  }, [grado, recargar]);

  const eliminar = useCallback(async (id) => {
    setSaving(true);
    try {
      await deleteHorario(id);
      toast.success('Clase eliminada.');
      recargar();
      return true;
    } catch {
      toast.error('Error al eliminar la clase.');
      return false;
    } finally {
      setSaving(false);
    }
  }, [recargar]);

  const generar = useCallback(async (config) => {
    setGenerando(true);
    try {
      const res = await generarHorario({ ...config, grado_seccion: grado });
      return { ok: true, data: res.data };
    } catch (err) {
      const msg = err.response?.data?.error || 'Error al generar el horario.';
      toast.error(msg);
      return { ok: false };
    } finally {
      setGenerando(false);
    }
  }, [grado]);

  return {
    grado, setGrado,
    horarios, materias,
    loading, saving, generando,
    getClaseEnCelda,
    guardar, eliminar, generar, recargar,
  };
}
