import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { toast } from 'react-toastify';
import {
  getMaterias, getHorarios,
  saveHorario, updateHorario, deleteHorario,
  generarHorario, deshacerGenerarHorario,
  createMateria, updateMateria, deleteMateria,
  getBloquesPaquete,
} from '../api/academico.service';

// Opera sobre un paquete de horario (jornada) + un grado dentro de ese
// paquete. La grilla ya no usa horas fijas de 1h (buildHoraBlocks) — las
// filas salen de los BloqueHorario reales del paquete.
export function useHorarios(paqueteId, grado) {
  const [bloques, setBloques]     = useState([]);
  const [horarios, setHorarios]   = useState([]);
  const [materias, setMaterias]   = useState([]);
  const [loading, setLoading]     = useState(false);
  const [saving, setSaving]             = useState(false);
  const [savingMateria, setSavingMateria] = useState(false);
  const [generando, setGenerando]       = useState(false);

  const abortRef = useRef(null);

  // Cancelar cualquier petición en vuelo al desmontar
  useEffect(() => () => { abortRef.current?.abort(); }, []);

  const recargar = useCallback(() => {
    if (!paqueteId || !grado) { setBloques([]); setHorarios([]); setMaterias([]); return; }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const { signal } = controller;

    setLoading(true);
    Promise.all([
      getBloquesPaquete(paqueteId, signal),
      getHorarios(paqueteId, grado, signal),
      getMaterias(grado, signal),
    ])
      .then(([resB, resH, resM]) => {
        if (signal.aborted) return;
        setBloques(resB.data || []);
        setHorarios(resH.data || []);
        setMaterias(resM.data || []);
      })
      .catch(err => {
        if (err.code === 'ERR_CANCELED' || signal.aborted) return;
        toast.error('No se pudo cargar el horario.');
      })
      .finally(() => { if (!signal.aborted) setLoading(false); });
  }, [paqueteId, grado]);

  useEffect(() => { recargar(); }, [recargar]);

  // Índice rápido: bloque_id -> clase asignada en ese bloque
  const claseEnBloque = useMemo(() => {
    const map = new Map();
    horarios.forEach(h => { if (h.bloque_id != null) map.set(h.bloque_id, h); });
    return map;
  }, [horarios]);

  const getClaseEnBloque = useCallback((bloqueId) => claseEnBloque.get(bloqueId) ?? null, [claseEnBloque]);

  // Conflicto: otro horario ya ocupa ese bloque (ignorando el que se edita).
  // Solo feedback rápido en cliente — el backend es la fuente de verdad para
  // choques entre grados/docentes/aulas.
  const tieneConflicto = useCallback((form) => {
    if (!form.bloque_id) return false;
    const existente = claseEnBloque.get(form.bloque_id);
    return !!existente && existente.id !== form.id;
  }, [claseEnBloque]);

  const guardar = useCallback(async (form) => {
    setSaving(true);
    try {
      const payload = {
        grado_seccion: grado,
        materia_id:    form.materia_id,
        dia_semana:    form.dia_semana,
        bloque_id:     form.bloque_id,
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
    } catch (err) {
      const msg = err.response?.data?.error || err.response?.data?.detail || 'Error al eliminar la clase.';
      toast.error(msg);
      return false;
    } finally {
      setSaving(false);
    }
  }, [recargar]);

  // Pinear/despinear una clase — el generador automático respeta las clases
  // pineado=true y no las mueve. Reemplaza el antiguo Set local `lockedIds`:
  // ahora el estado vive en el backend (persiste entre sesiones y lo usa el
  // generador vía HorarioClase.pineado, no un array aparte en el payload).
  const pinear = useCallback(async (id, pineado) => {
    try {
      await updateHorario(id, { pineado });
      setHorarios(prev => prev.map(h => h.id === id ? { ...h, pineado } : h));
      return true;
    } catch {
      toast.error('No se pudo actualizar el bloqueo de la clase.');
      return false;
    }
  }, []);

  const crearMateria = useCallback(async (form) => {
    setSavingMateria(true);
    try {
      await createMateria({ ...form, grado_seccion: grado });
      toast.success('Materia agregada.');
      recargar();
      return true;
    } catch (err) {
      const msg = err.response?.data?.error || err.response?.data?.nombre?.[0] || 'Error al crear la materia.';
      toast.error(msg);
      return false;
    } finally {
      setSavingMateria(false);
    }
  }, [grado, recargar]);

  const actualizarMateria = useCallback(async (form) => {
    setSavingMateria(true);
    try {
      await updateMateria(form.id, {
        nombre: form.nombre,
        grado_seccion: form.grado_seccion,
        horas_academicas: form.horas_academicas,
        tipo_evaluacion: form.tipo_evaluacion,
        cuenta_para_promedio: form.cuenta_para_promedio,
        aporta_a_todas_las_materias: form.aporta_a_todas_las_materias,
        docente_id: form.docente_id,
      });
      toast.success('Materia actualizada.');
      recargar();
      return true;
    } catch (err) {
      const msg = err.response?.data?.error || err.response?.data?.nombre?.[0] || 'Error al actualizar la materia.';
      toast.error(msg);
      return false;
    } finally {
      setSavingMateria(false);
    }
  }, [recargar]);

  const eliminarMateria = useCallback(async (id) => {
    setSavingMateria(true);
    try {
      await deleteMateria(id);
      toast.success('Materia desactivada.');
      recargar();
      return true;
    } catch (err) {
      const msg = err.response?.data?.error || 'Error al eliminar la materia.';
      toast.error(msg);
      return false;
    } finally {
      setSavingMateria(false);
    }
  }, [recargar]);

  const generar = useCallback(async (config) => {
    setGenerando(true);
    try {
      const res = await generarHorario({ ...config, paquete_id: paqueteId });
      recargar();
      return { ok: true, data: res.data };
    } catch (err) {
      if (err.response?.status === 409) {
        toast.warning(err.response?.data?.error || 'Ya existe un horario generado para este paquete.');
      } else {
        toast.error(err.response?.data?.error || 'Error al generar el horario.');
      }
      return { ok: false };
    } finally {
      setGenerando(false);
    }
  }, [paqueteId, recargar]);

  const deshacerGeneracion = useCallback(async () => {
    setGenerando(true);
    try {
      await deshacerGenerarHorario(paqueteId);
      toast.success('Generación deshecha.');
      recargar();
      return true;
    } catch {
      toast.error('No se pudo deshacer la generación.');
      return false;
    } finally {
      setGenerando(false);
    }
  }, [paqueteId, recargar]);

  return {
    bloques, horarios, materias,
    loading, saving, savingMateria, generando,
    getClaseEnBloque,
    tieneConflicto,
    guardar, eliminar, pinear, generar, deshacerGeneracion, recargar,
    crearMateria, actualizarMateria, eliminarMateria,
  };
}
