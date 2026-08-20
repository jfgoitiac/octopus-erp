import { useCallback, useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import {
  FileText, Search, Plus, Pencil, Trash2, Globe, EyeOff, Star, LayoutTemplate, Copy, BookmarkPlus,
} from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  getPaginas, enviarPaginaAPapelera, publicarPagina, despublicarPagina,
  duplicarPagina, guardarPaginaComoPlantilla,
} from '../../api/sitio.service';
import Pagination from '../shared/Pagination';
import ConfirmDeleteModal from '../ConfirmDeleteModal';
import GuardarComoModal from './GuardarComoModal';

const PAGE_SIZE = 20;

const ESTADO_STYLE = {
  publicado: { background: '#dcfce7', color: '#16a34a' },
  borrador: { background: 'var(--ash-light)', color: 'var(--ash)' },
};

const SkeletonRow = () => (
  <tr style={{ borderBottom: '0.5px solid var(--border)' }}>
    <td className="px-5 py-3.5" colSpan={5}>
      <div className="h-4 w-full rounded animate-pulse" style={{ background: 'var(--ash-light)' }} />
    </td>
  </tr>
);

/**
 * Listado paginado de Páginas institucionales.
 * Consume {count, next, previous, results} (paginación DRF estándar).
 */
const TablaPaginas = ({ onEditar, onNueva, onAbrirEditorVisual }) => {
  const [paginas, setPaginas] = useState([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [estado, setEstado] = useState('');
  const [search, setSearch] = useState('');
  const [aEliminar, setAEliminar] = useState(null);
  const [eliminando, setEliminando] = useState(false);
  const [duplicandoId, setDuplicandoId] = useState(null);
  const [aGuardarComoPlantilla, setAGuardarComoPlantilla] = useState(null);
  const [guardandoPlantilla, setGuardandoPlantilla] = useState(false);

  const fetchPaginas = useCallback(async (signal) => {
    setLoading(true);
    try {
      const res = await getPaginas({ page, estado: estado || undefined, search: search || undefined }, signal);
      setPaginas(res.data.results);
      setCount(res.data.count);
    } catch (err) {
      if (err?.code !== 'ERR_CANCELED') {
        toast.error(err?.response?.data?.detail || 'No se pudieron cargar las páginas.');
      }
    } finally {
      setLoading(false);
    }
  }, [page, estado, search]);

  useEffect(() => {
    const controller = new AbortController();
    fetchPaginas(controller.signal);
    return () => controller.abort();
  }, [fetchPaginas]);

  const handleTogglePublicar = async (pagina) => {
    try {
      if (pagina.estado === 'publicado') {
        await despublicarPagina(pagina.id);
        toast.success(`"${pagina.titulo}" pasó a borrador.`);
      } else {
        await publicarPagina(pagina.id);
        toast.success(`"${pagina.titulo}" fue publicada.`);
      }
      fetchPaginas();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'No se pudo cambiar el estado de la página.');
    }
  };

  const handleEliminar = async () => {
    if (!aEliminar) return;
    setEliminando(true);
    try {
      // Fase 2: "Eliminar" ya no borra directo — manda a la papelera. El
      // borrado permanente vive solo en la vista de papelera, como red de
      // seguridad contra pérdida accidental de contenido.
      await enviarPaginaAPapelera(aEliminar.id);
      toast.success(`"${aEliminar.titulo}" se envió a la papelera.`);
      setAEliminar(null);
      fetchPaginas();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'No se pudo enviar la página a la papelera.');
    } finally {
      setEliminando(false);
    }
  };

  const handleDuplicar = async (pagina) => {
    setDuplicandoId(pagina.id);
    try {
      await duplicarPagina(pagina.id);
      toast.success(`"${pagina.titulo}" duplicada como borrador.`);
      fetchPaginas();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'No se pudo duplicar la página.');
    } finally {
      setDuplicandoId(null);
    }
  };

  const handleGuardarComoPlantilla = async (nombre) => {
    if (!aGuardarComoPlantilla) return;
    setGuardandoPlantilla(true);
    try {
      await guardarPaginaComoPlantilla(aGuardarComoPlantilla.id, nombre);
      toast.success(`Plantilla "${nombre}" guardada.`);
      setAGuardarComoPlantilla(null);
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'No se pudo guardar la plantilla.');
    } finally {
      setGuardandoPlantilla(false);
    }
  };

  return (
    <div className="rounded-xl overflow-hidden" style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)' }}>
      {/* Toolbar */}
      <div className="px-5 py-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3" style={{ borderBottom: '0.5px solid var(--border-md)', background: 'var(--bg)' }}>
        <div className="flex items-center gap-3 flex-1">
          <div className="relative flex-1 max-w-xs">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--ash)' }} />
            <input
              type="text"
              value={search}
              onChange={(e) => { setPage(1); setSearch(e.target.value); }}
              placeholder="Buscar página..."
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
        </div>
        <button
          type="button"
          onClick={onNueva}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-white whitespace-nowrap"
          style={{ background: 'var(--pb)' }}
        >
          <Plus size={14} /> Nueva Página
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left min-w-[720px]">
          <thead>
            <tr style={{ borderBottom: '0.5px solid var(--border-md)' }}>
              {['Página', 'Estado', 'Menú', 'Actualizada', 'Acciones'].map((h) => (
                <th key={h} className="px-5 py-3 text-[11px] uppercase tracking-widest" style={{ color: 'var(--ash)', background: 'var(--bg)' }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              [...Array(5)].map((_, i) => <SkeletonRow key={i} />)
            ) : paginas.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-5 py-14 text-center" style={{ color: 'var(--ash)' }}>
                  <FileText size={30} className="mx-auto mb-2 opacity-20" />
                  <p className="text-sm">No hay páginas registradas.</p>
                </td>
              </tr>
            ) : (
              paginas.map((p) => (
                <tr key={p.id} style={{ borderBottom: '0.5px solid var(--border)' }}>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium" style={{ color: 'var(--jet)' }}>{p.titulo}</p>
                      {p.es_home && (
                        <span title="Página de inicio" className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase" style={{ background: 'var(--pb-light)', color: 'var(--pb)' }}>
                          <Star size={9} /> Home
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] mt-0.5" style={{ color: 'var(--ash)' }}>/{p.slug}</p>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider" style={ESTADO_STYLE[p.estado] || ESTADO_STYLE.borrador}>
                      {p.estado}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-sm" style={{ color: 'var(--ash)' }}>
                    {p.mostrar_en_menu ? 'Visible' : 'Oculta'}
                  </td>
                  <td className="px-5 py-3.5 text-sm" style={{ color: 'var(--ash)' }}>
                    {p.actualizado_en ? format(new Date(p.actualizado_en), "d MMM yyyy, HH:mm", { locale: es }) : '—'}
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-1.5 justify-end">
                      <button type="button" onClick={() => onAbrirEditorVisual?.(p)} title="Editor visual"
                        className="p-1.5 rounded-lg" style={{ color: 'var(--pb)', background: 'var(--pb-light)' }}>
                        <LayoutTemplate size={13} />
                      </button>
                      <button type="button" onClick={() => handleTogglePublicar(p)} title={p.estado === 'publicado' ? 'Despublicar' : 'Publicar'}
                        className="p-1.5 rounded-lg" style={p.estado === 'publicado' ? { color: 'var(--ash)', background: 'var(--ash-light)' } : { color: '#16a34a', background: '#dcfce7' }}>
                        {p.estado === 'publicado' ? <EyeOff size={13} /> : <Globe size={13} />}
                      </button>
                      <button type="button" onClick={() => onEditar?.(p)} title="Editar"
                        className="p-1.5 rounded-lg" style={{ color: 'var(--pb)', background: 'var(--pb-light)' }}>
                        <Pencil size={13} />
                      </button>
                      <button type="button" onClick={() => handleDuplicar(p)} disabled={duplicandoId === p.id} title="Duplicar"
                        className="p-1.5 rounded-lg disabled:opacity-50" style={{ color: 'var(--ash)', background: 'var(--ash-light)' }}>
                        <Copy size={13} />
                      </button>
                      <button type="button" onClick={() => setAGuardarComoPlantilla(p)} title="Guardar como plantilla"
                        className="p-1.5 rounded-lg" style={{ color: 'var(--ash)', background: 'var(--ash-light)' }}>
                        <BookmarkPlus size={13} />
                      </button>
                      <button type="button" onClick={() => setAEliminar(p)} title="Enviar a la papelera"
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
          titulo="Enviar a la papelera"
          nombre={aEliminar.titulo}
          mensaje={<>¿Enviar <b>{aEliminar.titulo}</b> a la papelera? Se despublica y deja de mostrarse en el sitio, pero podrás restaurarla luego.</>}
          labelBoton="Enviar a papelera"
          onCancel={() => !eliminando && setAEliminar(null)}
          onConfirm={handleEliminar}
        />
      )}

      {aGuardarComoPlantilla && (
        <GuardarComoModal
          nombreSugerido={aGuardarComoPlantilla.titulo}
          guardando={guardandoPlantilla}
          onCancelar={() => !guardandoPlantilla && setAGuardarComoPlantilla(null)}
          onConfirmar={handleGuardarComoPlantilla}
        />
      )}
    </div>
  );
};

export default TablaPaginas;
