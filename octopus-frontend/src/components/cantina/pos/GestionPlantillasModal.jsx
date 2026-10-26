import { useState } from 'react';
import { toast } from 'react-toastify';
import { Loader2, Plus, Trash2, Pencil } from 'lucide-react';
import { Modal } from '../../ui/Modal';
import {
  crearPlantillaVenta, actualizarPlantillaVenta, eliminarPlantillaVenta,
} from '../../../api/cantina.service';

const FIELD_STYLE = { border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)', fontSize: '16px' };
const VACIA = { id: null, nombre: '', items: [] };

function mensajeError(err, porDefecto) {
  const d = err.response?.data;
  if (!d) return porDefecto;
  if (typeof d === 'string') return d;
  if (d.detail) return d.detail;
  const primero = Object.values(d)[0];
  return Array.isArray(primero) ? primero[0] : (typeof primero === 'string' ? primero : porDefecto);
}

/**
 * Crear, editar y eliminar plantillas de venta (combos) de la caja abierta.
 * `productos` son los productos activos del área; `onCambio` recarga la lista.
 */
export default function GestionPlantillasModal({ area, productos, plantillas, tasa, onClose, onCambio }) {
  const [edicion, setEdicion] = useState(null); // null = lista; objeto = formulario
  const [guardando, setGuardando] = useState(false);
  const [aEliminar, setAEliminar] = useState(null);

  const editar = (p) => setEdicion({
    id: p.id,
    nombre: p.nombre,
    items: p.items.map(i => ({ producto: i.producto, cantidad: i.cantidad })),
  });

  const actualizarItem = (idx, cambios) => setEdicion(e => ({
    ...e, items: e.items.map((it, i) => (i === idx ? { ...it, ...cambios } : it)),
  }));

  const totalUsd = edicion
    ? edicion.items.reduce((acc, it) => {
      const prod = productos.find(p => p.id === Number(it.producto));
      return acc + (prod ? Number(prod.precio) * (Number(it.cantidad) || 0) : 0);
    }, 0)
    : 0;

  const guardar = async () => {
    const nombre = edicion.nombre.trim();
    if (!nombre) { toast.warning('Escribe un nombre para la plantilla.'); return; }
    if (edicion.items.length === 0 || edicion.items.some(i => !i.producto)) {
      toast.warning('Agrega al menos un producto y elige cada uno.');
      return;
    }
    const payload = {
      nombre,
      area,
      items: edicion.items.map(i => ({ producto: Number(i.producto), cantidad: Number(i.cantidad) || 1 })),
    };
    setGuardando(true);
    try {
      if (edicion.id) await actualizarPlantillaVenta(edicion.id, payload);
      else await crearPlantillaVenta(payload);
      toast.success('Plantilla guardada.');
      setEdicion(null);
      onCambio();
    } catch (err) {
      toast.error(mensajeError(err, 'No se pudo guardar la plantilla.'));
    } finally {
      setGuardando(false);
    }
  };

  const eliminar = async (p) => {
    try {
      await eliminarPlantillaVenta(p.id);
      toast.success('Plantilla eliminada.');
      setAEliminar(null);
      onCambio();
    } catch (err) {
      toast.error(mensajeError(err, 'No se pudo eliminar la plantilla.'));
    }
  };

  return (
    <Modal open onClose={onClose} titulo={edicion ? (edicion.id ? 'Editar plantilla' : 'Nueva plantilla') : 'Plantillas de cobro'} size="lg">
      <div className="p-4 sm:p-5 overflow-y-auto space-y-3">
        {!edicion ? (
          <>
            <button
              type="button"
              onClick={() => setEdicion({ ...VACIA })}
              className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 rounded-xl text-sm font-medium min-h-[44px]"
              style={{ background: 'var(--pb)', color: '#fff' }}
            >
              <Plus size={16} /> Nueva plantilla
            </button>

            {plantillas.length === 0 && (
              <p className="text-sm" style={{ color: 'var(--ash)' }}>No hay plantillas en esta caja.</p>
            )}
            {plantillas.map(p => (
              <div key={p.id} className="rounded-xl p-3 flex flex-col sm:flex-row sm:items-center gap-2" style={{ background: '#fff', border: '0.5px solid var(--border-md)' }}>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold truncate" style={{ color: 'var(--jet)' }}>{p.nombre}</p>
                  <p className="text-xs" style={{ color: 'var(--ash)' }}>
                    {p.items.map(i => `${i.cantidad}× ${i.producto_nombre}`).join(' · ')}
                  </p>
                  <p className="text-sm font-semibold" style={{ color: 'var(--pb-mid)' }}>
                    {tasa > 0 ? `Bs. ${(Number(p.total_usd) * tasa).toFixed(2)}` : `$${Number(p.total_usd).toFixed(2)}`}
                  </p>
                </div>
                {aEliminar === p.id ? (
                  <div className="flex gap-2">
                    <button type="button" onClick={() => eliminar(p)} className="px-3 rounded-lg text-sm min-h-[44px]" style={{ background: 'var(--red)', color: '#fff' }}>Confirmar</button>
                    <button type="button" onClick={() => setAEliminar(null)} className="px-3 rounded-lg text-sm min-h-[44px]" style={{ color: 'var(--ash)' }}>Cancelar</button>
                  </div>
                ) : (
                  <div className="flex gap-1">
                    <button type="button" onClick={() => editar(p)} aria-label={`Editar ${p.nombre}`} className="w-11 h-11 flex items-center justify-center rounded-lg" style={{ color: 'var(--pb-mid)' }}><Pencil size={16} /></button>
                    <button type="button" onClick={() => setAEliminar(p.id)} aria-label={`Eliminar ${p.nombre}`} className="w-11 h-11 flex items-center justify-center rounded-lg" style={{ color: 'var(--red)' }}><Trash2 size={16} /></button>
                  </div>
                )}
              </div>
            ))}
          </>
        ) : (
          <>
            <div>
              <label className="text-xs uppercase tracking-widest" style={{ color: 'var(--ash)' }} htmlFor="plantilla-nombre">Nombre</label>
              <input
                id="plantilla-nombre"
                value={edicion.nombre}
                maxLength={80}
                onChange={e => setEdicion(ed => ({ ...ed, nombre: e.target.value }))}
                placeholder="Ej. Combo desayuno"
                className="w-full mt-1 px-3 py-2 rounded-xl min-h-[44px] outline-none"
                style={FIELD_STYLE}
              />
            </div>

            <div className="space-y-2">
              {edicion.items.map((it, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <select
                    value={it.producto}
                    onChange={e => actualizarItem(idx, { producto: e.target.value })}
                    aria-label="Producto"
                    className="flex-1 min-w-0 px-3 py-2 rounded-xl min-h-[44px]"
                    style={FIELD_STYLE}
                  >
                    <option value="">Elige un producto…</option>
                    {productos.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.nombre} — {tasa > 0 ? `Bs. ${(Number(p.precio) * tasa).toFixed(2)}` : `$${Number(p.precio).toFixed(2)}`}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min={1}
                    value={it.cantidad}
                    onChange={e => actualizarItem(idx, { cantidad: e.target.value })}
                    aria-label="Cantidad"
                    className="w-20 px-2 py-2 rounded-xl min-h-[44px] text-center"
                    style={FIELD_STYLE}
                  />
                  <button
                    type="button"
                    onClick={() => setEdicion(e => ({ ...e, items: e.items.filter((_, i) => i !== idx) }))}
                    aria-label="Quitar producto"
                    className="w-11 h-11 shrink-0 flex items-center justify-center rounded-lg"
                    style={{ color: 'var(--red)' }}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => setEdicion(e => ({ ...e, items: [...e.items, { producto: '', cantidad: 1 }] }))}
                className="flex items-center gap-1.5 text-sm px-2 rounded-lg min-h-[44px]"
                style={{ color: 'var(--pb-mid)' }}
              >
                <Plus size={14} /> Agregar producto
              </button>
            </div>

            <p className="text-sm font-semibold" style={{ color: 'var(--jet)' }}>
              Total: {tasa > 0 ? `Bs. ${(totalUsd * tasa).toFixed(2)}` : `$${totalUsd.toFixed(2)}`}
            </p>

            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-1">
              <button type="button" onClick={() => setEdicion(null)} disabled={guardando} className="px-4 rounded-xl text-sm min-h-[44px]" style={{ color: 'var(--ash)' }}>
                Volver
              </button>
              <button
                type="button"
                onClick={guardar}
                disabled={guardando}
                className="flex items-center justify-center gap-2 px-4 rounded-xl text-sm font-medium min-h-[44px] disabled:opacity-60"
                style={{ background: 'var(--pb)', color: '#fff' }}
              >
                {guardando && <Loader2 size={14} className="animate-spin" />} Guardar plantilla
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
