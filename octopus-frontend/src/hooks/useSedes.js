import { useState, useCallback, useEffect } from 'react';
import { toast } from 'react-toastify';
import {
  getSedes, createSede, updateSede, deleteSede,
} from '../api/multisede.service';

function parseApiError(err) {
  const data = err?.response?.data;
  if (!data) return 'Error de conexión.';
  if (data.detail) return data.detail;
  if (typeof data === 'object') {
    const first = Object.values(data)[0];
    if (Array.isArray(first)) return first[0];
  }
  return 'Error al procesar la solicitud.';
}

const normalizeList = (data) =>
  Array.isArray(data) ? data : (data?.results ?? []);

const INITIAL_FORM = {
  nombre: '', rif: '', direccion: '', telefono: '',
  correo: '', municipio: '', estado: '', activa: true,
};

export const useSedes = () => {
  const [sedes, setSedes] = useState([]);
  const [loading, setLoading] = useState(true);

  // form / modal
  const [form, setForm] = useState(INITIAL_FORM);
  const [editingSede, setEditingSede] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);

  // confirmación de eliminación
  const [sedeParaEliminar, setSedeParaEliminar] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getSedes();
      setSedes(normalizeList(data));
    } catch {
      toast.error('Error al cargar las sedes');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const abrirNueva = () => {
    setEditingSede(null);
    setForm(INITIAL_FORM);
    setShowModal(true);
  };

  const abrirEditar = (sede) => {
    setEditingSede(sede);
    setForm({
      nombre:    sede.nombre    || '',
      rif:       sede.rif       || '',
      direccion: sede.direccion || '',
      telefono:  sede.telefono  || '',
      correo:    sede.correo    || '',
      municipio: sede.municipio || '',
      estado:    sede.estado    || '',
      activa:    sede.activa    ?? true,
    });
    setShowModal(true);
  };

  const cerrarModal = () => setShowModal(false);

  const handleFormChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
  };

  const guardar = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editingSede) {
        await updateSede(editingSede.id, form);
        toast.success('Sede actualizada');
      } else {
        await createSede(form);
        toast.success('Sede creada');
      }
      setShowModal(false);
      cargar();
    } catch (err) {
      toast.error(parseApiError(err));
    } finally {
      setSaving(false);
    }
  };

  // eliminar con modal de confirmación (reemplaza window.confirm — C-3 fix)
  const solicitarEliminar   = (sede) => setSedeParaEliminar(sede);
  const cancelarEliminar    = ()     => setSedeParaEliminar(null);

  const confirmarEliminar = async () => {
    if (!sedeParaEliminar) return;
    const { id, nombre } = sedeParaEliminar;
    setDeletingId(id);
    setSedeParaEliminar(null);
    try {
      await deleteSede(id);
      toast.success(`Sede "${nombre}" eliminada`);
      setSedes(prev => prev.filter(s => s.id !== id));
    } catch {
      toast.error('Error al eliminar la sede');
    } finally {
      setDeletingId(null);
    }
  };

  return {
    sedes, loading,
    form, editingSede, showModal, saving,
    sedeParaEliminar, deletingId,
    abrirNueva, abrirEditar, cerrarModal,
    handleFormChange, guardar,
    solicitarEliminar, cancelarEliminar, confirmarEliminar,
  };
};
