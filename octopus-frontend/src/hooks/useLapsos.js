import { useState, useCallback, useEffect } from 'react';
import { toast } from 'react-toastify';
import { getLapsos, createLapso, updateLapso, deleteLapso } from '../api/academico.service';
import { LAPSO_VACIO } from '../utils/notas.utils';

export function useLapsos() {
  const [lapsos, setLapsos] = useState([]);
  const [modalLapso, setModalLapso] = useState(false);
  const [lapsoEditando, setLapsoEditando] = useState(null);
  const [formLapso, setFormLapso] = useState(LAPSO_VACIO);
  const [guardandoLapso, setGuardandoLapso] = useState(false);
  const [cerrandoLapso, setCerrandoLapso] = useState(false);
  const [confirmCerrar, setConfirmCerrar] = useState(false);

  const recargarLapsos = useCallback(() =>
    getLapsos()
      .then(res => setLapsos(res.data || []))
      .catch(() => toast.error('No se pudieron cargar los lapsos.')),
  []);

  useEffect(() => { recargarLapsos(); }, [recargarLapsos]);

  const abrirModalCrear = useCallback(() => {
    setLapsoEditando(null);
    setFormLapso(LAPSO_VACIO);
    setConfirmCerrar(false);
    setModalLapso(true);
  }, []);

  const abrirModalEditar = useCallback((lapsoId) => {
    const lapso = lapsos.find(l => String(l.id) === String(lapsoId));
    if (!lapso) { toast.warning('Selecciona un lapso para editar.'); return; }
    setLapsoEditando(lapso);
    setFormLapso({
      nombre: lapso.nombre,
      periodo_escolar: lapso.periodo_escolar,
      fecha_inicio: lapso.fecha_inicio || '',
      fecha_fin: lapso.fecha_fin || '',
      activo: lapso.activo ?? true,
    });
    setConfirmCerrar(false);
    setModalLapso(true);
  }, [lapsos]);

  const cerrarModal = useCallback(() => {
    setModalLapso(false);
    setConfirmCerrar(false);
  }, []);

  const guardarLapso = useCallback(async () => {
    if (!formLapso.nombre || !formLapso.periodo_escolar) {
      toast.warning('Completa nombre y período escolar.');
      return;
    }
    setGuardandoLapso(true);
    try {
      if (lapsoEditando) {
        await updateLapso(lapsoEditando.id, formLapso);
        toast.success('Lapso actualizado correctamente.');
      } else {
        await createLapso(formLapso);
        toast.success('Lapso creado correctamente.');
      }
      setModalLapso(false);
      await recargarLapsos();
    } catch (err) {
      const msg = err.response?.data?.error || err.response?.data?.detail || 'Error al guardar lapso.';
      toast.error(msg);
    } finally {
      setGuardandoLapso(false);
    }
  }, [formLapso, lapsoEditando, recargarLapsos]);

  // Retorna true si el cierre fue exitoso — el llamador puede limpiar su estado de lapsoId
  const cerrarLapso = useCallback(async (lapsoId) => {
    const lapso = lapsos.find(l => String(l.id) === String(lapsoId));
    if (!lapso) return false;
    setCerrandoLapso(true);
    try {
      const res = await deleteLapso(lapso.id);
      toast.success(res.data?.mensaje || `Lapso "${lapso.nombre}" cerrado.`);
      setConfirmCerrar(false);
      setModalLapso(false);
      await recargarLapsos();
      return true;
    } catch (err) {
      const msg = err.response?.data?.error || 'Error al cerrar el lapso.';
      toast.error(msg);
      return false;
    } finally {
      setCerrandoLapso(false);
    }
  }, [lapsos, recargarLapsos]);

  return {
    lapsos,
    modalLapso,
    lapsoEditando,
    formLapso, setFormLapso,
    guardandoLapso,
    cerrandoLapso,
    confirmCerrar, setConfirmCerrar,
    abrirModalCrear,
    abrirModalEditar,
    cerrarModal,
    guardarLapso,
    cerrarLapso,
  };
}
