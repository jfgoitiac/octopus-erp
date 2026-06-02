import { useState, useCallback, useEffect } from 'react';
import { toast } from 'react-toastify';
import {
  getUsuariosSede, asignarUsuarioSede, revocarUsuarioSede,
} from '../api/multisede.service';

const normalizeList = (data) =>
  Array.isArray(data) ? data : (data?.results ?? []);

const INITIAL_FORM = { username: '', rol: 'cajero' };

export const useUsuariosSede = (sedeId) => {
  const [usuarios, setUsuarios] = useState([]);
  const [loading, setLoading] = useState(false);

  // form / modal de asignación
  const [form, setForm] = useState(INITIAL_FORM);
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);

  // confirmación de revocación (reemplaza window.confirm — C-3 fix)
  const [usuarioParaRevocar, setUsuarioParaRevocar] = useState(null);
  const [revokingId, setRevokingId] = useState(null);

  const cargar = useCallback(async () => {
    if (!sedeId) { setUsuarios([]); return; }
    setLoading(true);
    try {
      const data = await getUsuariosSede(sedeId);
      setUsuarios(normalizeList(data));
    } catch {
      toast.error('Error al cargar los usuarios');
    } finally {
      setLoading(false);
    }
  }, [sedeId]);

  useEffect(() => { cargar(); }, [cargar]);

  const cerrarModal = () => {
    setShowModal(false);
    setForm(INITIAL_FORM);
  };

  // C-1 fix: el catch de asignar y el reload de lista tienen manejo separado.
  // Si la asignación falla → mensaje preciso. Si el reload falla → warning distinto.
  const asignar = async (e) => {
    e.preventDefault();
    setSaving(true);
    let asignado = false;
    try {
      await asignarUsuarioSede(sedeId, form);
      asignado = true;
      toast.success('Usuario asignado');
      cerrarModal();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Error al asignar usuario');
    } finally {
      setSaving(false);
    }
    if (!asignado) return;
    try {
      const data = await getUsuariosSede(sedeId);
      setUsuarios(normalizeList(data));
    } catch {
      toast.warn('Usuario asignado, pero no se pudo refrescar la lista');
    }
  };

  const solicitarRevocar  = (usuario) => setUsuarioParaRevocar(usuario);
  const cancelarRevocar   = ()        => setUsuarioParaRevocar(null);

  const confirmarRevocar = async () => {
    if (!usuarioParaRevocar) return;
    const { id } = usuarioParaRevocar;
    setRevokingId(id);
    setUsuarioParaRevocar(null);
    try {
      await revocarUsuarioSede(sedeId, id);
      toast.success('Acceso revocado');
      setUsuarios(prev => prev.filter(u => u.id !== id));
    } catch {
      toast.error('Error al revocar el acceso');
    } finally {
      setRevokingId(null);
    }
  };

  return {
    usuarios, loading,
    form, setForm, showModal, setShowModal, saving,
    usuarioParaRevocar, revokingId,
    cerrarModal, asignar,
    solicitarRevocar, cancelarRevocar, confirmarRevocar,
  };
};
