import { useState, useCallback, useEffect } from 'react';
import { toast } from 'react-toastify';
import {
  getLapsos,
  createLapso,
  updateLapso,
  getChecklistCierreLapso,
  cerrarLapsoSeguro,
  reabrirLapso as solicitarReapertura,
} from '../api/academico.service';
import { LAPSO_VACIO } from '../utils/notas.utils';

export function useLapsos({ periodoId = '', sedeId = '' } = {}) {
  const [lapsos, setLapsos] = useState([]);
  const [modalLapso, setModalLapso] = useState(false);
  const [lapsoEditando, setLapsoEditando] = useState(null);
  const [formLapso, setFormLapso] = useState(LAPSO_VACIO);
  const [guardandoLapso, setGuardandoLapso] = useState(false);
  const [cerrandoLapso, setCerrandoLapso] = useState(false);
  const [confirmCerrar, setConfirmCerrar] = useState(false);
  const [checklistCierre, setChecklistCierre] = useState(null);
  const [loadingChecklist, setLoadingChecklist] = useState(false);
  const [impactoCierre, setImpactoCierre] = useState(null);
  const [reabriendoLapso, setReabriendoLapso] = useState(false);

  const recargarLapsos = useCallback(() =>
    getLapsos({ ...(periodoId ? { periodo_id: periodoId } : {}), ...(sedeId ? { sede: sedeId } : {}) })
      .then(res => setLapsos(res.data || []))
      .catch(() => toast.error('No se pudieron cargar los lapsos.')),
  [periodoId, sedeId]);

  useEffect(() => { recargarLapsos(); }, [recargarLapsos]);

  const abrirModalCrear = useCallback(() => {
    setLapsoEditando(null);
    setFormLapso(LAPSO_VACIO);
    setConfirmCerrar(false);
    setChecklistCierre(null);
    setImpactoCierre(null);
    setModalLapso(true);
  }, []);

  const abrirModalEditar = useCallback((lapsoId) => {
    const lapso = lapsos.find(l => String(l.id) === String(lapsoId));
    if (!lapso) { toast.warning('Selecciona un lapso para editar.'); return; }
    setLapsoEditando(lapso);
    setFormLapso({
      nombre: lapso.nombre,
      periodo_id: lapso.periodo_id || lapso.periodo?.id || '',
      periodo_escolar: lapso.periodo_escolar,
      fecha_inicio: lapso.fecha_inicio || '',
      fecha_fin: lapso.fecha_fin || '',
      activo: lapso.activo ?? true,
    });
    setConfirmCerrar(false);
    setChecklistCierre(null);
    setImpactoCierre(null);
    setModalLapso(true);
  }, [lapsos]);

  const cerrarModal = useCallback(() => {
    setModalLapso(false);
    setConfirmCerrar(false);
    setChecklistCierre(null);
    setImpactoCierre(null);
  }, []);

  const cargarChecklistCierre = useCallback(async (lapsoId) => {
    if (!lapsoId) return null;
    setLoadingChecklist(true);
    setImpactoCierre(null);
    try {
      const res = await getChecklistCierreLapso(lapsoId);
      setChecklistCierre(res.data);
      setConfirmCerrar(true);
      return res.data;
    } catch (err) {
      const msg = err.response?.data?.error || err.response?.data?.detail || 'No se pudo verificar si el lapso está listo para cerrar.';
      toast.error(msg);
      return null;
    } finally {
      setLoadingChecklist(false);
    }
  }, []);

  const guardarLapso = useCallback(async () => {
    if (!formLapso.nombre || (!formLapso.periodo_id && !formLapso.periodo_escolar)) {
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
  const cerrarLapso = useCallback(async (lapsoId, opciones = {}) => {
    const lapso = lapsos.find(l => String(l.id) === String(lapsoId));
    if (!lapso) return false;
    setCerrandoLapso(true);
    try {
      const res = await cerrarLapsoSeguro(lapso.id, opciones);
      toast.success(res.data?.mensaje || `Lapso "${lapso.nombre}" cerrado.`);
      setConfirmCerrar(false);
      setModalLapso(false);
      await recargarLapsos();
      return true;
    } catch (err) {
      if (err.response?.status === 409 && err.response?.data?.codigo === 'LAPSO_INCOMPLETO') {
        const impacto = err.response?.data?.impacto || null;
        setImpactoCierre(impacto);
        setChecklistCierre(impacto);
        setConfirmCerrar(true);
        toast.warning(err.response?.data?.error || 'El lapso todavía tiene pendientes que deben revisarse.');
        return false;
      }
      const msg = err.response?.data?.error || 'Error al cerrar el lapso.';
      toast.error(msg);
      return false;
    } finally {
      setCerrandoLapso(false);
    }
  }, [lapsos, recargarLapsos]);

  const reabrirLapso = useCallback(async (lapsoId, motivo) => {
    const lapso = lapsos.find(l => String(l.id) === String(lapsoId));
    if (!lapso) return false;
    if (!motivo?.trim()) {
      toast.warning('Indica el motivo de la reapertura.');
      return false;
    }
    setReabriendoLapso(true);
    try {
      const res = await solicitarReapertura(lapso.id, motivo.trim());
      toast.success(res.data?.mensaje || `Lapso "${lapso.nombre}" reabierto.`);
      setModalLapso(false);
      await recargarLapsos();
      return true;
    } catch (err) {
      const msg = err.response?.data?.error || err.response?.data?.detail || 'No se pudo reabrir el lapso.';
      toast.error(msg);
      return false;
    } finally {
      setReabriendoLapso(false);
    }
  }, [lapsos, recargarLapsos]);

  return {
    lapsos,
    modalLapso,
    lapsoEditando,
    formLapso, setFormLapso,
    guardandoLapso,
    cerrandoLapso,
    reabriendoLapso,
    confirmCerrar, setConfirmCerrar,
    checklistCierre,
    loadingChecklist,
    impactoCierre,
    abrirModalCrear,
    abrirModalEditar,
    cerrarModal,
    guardarLapso,
    cargarChecklistCierre,
    cerrarLapso,
    reabrirLapso,
  };
}
