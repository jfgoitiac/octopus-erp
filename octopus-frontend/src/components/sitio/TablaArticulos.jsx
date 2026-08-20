import { useCallback, useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import {
  Newspaper, Search, Plus, Pencil, Trash2, Globe, Eye,
} from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  getArticulos, deleteArticulo, publicarArticulo, getCategorias,
} from '../../api/sitio.service';
import Pagination from '../shared/Pagination';
import ConfirmDeleteModal from '../ConfirmDeleteModal';

const PAGE_SIZE = 20;

const ESTADO_STYLE = {
  publicado: { background: '#dcfce7', color: '#16a34a' },
  borrador: { background: 'var(--ash-light)', color: 'var(--ash)' },
};

const SkeletonRow = () => (
  <tr style={{ borderBottom: '0.5px solid var(--border)' }}>
    <td className="px-5 py-3.5" colSpan={6}>
      <div className="h-4 w-full rounded animate-pulse" style={{ background: 'var(--ash-light)' }} />
    </td>
  </tr>
);

/**
 * Listado paginado de Artículos (blog institucional).
 * Consume {count, next, previous, results} (paginación DRF estándar).
 */
const TablaArticulos = ({ onEditar, onNuevo }) => {
  const [articulos, setArticulos] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [estado, setEstado] = useState('');
  const [categoria, setCategoria] = useState('');
  const [search, setSearch] = useState('');
  const [aEliminar, setAEliminar] = useState(null);

  const fetchArticulos = useCallback(async (signal) => {
    setLoading(true);
    try {
      const res = await getArticulos({
        page, estado: estado || undefined, categoria: categoria || undefined, search: search || undefined,
      }, signal);
      setArticulos(res.data.results);
      setCount(res.data.count);
    } catch (err) {
      if (err?.code !== 'ERR_CANCELED') {
        toast.error(err?.response?.data?.detail || 'No se pudieron cargar los artículos.');
      }
    } finally {
      setLoading(false);
    }
  }, [page, estado, categoria, search]);

  useEffect(() => {
    const controller = new AbortController();
    fetchArticulos(controller.signal);
    return () => controller.abort();
  }, [fetchArticulos]);

  useEffect(() => {
    getCategorias()
      .then((res) => setCategorias(res.data))
      .catch(() => toast.error('No se pudieron cargar las categorías.'));
  }, []);

  const handlePublicar = async (articulo) => {
    try {
      await publicarArticulo(articulo.id);
      toast.success(`"${articulo.titulo}" fue publicado.`);
      fetchArticulos();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'No se pudo publicar el artículo.');
    }
  };

  const handleEliminar = async () => {
    if (!aEliminar) return;
    try {
      await deleteArticulo(aEliminar.id);
      toast.success(`"${aEliminar.titulo}" eliminado.`);
      setAEliminar(null);
      fetchArticulos();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'No se pudo eliminar el artículo.');
    }
  };

  return (
    <div className="rounded-xl overflow-hidden" style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)' }}>
      {/* Toolbar */}
      <div className="px-5 py-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3" style={{ borderBottom: '0.5px solid var(--border-md)', background: 'var(--bg)' }}>
        <div className="flex items-center gap-3 flex-1 flex-wrap">
          <div className="relative flex-1 max-w-xs">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--ash)' }} />
            <input
              type="text"
              value={search}
              onChange={(e) => { setPage(1); setSearch(e.target.value); }}
              placeholder="Buscar artículo..."
              className="w-full pl-8 pr-3 py-2 rounded-lg text-sm outline-none"
              style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)', fontSize: '16px' }}
            />
          </div>
          <select
            value={estado}
            onChange={(e) => { setPage(1); setEstado(e.target.value); }}
            className="px-3 py-2 rounded-lg text-sm outline-none"
            style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)' }}
          >
            <option value="">Todos los estados</option>
            <option value="publicado">Publicado</option>
            <option value="borrador">Borrador</option>
          </select>
          <select
            value={categoria}
            onChange={(e) => { setPage(1); setCategoria(e.target.value); }}
            className="px-3 py-2 rounded-lg text-sm outline-none"
            style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)' }}
          >
            <option value="">Todas las categorías</option>
            {categorias.map((c) => (
              <option key={c.id} value={c.id}>{c.nombre}</option>
            ))}
          </select>
        </div>
        <button
          type="button"
          onClick={onNuevo}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-white whitespace-nowrap"
          style={{ background: 'var(--pb)' }}
        >
          <Plus size={14} /> Nuevo Artículo
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left min-w-[760px]">
          <thead>
            <tr style={{ borderBottom: '0.5px solid var(--border-md)' }}>
              {['Artículo', 'Categoría', 'Estado', 'Vistas', 'Actualizado', 'Acciones'].map((h) => (
                <th key={h} className="px-5 py-3 text-[11px] uppercase tracking-widest" style={{ color: 'var(--ash)', background: 'var(--bg)' }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              [...Array(5)].map((_, i) => <SkeletonRow key={i} />)
            ) : articulos.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-5 py-14 text-center" style={{ color: 'var(--ash)' }}>
                  <Newspaper size={30} className="mx-auto mb-2 opacity-20" />
                  <p className="text-sm">No hay artículos registrados.</p>
                </td>
              </tr>
            ) : (
              articulos.map((a) => (
                <tr key={a.id} style={{ borderBottom: '0.5px solid var(--border)' }}>
                  <td className="px-5 py-3.5">
                    <p className="text-sm font-medium" style={{ color: 'var(--jet)' }}>{a.titulo}</p>
                    <p className="text-[11px] mt-0.5" style={{ color: 'var(--ash)' }}>/articulos/{a.slug}</p>
                  </td>
                  <td className="px-5 py-3.5 text-sm" style={{ color: 'var(--ash)' }}>
                    {a.categoria?.nombre || '—'}
                  </td>
                  <td className="px-5 py-3.5">
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider" style={ESTADO_STYLE[a.estado] || ESTADO_STYLE.borrador}>
                      {a.estado}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-sm" style={{ color: 'var(--ash)' }}>
                    <span className="inline-flex items-center gap-1">
                      <Eye size={12} /> {a.vistas ?? 0}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-sm" style={{ color: 'var(--ash)' }}>
                    {a.actualizado_en ? format(new Date(a.actualizado_en), "d MMM yyyy, HH:mm", { locale: es }) : '—'}
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-1.5 justify-end">
                      {a.estado !== 'publicado' && (
                        <button type="button" onClick={() => handlePublicar(a)} title="Publicar"
                          className="p-1.5 rounded-lg" style={{ color: '#16a34a', background: '#dcfce7' }}>
                          <Globe size={13} />
                        </button>
                      )}
                      <button type="button" onClick={() => onEditar?.(a)} title="Editar"
                        className="p-1.5 rounded-lg" style={{ color: 'var(--pb)', background: 'var(--pb-light)' }}>
                        <Pencil size={13} />
                      </button>
                      <button type="button" onClick={() => setAEliminar(a)} title="Eliminar"
                        className="p-1.5 rounded-lg" style={{ color: 'var(--red)', background: 'var(--red-light)' }}>
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Pagination
        page={page}
        totalPages={Math.ceil(count / PAGE_SIZE)}
        total={count}
        pageSize={PAGE_SIZE}
        onPageChange={setPage}
      />

      {aEliminar && (
        <ConfirmDeleteModal
          titulo="Eliminar artículo"
          nombre={aEliminar.titulo}
          onCancel={() => setAEliminar(null)}
          onConfirm={handleEliminar}
        />
      )}
    </div>
  );
};

export default TablaArticulos;
