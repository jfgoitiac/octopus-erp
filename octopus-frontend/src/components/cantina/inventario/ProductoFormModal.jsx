import { useState, useEffect, useRef } from 'react';
import { toast } from 'react-toastify';
import { Loader2, Package } from 'lucide-react';
import { getCategorias, crearCategoria } from '../../../api/cantina.service';
import { Modal } from '../../ui/Modal';

const FIELD_STYLE = { border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)', fontSize: '16px' };
const LABEL_STYLE = { color: 'var(--ash)' };

export default function ProductoFormModal({ producto, onClose, onSubmit }) {
  const esEdicion = Boolean(producto?.id);

  const [nombre, setNombre]             = useState(producto?.nombre ?? '');
  const [categoriaId, setCategoriaId]   = useState(producto?.categoria ?? producto?.categoria_id ?? '');
  const [codigoBarras, setCodigoBarras] = useState(producto?.codigo_barras ?? '');
  const [precio, setPrecio]             = useState(producto?.precio ?? '');
  const [stockActual, setStockActual]   = useState(producto?.stock_actual ?? 0);
  const [stockMinimo, setStockMinimo]   = useState(producto?.stock_minimo ?? 5);
  const [activo, setActivo]             = useState(producto?.activo ?? true);
  // Caja a la que pertenece el producto (D1): por defecto 'cantina', igual
  // que el default del backend para los datos existentes.
  const [area, setArea]                 = useState(producto?.area ?? 'cantina');

  const [categorias, setCategorias]         = useState([]);
  const [loadingCategorias, setLoadingCategorias] = useState(true);
  const [nuevaCategoria, setNuevaCategoria] = useState('');
  const [creandoCategoria, setCreandoCategoria] = useState(false);
  const [guardando, setGuardando]           = useState(false);

  const abortRef = useRef(null);

  useEffect(() => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    (async () => {
      setLoadingCategorias(true);
      try {
        const res = await getCategorias(controller.signal);
        setCategorias(res.data?.results ?? res.data ?? []);
      } catch (err) {
        if (err.name === 'CanceledError' || err.code === 'ERR_CANCELED') return;
        toast.error('Error al cargar categorías.');
      } finally {
        setLoadingCategorias(false);
      }
    })();

    return () => controller.abort();
  }, []);

  // Las categorías también pertenecen a una caja: solo se ofrecen las del área
  // elegida (las que no traen `area` se tratan como 'cantina').
  const categoriasDelArea = categorias.filter(c => (c.area ?? 'cantina') === area);

  const cambiarArea = (nueva) => {
    if (nueva === area) return;
    setArea(nueva);
    // La categoría elegida puede ser de la otra caja.
    setCategoriaId('');
  };

  const handleCrearCategoria = async () => {
    const nombreCat = nuevaCategoria.trim();
    if (!nombreCat) return;
    setCreandoCategoria(true);
    try {
      const res = await crearCategoria({ nombre: nombreCat, orden: categorias.length, area });
      const nueva = res.data;
      setCategorias(prev => [...prev, nueva]);
      setCategoriaId(nueva.id);
      setNuevaCategoria('');
      toast.success('Categoría creada.');
    } catch (err) {
      if (err.name === 'CanceledError' || err.code === 'ERR_CANCELED') return;
      const msg = err.response?.data?.detail || err.response?.data?.nombre?.[0] || 'Error al crear la categoría.';
      toast.error(msg);
    } finally {
      setCreandoCategoria(false);
    }
  };

  const validar = () => {
    if (!nombre.trim()) { toast.warning('El nombre del producto es obligatorio.'); return false; }
    if (!categoriaId) { toast.warning('Selecciona una categoría.'); return false; }
    const precioNum = Number(precio);
    if (precio === '' || Number.isNaN(precioNum) || precioNum < 0) {
      toast.warning('El precio debe ser un número mayor o igual a 0.');
      return false;
    }
    const stockActualNum = Number(stockActual);
    if (Number.isNaN(stockActualNum) || stockActualNum < 0 || !Number.isInteger(stockActualNum)) {
      toast.warning('El stock inicial debe ser un entero mayor o igual a 0.');
      return false;
    }
    const stockMinimoNum = Number(stockMinimo);
    if (Number.isNaN(stockMinimoNum) || stockMinimoNum < 0 || !Number.isInteger(stockMinimoNum)) {
      toast.warning('El stock mínimo debe ser un entero mayor o igual a 0.');
      return false;
    }
    return true;
  };

  const handleGuardar = async () => {
    if (!validar()) return;

    const payload = {
      nombre: nombre.trim(),
      categoria: categoriaId,
      codigo_barras: codigoBarras.trim() || null,
      precio: Number(precio),
      stock_actual: Number(stockActual),
      stock_minimo: Number(stockMinimo),
      activo,
      area,
    };

    setGuardando(true);
    const ok = await onSubmit(payload);
    setGuardando(false);
    if (ok) onClose();
  };

  const footer = (
    <>
      <button
        onClick={onClose}
        className="w-full sm:w-auto px-4 rounded-xl py-2.5 text-sm min-h-[44px]"
        style={{ border: '0.5px solid var(--border-md)', color: 'var(--ash)' }}
      >
        Cancelar
      </button>
      <button
        onClick={handleGuardar}
        disabled={guardando}
        className="w-full sm:w-auto px-4 text-white rounded-xl py-2.5 text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2 min-h-[44px]"
        style={{ background: 'var(--pb)' }}
      >
        {guardando ? <><Loader2 size={14} className="animate-spin" /> Guardando...</> : (esEdicion ? 'Guardar cambios' : 'Crear producto')}
      </button>
    </>
  );

  return (
    <Modal
      open
      onClose={onClose}
      titulo={(
        <>
          <Package size={17} />
          {esEdicion ? 'Editar producto' : 'Nuevo producto'}
        </>
      )}
      footer={footer}
      size="md"
    >
      <div className="space-y-4">
        <div>
          <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={LABEL_STYLE}>Nombre</label>
          <input
            type="text"
            className="w-full px-3 py-2 rounded-lg text-sm outline-none min-h-[44px]"
            style={FIELD_STYLE}
            value={nombre}
            onChange={e => setNombre(e.target.value)}
            placeholder="Ej. Jugo natural"
          />
        </div>

        <div>
          <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={LABEL_STYLE}>Caja</label>
          <div className="grid grid-cols-2 gap-2">
            {[['cantina', 'Cantina'], ['libreria', 'Librería']].map(([valor, etiqueta]) => (
              <button
                key={valor}
                type="button"
                onClick={() => cambiarArea(valor)}
                aria-pressed={area === valor}
                className="py-2 rounded-lg text-sm font-medium min-h-[44px]"
                style={area === valor
                  ? { border: '1.5px solid var(--pb)', color: 'var(--pb)', background: 'var(--pb-light, #e6f7f9)' }
                  : { border: '0.5px solid var(--border-md)', color: 'var(--ash)', background: '#fff' }}
              >
                {etiqueta}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={LABEL_STYLE}>Categoría</label>
          {loadingCategorias ? (
            <div className="h-11 rounded-lg animate-pulse" style={{ background: 'var(--border-md)' }} />
          ) : (
            <select
              className="w-full px-3 py-2 rounded-lg text-sm outline-none min-h-[44px]"
              style={FIELD_STYLE}
              value={categoriaId}
              onChange={e => setCategoriaId(e.target.value)}
            >
              <option value="">Selecciona una categoría</option>
              {categoriasDelArea.map(c => (
                <option key={c.id} value={c.id}>{c.nombre}</option>
              ))}
            </select>
          )}
          <div className="flex gap-2 mt-2">
            <input
              type="text"
              className="flex-1 px-3 py-1.5 rounded-lg text-xs outline-none"
              style={FIELD_STYLE}
              placeholder="Nueva categoría..."
              value={nuevaCategoria}
              onChange={e => setNuevaCategoria(e.target.value)}
            />
            <button
              type="button"
              onClick={handleCrearCategoria}
              disabled={creandoCategoria || !nuevaCategoria.trim()}
              className="px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-50"
              style={{ background: 'var(--pb-light)', color: 'var(--pb-mid)' }}
            >
              {creandoCategoria ? <Loader2 size={12} className="animate-spin" /> : 'Agregar'}
            </button>
          </div>
        </div>

        <div>
          <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={LABEL_STYLE}>Código de barras (opcional)</label>
          <input
            type="text"
            className="w-full px-3 py-2 rounded-lg text-sm outline-none min-h-[44px] font-mono"
            style={FIELD_STYLE}
            value={codigoBarras}
            onChange={e => setCodigoBarras(e.target.value)}
            placeholder="EAN-13"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <div>
            <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={LABEL_STYLE}>Precio (USD)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              className="w-full px-3 py-2 rounded-lg text-sm outline-none min-h-[44px]"
              style={FIELD_STYLE}
              value={precio}
              onChange={e => setPrecio(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={LABEL_STYLE}>
              {esEdicion ? 'Stock actual' : 'Stock inicial'}
            </label>
            <input
              type="number"
              min="0"
              step="1"
              className="w-full px-3 py-2 rounded-lg text-sm outline-none min-h-[44px]"
              style={FIELD_STYLE}
              value={stockActual}
              onChange={e => setStockActual(e.target.value)}
              disabled={esEdicion}
              title={esEdicion ? 'Usa "Ajustar stock" para modificar el stock actual' : undefined}
            />
          </div>
          <div>
            <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={LABEL_STYLE}>Stock mínimo</label>
            <input
              type="number"
              min="0"
              step="1"
              className="w-full px-3 py-2 rounded-lg text-sm outline-none min-h-[44px]"
              style={FIELD_STYLE}
              value={stockMinimo}
              onChange={e => setStockMinimo(e.target.value)}
            />
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--jet)' }}>
          <input type="checkbox" checked={activo} onChange={e => setActivo(e.target.checked)} />
          Producto activo (visible en el POS)
        </label>
      </div>
    </Modal>
  );
}
