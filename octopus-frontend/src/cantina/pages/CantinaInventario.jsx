import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'react-toastify';
import { Package, Plus } from 'lucide-react';
import {
  getProductos, crearProducto, actualizarProducto, eliminarProducto,
  getCategorias, registrarMovimientoInventario,
} from '../../api/cantina.service';
import ProductosTable from '../../components/cantina/inventario/ProductosTable';
import ProductoFormModal from '../../components/cantina/inventario/ProductoFormModal';
import MovimientoStockModal from '../../components/cantina/inventario/MovimientoStockModal';
import AlertaStockBajo from '../../components/cantina/inventario/AlertaStockBajo';

function SkeletonTabla() {
  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ border: '0.5px solid var(--border-md)' }}
      aria-busy="true"
      aria-label="Cargando productos"
    >
      <div className="h-10 animate-pulse" style={{ background: 'var(--porcelain)' }} />
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="flex gap-4 px-4 py-3 animate-pulse"
          style={{ borderTop: '0.5px solid var(--border-md)' }}
        >
          <div className="h-4 w-40 rounded" style={{ background: 'var(--border-md)' }} />
          <div className="h-4 w-24 rounded" style={{ background: 'var(--border-md)' }} />
          <div className="h-4 w-28 rounded" style={{ background: 'var(--border-md)' }} />
          <div className="h-4 w-16 rounded" style={{ background: 'var(--border-md)' }} />
          <div className="h-4 w-20 rounded" style={{ background: 'var(--border-md)' }} />
        </div>
      ))}
    </div>
  );
}

export default function CantinaInventario() {
  const [productos, setProductos]           = useState([]);
  const [loading, setLoading]                 = useState(true);
  const [categorias, setCategorias]           = useState([]);
  const [categoriaFiltro, setCategoriaFiltro] = useState('');
  const [refreshKey, setRefreshKey]           = useState(0);

  const [modalProducto, setModalProducto]   = useState(null); // { modo: 'crear'|'editar', producto }
  const [modalMovimiento, setModalMovimiento] = useState(null); // producto

  const abortRef = useRef(null);

  const cargarProductos = useCallback(async (signal) => {
    setLoading(true);
    try {
      const params = {};
      if (categoriaFiltro) params.categoria = categoriaFiltro;
      const res = await getProductos(params, signal);
      setProductos(res.data?.results ?? res.data ?? []);
    } catch (err) {
      if (err.name === 'CanceledError' || err.code === 'ERR_CANCELED') return;
      toast.error('Error al cargar los productos. Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  }, [categoriaFiltro]);

  useEffect(() => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    cargarProductos(controller.signal);
    return () => controller.abort();
  }, [cargarProductos, refreshKey]);

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        const res = await getCategorias(controller.signal);
        setCategorias(res.data?.results ?? res.data ?? []);
      } catch (err) {
        if (err.name === 'CanceledError' || err.code === 'ERR_CANCELED') return;
        toast.error('Error al cargar categorías.');
      }
    })();
    return () => controller.abort();
  }, [refreshKey]);

  const forzarRecarga = () => setRefreshKey(k => k + 1);

  const handleCrearProducto = async (payload) => {
    try {
      await crearProducto(payload);
      toast.success('Producto creado correctamente.');
      forzarRecarga();
      return true;
    } catch (err) {
      if (err.name === 'CanceledError' || err.code === 'ERR_CANCELED') return false;
      const msg = err.response?.data?.detail
        || err.response?.data?.codigo_barras?.[0]
        || err.response?.data?.nombre?.[0]
        || 'Error al crear el producto.';
      toast.error(msg);
      return false;
    }
  };

  const handleActualizarProducto = async (id, payload) => {
    try {
      await actualizarProducto(id, payload);
      toast.success('Producto actualizado correctamente.');
      forzarRecarga();
      return true;
    } catch (err) {
      if (err.name === 'CanceledError' || err.code === 'ERR_CANCELED') return false;
      const msg = err.response?.data?.detail
        || err.response?.data?.codigo_barras?.[0]
        || err.response?.data?.nombre?.[0]
        || 'Error al actualizar el producto.';
      toast.error(msg);
      return false;
    }
  };

  const handleEliminarProducto = async (producto) => {
    if (!window.confirm(`¿Eliminar el producto "${producto.nombre}"? Esta acción no se puede deshacer.`)) return;
    try {
      await eliminarProducto(producto.id);
      toast.success('Producto eliminado.');
      forzarRecarga();
    } catch (err) {
      if (err.name === 'CanceledError' || err.code === 'ERR_CANCELED') return;
      const msg = err.response?.data?.detail || 'Error al eliminar el producto.';
      toast.error(msg);
    }
  };

  const handleRegistrarMovimiento = async (payload) => {
    try {
      await registrarMovimientoInventario(payload);
      toast.success('Movimiento de inventario registrado.');
      forzarRecarga();
      return true;
    } catch (err) {
      if (err.name === 'CanceledError' || err.code === 'ERR_CANCELED') return false;
      const msg = err.response?.data?.detail
        || err.response?.data?.cantidad?.[0]
        || err.response?.data?.non_field_errors?.[0]
        || 'Error al registrar el movimiento. Verifica que no deje el stock en negativo.';
      toast.error(msg);
      return false;
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2" style={{ color: 'var(--jet)' }}>
            <Package size={20} style={{ color: 'var(--pb)' }} />
            Inventario de Cantina
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--ash)' }}>
            {loading ? 'Cargando productos...' : `${productos.length} producto${productos.length !== 1 ? 's' : ''}`}
          </p>
        </div>

        <button
          onClick={() => setModalProducto({ modo: 'crear', producto: null })}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium text-white min-h-[44px]"
          style={{ background: 'var(--pb)' }}
        >
          <Plus size={16} />
          Nuevo producto
        </button>
      </div>

      <AlertaStockBajo refreshKey={refreshKey} />

      <div className="flex flex-wrap items-center gap-2">
        <label className="text-xs font-medium uppercase tracking-widest" style={{ color: 'var(--ash)' }}>
          Categoría
        </label>
        <select
          value={categoriaFiltro}
          onChange={e => setCategoriaFiltro(e.target.value)}
          className="px-3 py-1.5 rounded-lg text-sm outline-none"
          style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)' }}
        >
          <option value="">Todas</option>
          {categorias.map(c => (
            <option key={c.id} value={c.id}>{c.nombre}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <SkeletonTabla />
      ) : (
        <ProductosTable
          productos={productos}
          onEditar={(p) => setModalProducto({ modo: 'editar', producto: p })}
          onAjustar={(p) => setModalMovimiento(p)}
          onEliminar={handleEliminarProducto}
        />
      )}

      {modalProducto && (
        <ProductoFormModal
          producto={modalProducto.producto}
          onClose={() => setModalProducto(null)}
          onSubmit={(payload) => (
            modalProducto.modo === 'editar'
              ? handleActualizarProducto(modalProducto.producto.id, payload)
              : handleCrearProducto(payload)
          )}
        />
      )}

      {modalMovimiento && (
        <MovimientoStockModal
          producto={modalMovimiento}
          onClose={() => setModalMovimiento(null)}
          onSubmit={handleRegistrarMovimiento}
        />
      )}
    </div>
  );
}
