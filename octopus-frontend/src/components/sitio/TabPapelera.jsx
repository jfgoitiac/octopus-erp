import { useCallback, useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import { Trash2, RotateCcw, XCircle } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { getPaginasPapelera, restaurarPaginaDePapelera, deletePagina } from '../../api/sitio.service';
import Pagination from '../shared/Pagination';
import ConfirmDeleteModal from '../ConfirmDeleteModal';

const PAGE_SIZE = 20;

/**
 * Papelera de páginas (Fase 2 — soft-delete). Las páginas llegan aquí desde
 * el botón "Eliminar" de TablaPaginas (enviarPaginaAPapelera) y solo desde
 * acá se puede borrar en forma permanente — el backend rechaza el DELETE
 * directo si la página no pasó antes por la papelera.
 */
const TabPapelera = () => {
  const [paginas, setPaginas] = useState([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [restaurandoId, setRestaurandoId] = useState(null);
  const [aEliminarDefinitivo, setAEliminarDefinitivo] = useState(null);
  const [eliminando, setEliminando] = useState(false);

  const fetchPapelera = useCallback(async (signal) => {
    setLoading(true);
    try {
      const res = await getPaginasPapelera({ page }, signal);
      setPaginas(res.data.results);
      setCount(res.data.count);
    } catch (err) {
      if (err?.code !== 'ERR_CANCELED') {
        toast.error(err?.response?.data?.detail || 'No se pudo cargar la papelera.');
      }
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    const controller = new AbortController();
    fetchPapelera(controller.signal);
    return () => controller.abort();
  }, [fetchPapelera]);

  const handleRestaurar = async (pagina) => {
    setRestaurandoId(pagina.id);
    try {
      await restaurarPaginaDePapelera(pagina.id);
      toast.success(`"${pagina.titulo}" restaurada como borrador.`);
      fetchPapelera();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'No se pudo restaurar la página.');
    } finally {
      setRestaurandoId(null);
    }
  };

  const handleEliminarDefinitivo = async () => {
    if (!aEliminarDefinitivo) return;
    setEliminando(true);
    try {
      await deletePagina(aEliminarDefinitivo.id);
      toast.success(`"${aEliminarDefinitivo.titulo}" eliminada definitivamente.`);
      setAEliminarDefinitivo(null);
      fetchPapelera();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'No se pudo eliminar la página.');
    } finally {
      setEliminando(false);
    }
  };

  return (
    <div className="rounded-xl overflow-hidden" style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)' }}>
      <div className="px-5 py-3.5" style={{ borderBottom: '0.5px solid var(--border-md)', background: 'var(--bg)' }}>
        <p className="text-xs" style={{ color: 'var(--ash)' }}>
          Páginas eliminadas — se pueden restaurar como borrador o eliminar en forma permanente.
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left min-w-[600px]">
          <thead>
            <tr style={{ borderBottom: '0.5px solid var(--border-md)' }}>
              {['Página', 'Enviada a la papelera', 'Acciones'].map((h) => (
                <th key={h} className="px-5 py-3 text-[11px] uppercase tracking-widest" style={{ color: 'var(--ash)', background: 'var(--bg)' }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              [...Array(3)].map((_, i) => (
                <tr key={i} style={{ borderBottom: '0.5px solid var(--border)' }}>
                  <td className="px-5 py-3.5" colSpan={3}>
                    <div className="h-4 w-full rounded animate-pulse" style={{ background: 'var(--ash-light)' }} />
                  </td>
                </tr>
              ))
            ) : paginas.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-5 py-14 text-center" style={{ color: 'var(--ash)' }}>
                  <Trash2 size={30} className="mx-auto mb-2 opacity-20" />
                  <p className="text-sm">La papelera está vacía.</p>
                </td>
              </tr>
            ) : (
              paginas.map((p) => (
                <tr key={p.id} style={{ borderBottom: '0.5px solid var(--border)' }}>
                  <td className="px-5 py-3.5">
                    <p className="text-sm font-medium" style={{ color: 'var(--jet)' }}>{p.titulo}</p>
                    <p className="text-[11px] mt-0.5" style={{ color: 'var(--ash)' }}>/{p.slug}</p>
                  </td>
                  <td className="px-5 py-3.5 text-sm" style={{ color: 'var(--ash)' }}>
                    {p.eliminado_en ? format(new Date(p.eliminado_en), "d MMM yyyy, HH:mm", { locale: es }) : '—'}
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-1.5 justify-end">
                      <button type="button" onClick={() => handleRestaurar(p)} disabled={restaurandoId === p.id} title="Restaurar"
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-50"
                        style={{ color: 'var(--pb)', background: 'var(--pb-light)' }}>
                        <RotateCcw size={13} /> Restaurar
                      </button>
                      <button type="button" onClick={() => setAEliminarDefinitivo(p)} title="Eliminar definitivamente"
                        className="p-1.5 rounded-lg" style={{ color: 'var(--red)', background: 'var(--red-light)' }}>
                        <XCircle size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Pagination page={page} totalPages={Math.ceil(count / PAGE_SIZE)} total={count} pageSize={PAGE_SIZE} onPageChange={setPage} />

      {aEliminarDefinitivo && (
        <ConfirmDeleteModal
          titulo="Eliminar definitivamente"
          nombre={aEliminarDefinitivo.titulo}
          mensaje={<>¿Eliminar <b>{aEliminarDefinitivo.titulo}</b> para siempre? No se puede deshacer — se pierden todos sus bloques.</>}
          labelBoton="Eliminar para siempre"
          onCancel={() => !eliminando && setAEliminarDefinitivo(null)}
          onConfirm={handleEliminarDefinitivo}
        />
      )}
    </div>
  );
};

export default TabPapelera;
