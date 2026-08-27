import { useState, useCallback, useEffect, useRef } from 'react';
import { toast } from 'react-toastify';
import { getMaterias, getMisMaterias, getNotasGrado, saveNotas } from '../api/academico.service';
import { calcDefinitiva } from '../utils/notas.utils';

export function useNotas(esDocente = false) {
  const [grado, setGrado] = useState('');
  const [materias, setMaterias] = useState([]);
  const [materiaId, setMateriaId] = useState('');
  const [lapsoId, setLapsoId] = useState('');
  const [notas, setNotas] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingCombos, setLoadingCombos] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [pendingFiltro, setPendingFiltro] = useState(null); // { tipo: 'grado'|'materia'|'lapso', valor }

  const abortRef = useRef(null);
  useEffect(() => () => { abortRef.current?.abort(); }, []);

  // Docente: no hay selector de Grado -- se listan directo sus propias
  // materias (GET /academico/docente/mis-materias/).
  useEffect(() => {
    if (!esDocente) return;
    setLoadingCombos(true);
    getMisMaterias()
      .then(res => setMaterias(res.data || []))
      .catch(() => toast.error('No se pudieron cargar tus materias.'))
      .finally(() => setLoadingCombos(false));
  }, [esDocente]);

  // Secretaria/director: selector de Grado filtra las materias de esa sección.
  useEffect(() => {
    if (esDocente) return;
    if (!grado) { setMaterias([]); setMateriaId(''); return; }
    setLoadingCombos(true);
    getMaterias(grado)
      .then(res => { setMaterias(res.data || []); setMateriaId(''); })
      .catch(() => toast.error('No se pudieron cargar las materias.'))
      .finally(() => setLoadingCombos(false));
  }, [grado, esDocente]);

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
      setPendingFiltro({ tipo: 'grado', valor: nuevoGrado });
      return;
    }
    setGrado(nuevoGrado);
  }, [dirty]);

  const cambiarMateria = useCallback((nuevoId) => {
    if (dirty) {
      setPendingFiltro({ tipo: 'materia', valor: nuevoId });
      return;
    }
    setMateriaId(nuevoId);
  }, [dirty]);

  const cambiarLapso = useCallback((nuevoId) => {
    if (dirty) {
      setPendingFiltro({ tipo: 'lapso', valor: nuevoId });
      return;
    }
    setLapsoId(nuevoId);
  }, [dirty]);

  // El usuario eligió "Descartar cambios y continuar" en el modal de confirmación:
  // se limpia el estado sucio (los datos originales se recargan solos por el
  // useEffect de arriba al aplicar el nuevo filtro) y luego se aplica el cambio.
  const confirmarDescartarCambios = useCallback(() => {
    if (!pendingFiltro) return;
    setDirty(false);
    if (pendingFiltro.tipo === 'grado') setGrado(pendingFiltro.valor);
    else if (pendingFiltro.tipo === 'materia') setMateriaId(pendingFiltro.valor);
    else if (pendingFiltro.tipo === 'lapso') setLapsoId(pendingFiltro.valor);
    setPendingFiltro(null);
  }, [pendingFiltro]);

  const cancelarDescartarCambios = useCallback(() => {
    setPendingFiltro(null);
  }, []);

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
    pendingFiltro,
    cambiarGrado,
    cambiarMateria,
    cambiarLapso,
    resetLapso,
    handleNotaChange,
    guardar,
    confirmarDescartarCambios,
    cancelarDescartarCambios,
  };
}
