import { useState, useCallback, useEffect, useRef } from 'react';
import { toast } from 'react-toastify';
import { getMaterias, getNotasGrado, saveNotas } from '../api/academico.service';
import { calcDefinitiva } from '../utils/notas.utils';

export function useNotas() {
  const [grado, setGrado] = useState('');
  const [materias, setMaterias] = useState([]);
  const [materiaId, setMateriaId] = useState('');
  const [lapsoId, setLapsoId] = useState('');
  const [notas, setNotas] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingCombos, setLoadingCombos] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const abortRef = useRef(null);
  useEffect(() => () => { abortRef.current?.abort(); }, []);

  useEffect(() => {
    if (!grado) { setMaterias([]); setMateriaId(''); return; }
    setLoadingCombos(true);
    getMaterias(grado)
      .then(res => { setMaterias(res.data || []); setMateriaId(''); })
      .catch(() => toast.error('No se pudieron cargar las materias.'))
      .finally(() => setLoadingCombos(false));
  }, [grado]);

  useEffect(() => {
    if (!materiaId || !lapsoId) { setNotas([]); return; }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setDirty(false);
    getNotasGrado(materiaId, lapsoId, controller.signal)
      .then(res => {
        if (controller.signal.aborted) return;
        setNotas(res.data || []);
      })
      .catch(err => {
        if (err.code === 'ERR_CANCELED' || controller.signal.aborted) return;
        toast.error('No se pudieron cargar las notas.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
  }, [materiaId, lapsoId]);

  const cambiarGrado = useCallback((nuevoGrado) => {
    if (dirty) {
      toast.warning('Guarda o descarta las notas antes de cambiar el grado.');
      return;
    }
    setGrado(nuevoGrado);
  }, [dirty]);

  const cambiarMateria = useCallback((nuevoId) => {
    if (dirty) {
      toast.warning('Guarda o descarta las notas antes de cambiar la materia.');
      return;
    }
    setMateriaId(nuevoId);
  }, [dirty]);

  const cambiarLapso = useCallback((nuevoId) => {
    if (dirty) {
      toast.warning('Guarda o descarta las notas antes de cambiar el lapso.');
      return;
    }
    setLapsoId(nuevoId);
  }, [dirty]);

  // Para resets forzados (ej: después de cerrar un lapso desde el modal)
  const resetLapso = useCallback(() => {
    setLapsoId('');
    setNotas([]);
    setDirty(false);
  }, []);

  const handleNotaChange = useCallback((alumnoId, campo, valor) => {
    const num = parseFloat(valor);
    if (valor !== '' && (isNaN(num) || num < 0 || num > 20)) {
      toast.warning('La nota debe estar entre 0 y 20.');
      return;
    }
    setDirty(true);
    setNotas(prev => prev.map(n => {
      if (n.alumno_id !== alumnoId) return n;
      const updated = { ...n, [campo]: valor };
      updated.definitiva = calcDefinitiva(updated);
      updated.aprobado = updated.definitiva !== '' ? parseFloat(updated.definitiva) >= 10 : null;
      return updated;
    }));
  }, []);

  const guardar = useCallback(async () => {
    if (!materiaId || !lapsoId) { toast.warning('Selecciona materia y lapso.'); return; }
    setSaving(true);
    try {
      await saveNotas(materiaId, lapsoId, notas);
      toast.success('Notas guardadas correctamente.');
      setDirty(false);
    } catch (err) {
      const msg = err.response?.data?.error || err.response?.data?.detail || 'Error al guardar notas.';
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }, [materiaId, lapsoId, notas]);

  return {
    grado,
    materias,
    materiaId,
    lapsoId,
    notas,
    loading,
    loadingCombos,
    saving,
    dirty,
    cambiarGrado,
    cambiarMateria,
    cambiarLapso,
    resetLapso,
    handleNotaChange,
    guardar,
  };
}
