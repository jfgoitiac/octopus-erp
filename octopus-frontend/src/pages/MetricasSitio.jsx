import { useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import { BarChart3, FileText, Image as ImageIcon, TrendingUp, History, Eye } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { getMetricasSitio } from '../api/sitio.service';

const SkeletonCard = () => (
  <div className="rounded-xl p-5 animate-pulse space-y-3" style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)' }}>
    <div className="h-3 w-24 rounded" style={{ background: 'var(--ash-light)' }} />
    <div className="h-7 w-16 rounded" style={{ background: 'var(--ash-light)' }} />
  </div>
);

/**
 * Resumen de métricas del sitio institucional: artículos más vistos,
 * páginas publicadas, total de medios en biblioteca y últimas ediciones.
 */
const MetricasSitio = () => {
  const [metricas, setMetricas] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    getMetricasSitio(controller.signal)
      .then((res) => setMetricas(res.data))
      .catch((err) => {
        if (err?.code !== 'ERR_CANCELED') {
          toast.error(err?.response?.data?.detail || 'No se pudieron cargar las métricas del sitio.');
        }
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, []);

  return (
    <div className="space-y-5 animate-fadeIn">
      {/* Tarjetas resumen */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {loading ? (
          <>
            <SkeletonCard /><SkeletonCard /><SkeletonCard />
          </>
        ) : (
          <>
            <div className="rounded-xl p-5 flex items-center gap-4" style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)' }}>
              <div className="p-2.5 rounded-lg" style={{ background: 'var(--pb-light)' }}>
                <FileText size={18} style={{ color: 'var(--pb)' }} />
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-widest" style={{ color: 'var(--ash)' }}>Páginas publicadas</p>
                <p className="text-2xl font-semibold" style={{ color: 'var(--jet)' }}>{metricas?.paginas_publicadas ?? 0}</p>
              </div>
            </div>
            <div className="rounded-xl p-5 flex items-center gap-4" style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)' }}>
              <div className="p-2.5 rounded-lg" style={{ background: '#dcfce7' }}>
                <ImageIcon size={18} style={{ color: '#16a34a' }} />
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-widest" style={{ color: 'var(--ash)' }}>Medios en biblioteca</p>
                <p className="text-2xl font-semibold" style={{ color: 'var(--jet)' }}>{metricas?.media_total ?? 0}</p>
              </div>
            </div>
            <div className="rounded-xl p-5 flex items-center gap-4" style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)' }}>
              <div className="p-2.5 rounded-lg" style={{ background: '#fef9c3' }}>
                <TrendingUp size={18} style={{ color: '#ca8a04' }} />
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-widest" style={{ color: 'var(--ash)' }}>Artículos publicados</p>
                <p className="text-2xl font-semibold" style={{ color: 'var(--jet)' }}>{metricas?.articulos_mas_vistos?.length ?? 0}</p>
              </div>
            </div>
          </>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Artículos más vistos */}
        <div className="rounded-xl overflow-hidden" style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)' }}>
          <div className="px-5 py-3.5 flex items-center gap-3" style={{ borderBottom: '0.5px solid var(--border-md)', background: 'var(--bg)' }}>
            <div className="p-1.5 rounded-lg" style={{ background: 'var(--pb-light)' }}>
              <BarChart3 size={15} style={{ color: 'var(--pb)' }} />
            </div>
            <h3 className="text-sm font-semibold" style={{ color: 'var(--jet)' }}>Artículos más vistos</h3>
          </div>
          {loading ? (
            <div className="p-5 space-y-3">
              {[...Array(3)].map((_, i) => <div key={i} className="h-4 rounded animate-pulse" style={{ background: 'var(--ash-light)' }} />)}
            </div>
          ) : !metricas?.articulos_mas_vistos?.length ? (
            <div className="flex flex-col items-center py-10" style={{ color: 'var(--ash)' }}>
              <BarChart3 size={26} className="mb-2 opacity-20" />
              <p className="text-sm">Sin datos todavía.</p>
            </div>
          ) : (
            <ul>
              {metricas.articulos_mas_vistos.map((a) => (
                <li key={a.id} className="px-5 py-3 flex items-center justify-between gap-3" style={{ borderBottom: '0.5px solid var(--border)' }}>
                  <span className="text-sm truncate" style={{ color: 'var(--jet)' }}>{a.titulo}</span>
                  <span className="flex items-center gap-1 text-xs font-semibold flex-shrink-0" style={{ color: 'var(--pb)' }}>
                    <Eye size={12} /> {a.vistas}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Últimas ediciones */}
        <div className="rounded-xl overflow-hidden" style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)' }}>
          <div className="px-5 py-3.5 flex items-center gap-3" style={{ borderBottom: '0.5px solid var(--border-md)', background: 'var(--bg)' }}>
            <div className="p-1.5 rounded-lg" style={{ background: 'var(--pb-light)' }}>
              <History size={15} style={{ color: 'var(--pb)' }} />
            </div>
            <h3 className="text-sm font-semibold" style={{ color: 'var(--jet)' }}>Últimas ediciones</h3>
          </div>
          {loading ? (
            <div className="p-5 space-y-3">
              {[...Array(3)].map((_, i) => <div key={i} className="h-4 rounded animate-pulse" style={{ background: 'var(--ash-light)' }} />)}
            </div>
          ) : !metricas?.ultimas_ediciones?.length ? (
            <div className="flex flex-col items-center py-10" style={{ color: 'var(--ash)' }}>
              <History size={26} className="mb-2 opacity-20" />
              <p className="text-sm">Sin ediciones registradas.</p>
            </div>
          ) : (
            <ul>
              {metricas.ultimas_ediciones.map((e, i) => (
                <li key={`${e.tipo}-${e.id}-${i}`} className="px-5 py-3 flex items-center justify-between gap-3" style={{ borderBottom: '0.5px solid var(--border)' }}>
                  <div className="min-w-0">
                    <span className="text-sm block truncate" style={{ color: 'var(--jet)' }}>{e.titulo}</span>
                    <span className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--ash)' }}>{e.tipo}</span>
                  </div>
                  <span className="text-[11px] flex-shrink-0" style={{ color: 'var(--ash)' }}>
                    {format(new Date(e.actualizado_en), "d MMM, HH:mm", { locale: es })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
};

export default MetricasSitio;
