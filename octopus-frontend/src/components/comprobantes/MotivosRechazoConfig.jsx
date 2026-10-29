import { useCallback, useEffect, useState } from 'react';
import { Edit3, ListX, Loader2, Plus, Save, Trash2 } from 'lucide-react';
import { toast } from 'react-toastify';
import { Card } from '../ui/Card';
import { Modal } from '../ui/Modal';
import { ErrorCampo } from '../ui/ErrorCampo';
import { CardSkeleton } from '../shared/Skeleton';
import ConfirmDeleteModal from '../ConfirmDeleteModal';
import {
  actualizarMotivoRechazo, crearMotivoRechazo, eliminarMotivoRechazo, listarMotivosRechazo,
} from '../../services/comprobantesRevisionService';
import { mensajeError } from './comprobantesUtils';

const VACIO = { nombre: '', texto: '', orden: '', activo: true };

const inputStyle = (conError) => ({
  border: `0.5px solid ${conError ? '#dc2626' : 'var(--border-md)'}`,
  background: 'var(--porcelain)',
  color: 'var(--jet)',
});

const erroresDeDRF = (data) => {
  if (!data || typeof data !== 'object') return {};
  const fuente = data.campos && typeof data.campos === 'object' ? data.campos : data;
  return Object.fromEntries(
    Object.entries(fuente)
      .filter(([k]) => ['nombre', 'texto', 'orden', 'activo'].includes(k))
      .map(([k, v]) => [k, Array.isArray(v) ? v.join(' ') : String(v)])
  );
};

export default function MotivosRechazoConfig() {
  const [motivos, setMotivos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [editando, setEditando] = useState(null); // null = cerrado, {} = nuevo
  const [form, setForm] = useState(VACIO);
  const [errores, setErrores] = useState({});
  const [guardando, setGuardando] = useState(false);
  const [aEliminar, setAEliminar] = useState(null);

  const cargar = useCallback(async (signal) => {
    setCargando(true);
    try {
      const { data } = await listarMotivosRechazo({}, signal);
      const lista = Array.isArray(data) ? data : data?.results || [];
      setMotivos([...lista].sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0)));
    } catch (error) {
      if (error?.code !== 'ERR_CANCELED') toast.error('No se pudieron cargar los motivos de rechazo.');
    } finally {
      if (!signal?.aborted) setCargando(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial tras respuesta HTTP
    cargar(controller.signal);
    return () => controller.abort();
  }, [cargar]);

  const abrir = (motivo) => {
    setEditando(motivo || {});
    setForm(motivo ? { nombre: motivo.nombre, texto: motivo.texto, orden: motivo.orden ?? '', activo: motivo.activo } : { ...VACIO, orden: motivos.length + 1 });
    setErrores({});
  };

  const cambiar = (campo, valor) => {
    setForm((f) => ({ ...f, [campo]: valor }));
    setErrores((e) => ({ ...e, [campo]: undefined }));
  };

  const guardar = async (event) => {
    event.preventDefault();
    const e = {};
    if (!form.nombre.trim()) e.nombre = 'Escribe un nombre corto.';
    if (!form.texto.trim()) e.texto = 'Escribe el texto que verá el representante.';
    if (Object.keys(e).length) { setErrores(e); return; }
    const payload = {
      nombre: form.nombre.trim(),
      texto: form.texto.trim(),
      activo: form.activo,
      ...(form.orden !== '' ? { orden: Number(form.orden) } : {}),
    };
    setGuardando(true);
    try {
      if (editando?.id) await actualizarMotivoRechazo(editando.id, payload);
      else await crearMotivoRechazo(payload);
      toast.success('Motivo guardado.');
      setEditando(null);
      cargar();
    } catch (error) {
      setErrores(erroresDeDRF(error?.response?.data));
      toast.error(mensajeError(error, 'No se pudo guardar el motivo.'));
    } finally {
      setGuardando(false);
    }
  };

  const alternarActivo = async (motivo) => {
    setMotivos((lista) => lista.map((m) => (m.id === motivo.id ? { ...m, activo: !m.activo } : m)));
    try {
      await actualizarMotivoRechazo(motivo.id, { activo: !motivo.activo });
    } catch (error) {
      setMotivos((lista) => lista.map((m) => (m.id === motivo.id ? { ...m, activo: motivo.activo } : m)));
      toast.error(mensajeError(error, 'No se pudo actualizar el motivo.'));
    }
  };

  const eliminar = async () => {
    const motivo = aEliminar;
    setAEliminar(null);
    try {
      const respuesta = await eliminarMotivoRechazo(motivo.id);
      if (respuesta.data?.desactivado) toast.info(respuesta.data?.mensaje || 'El motivo ya se usó en rechazos: se desactivó en lugar de borrarse.');
      else toast.success(respuesta.data?.mensaje || 'Motivo eliminado.');
      cargar();
    } catch (error) {
      toast.error(mensajeError(error, 'No se pudo eliminar el motivo.'));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
        <p className="text-sm" style={{ color: 'var(--ash)' }}>
          Motivos que el revisor elige al rechazar un comprobante. Su texto se envía al representante.
        </p>
        <button
          type="button"
          onClick={() => abrir(null)}
          className="inline-flex w-full min-h-[40px] shrink-0 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold text-white sm:w-auto"
          style={{ background: 'var(--pb)' }}
        >
          <Plus size={16} aria-hidden="true" /> Nuevo motivo
        </button>
      </div>

      {cargando ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => <CardSkeleton key={i} />)}
        </div>
      ) : motivos.length === 0 ? (
        <Card>
          <div className="flex flex-col items-center gap-2 py-4 text-center">
            <ListX size={28} style={{ color: 'var(--ash)' }} aria-hidden="true" />
            <p className="text-sm" style={{ color: 'var(--ash)' }}>Aún no hay motivos de rechazo.</p>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {motivos.map((motivo) => (
            <Card key={motivo.id} className={motivo.activo ? '' : 'opacity-70'}>
              <div className="flex items-start gap-2">
                <h3 className="mr-auto min-w-0 break-words text-sm font-semibold" style={{ color: 'var(--jet)' }}>{motivo.nombre}</h3>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${motivo.activo ? 'bg-green-100 text-green-700' : ''}`}
                  style={motivo.activo ? undefined : { background: 'var(--jet-light)', color: 'var(--jet-mid)' }}
                >
                  {motivo.activo ? 'Activo' : 'Inactivo'}
                </span>
              </div>
              <p className="mt-2 text-xs line-clamp-3" style={{ color: 'var(--jet-mid)' }}>{motivo.texto}</p>
              <label className="mt-3 flex min-h-[40px] items-center gap-2 text-xs" style={{ color: 'var(--jet)' }}>
                <input type="checkbox" className="h-4 w-4" checked={motivo.activo} onChange={() => alternarActivo(motivo)} />
                Disponible al rechazar
              </label>
              <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  onClick={() => abrir(motivo)}
                  className="inline-flex flex-1 min-h-[40px] items-center justify-center gap-2 rounded-xl px-3 text-xs font-medium"
                  style={{ border: '0.5px solid var(--border-md)', color: 'var(--jet)' }}
                >
                  <Edit3 size={14} aria-hidden="true" /> Editar
                </button>
                <button
                  type="button"
                  onClick={() => setAEliminar(motivo)}
                  className="inline-flex flex-1 min-h-[40px] items-center justify-center gap-2 rounded-xl px-3 text-xs font-medium text-red-700"
                  style={{ border: '0.5px solid #fca5a5' }}
                >
                  <Trash2 size={14} aria-hidden="true" /> Eliminar
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={editando !== null}
        onClose={() => !guardando && setEditando(null)}
        titulo={editando?.id ? 'Editar motivo de rechazo' : 'Nuevo motivo de rechazo'}
        size="md"
        footer={
          <>
            <button
              type="button"
              onClick={() => setEditando(null)}
              disabled={guardando}
              className="inline-flex w-full min-h-[44px] items-center justify-center rounded-xl px-4 text-sm font-medium sm:w-auto"
              style={{ border: '0.5px solid var(--border-md)', color: 'var(--jet)' }}
            >
              Cancelar
            </button>
            <button
              type="submit"
              form="form-motivo-rechazo"
              disabled={guardando}
              className="inline-flex w-full min-h-[44px] items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold text-white disabled:opacity-60 sm:w-auto"
              style={{ background: 'var(--pb)' }}
            >
              {guardando ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Save size={16} aria-hidden="true" />}
              Guardar
            </button>
          </>
        }
      >
        <form id="form-motivo-rechazo" onSubmit={guardar} noValidate className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_7rem]">
            <label className="block text-sm font-medium" style={{ color: 'var(--jet)' }}>
              Nombre
              <input
                className="mt-1 w-full min-h-[44px] rounded-xl px-3 text-sm"
                style={inputStyle(errores.nombre)}
                value={form.nombre}
                onChange={(e) => cambiar('nombre', e.target.value)}
                maxLength={100}
                placeholder="Ej.: Monto no coincide"
              />
              <ErrorCampo msg={errores.nombre} />
            </label>
            <label className="block text-sm font-medium" style={{ color: 'var(--jet)' }}>
              Orden
              <input
                type="number"
                min="0"
                className="mt-1 w-full min-h-[44px] rounded-xl px-3 text-sm"
                style={inputStyle(errores.orden)}
                value={form.orden}
                onChange={(e) => cambiar('orden', e.target.value)}
              />
              <ErrorCampo msg={errores.orden} />
            </label>
          </div>
          <label className="block text-sm font-medium" style={{ color: 'var(--jet)' }}>
            Texto para el representante
            <textarea
              rows={4}
              className="mt-1 w-full rounded-xl px-3 py-2 text-sm"
              style={inputStyle(errores.texto)}
              value={form.texto}
              onChange={(e) => cambiar('texto', e.target.value)}
              placeholder="Ej.: El monto transferido no coincide con la mensualidad."
            />
            <ErrorCampo msg={errores.texto} />
          </label>
          <label className="flex min-h-[40px] items-center gap-3 text-sm" style={{ color: 'var(--jet)' }}>
            <input type="checkbox" className="h-4 w-4" checked={form.activo} onChange={(e) => cambiar('activo', e.target.checked)} />
            Disponible al rechazar
          </label>
        </form>
      </Modal>

      {aEliminar && (
        <ConfirmDeleteModal
          titulo="Eliminar motivo"
          nombre={aEliminar.nombre}
          mensaje={<>¿Eliminar <b>{aEliminar.nombre}</b>? Si ya se usó en algún rechazo, se desactivará en lugar de borrarse.</>}
          onConfirm={eliminar}
          onCancel={() => setAEliminar(null)}
        />
      )}
    </div>
  );
}
