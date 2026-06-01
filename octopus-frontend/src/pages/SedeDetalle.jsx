import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Building2, Users, AlertTriangle, DollarSign,
  TrendingUp, ArrowLeft, RefreshCw, GraduationCap
} from 'lucide-react';
import { toast } from 'react-toastify';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { getDashboardSede } from '../api/multisede.service';

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt = (n, d = 0) =>
  Number(n || 0).toLocaleString('es-VE', { minimumFractionDigits: d, maximumFractionDigits: d });

const fmtFecha = (str) => {
  try { return format(parseISO(str), 'dd MMM yyyy', { locale: es }); }
  catch { return str || '—'; }
};

// ── Skeleton genérico ─────────────────────────────────────────────────────────
const Skeleton = ({ h = 4, w = 'full', className = '' }) => (
  <div
    className={`rounded animate-pulse ${className}`}
    style={{ height: h, width: w === 'full' ? '100%' : w, background: 'var(--border-md)' }}
  />
);

const SkeletonCards = () => (
  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
    {[1,2,3,4].map(i => (
      <div key={i} className="rounded-xl p-4 animate-pulse" style={{ background: 'var(--porcelain)', border: '0.5px solid var(--border-md)' }}>
        <Skeleton h={3} w={80} className="mb-2" />
        <Skeleton h={6} w={100} />
      </div>
    ))}
  </div>
);

// ── Métricas card ─────────────────────────────────────────────────────────────
const MetricCard = ({ icon: Icon, label, value, color, accent }) => (
  <div
    className="rounded-xl p-4"
    style={{ background: 'var(--porcelain)', border: '0.5px solid var(--border-md)', borderLeft: `3px solid ${color}` }}
  >
    <div className="flex items-center gap-3">
      <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: accent }}>
        <Icon size={16} style={{ color }} />
      </div>
      <div>
        <p className="text-[11px] uppercase tracking-wide" style={{ color: 'var(--ash)' }}>{label}</p>
        <p className="text-lg font-bold mt-0.5" style={{ color: 'var(--jet)' }}>{value}</p>
      </div>
    </div>
  </div>
);

// ── Página ────────────────────────────────────────────────────────────────────
const SedeDetalle = () => {
  const { sedeId } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);

  const cargar = async () => {
    setLoading(true);
    try {
      const res = await getDashboardSede(sedeId);
      setData(res);
    } catch (err) {
      toast.error('Error al cargar los detalles de la sede');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { cargar(); }, [sedeId]);

  const sede        = data?.sede        || {};
  const metricas    = data?.metricas    || {};
  const ultimosPagos = data?.ultimos_pagos || [];
  const alumnosPorGrado = data?.alumnos_por_grado || [];
  const morosos     = data?.morosos_detalle || [];

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={() => navigate('/multisede')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm flex-shrink-0"
            style={{
              background: 'var(--porcelain)',
              border: '0.5px solid var(--border-md)',
              color: 'var(--ash)',
              transition: 'background 0.15s',
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--ash-light)'}
            onMouseLeave={e => e.currentTarget.style.background = 'var(--porcelain)'}
          >
            <ArrowLeft size={13} />
            Volver
          </button>
          <div className="min-w-0">
            {loading ? (
              <Skeleton h={5} w={200} />
            ) : (
              <>
                <h1 className="text-xl font-bold truncate" style={{ color: 'var(--jet)' }}>
                  {sede.nombre || `Sede #${sedeId}`}
                </h1>
                <p className="text-sm mt-0.5" style={{ color: 'var(--ash)' }}>
                  {sede.municipio}{sede.municipio && sede.estado ? ', ' : ''}{sede.estado}
                </p>
              </>
            )}
          </div>
        </div>
        <button
          onClick={cargar}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm flex-shrink-0"
          style={{
            background: 'var(--porcelain)',
            border: '0.5px solid var(--border-md)',
            color: 'var(--ash)',
            transition: 'background 0.15s',
          }}
          onMouseEnter={e => e.currentTarget.style.background = 'var(--ash-light)'}
          onMouseLeave={e => e.currentTarget.style.background = 'var(--porcelain)'}
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Métricas principales */}
      {loading ? (
        <SkeletonCards />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
          <MetricCard icon={Users}        label="Alumnos activos" value={fmt(metricas.alumnos_activos)}     color="var(--pb)"  accent="var(--pb-light)" />
          <MetricCard icon={AlertTriangle} label="Morosos"        value={fmt(metricas.morosos)}             color="var(--red)" accent="var(--red-light)" />
          <MetricCard icon={DollarSign}   label="Deuda USD"       value={`$${fmt(metricas.deuda_total_usd, 2)}`} color="var(--red)" accent="var(--red-light)" />
          <MetricCard icon={TrendingUp}   label="Pagos del mes"   value={`$${fmt(metricas.pagos_mes_actual, 2)}`} color="#16a34a" accent="#dcfce7" />
        </div>
      )}

      {/* Grid de secciones */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Últimos 5 pagos */}
        <div
          className="lg:col-span-2 rounded-xl p-4"
          style={{ background: 'var(--porcelain)', border: '0.5px solid var(--border-md)' }}
        >
          <h2 className="text-sm font-semibold mb-3" style={{ color: 'var(--jet)' }}>
            Últimos pagos
          </h2>
          {loading ? (
            <div className="space-y-2">
              {[1,2,3,4,5].map(i => <Skeleton key={i} h={4} />)}
            </div>
          ) : ultimosPagos.length === 0 ? (
            <p className="text-sm text-center py-6" style={{ color: 'var(--ash)' }}>Sin pagos registrados</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr style={{ borderBottom: '0.5px solid var(--border-md)' }}>
                    {['Fecha','Alumno','Monto USD','Estado'].map(h => (
                      <th key={h} className="text-left pb-2 pr-3 font-medium uppercase tracking-wide" style={{ color: 'var(--ash)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ultimosPagos.map((p, i) => (
                    <tr key={i} style={{ borderBottom: '0.5px solid var(--border)' }}>
                      <td className="py-2 pr-3" style={{ color: 'var(--jet)' }}>{fmtFecha(p.fecha_pago)}</td>
                      <td className="py-2 pr-3 truncate max-w-[120px]" style={{ color: 'var(--jet)' }}>{p.alumno || '—'}</td>
                      <td className="py-2 pr-3 font-medium" style={{ color: '#16a34a' }}>${fmt(p.monto_usd, 2)}</td>
                      <td className="py-2">
                        <span
                          className="px-2 py-0.5 rounded-full text-[10px] font-medium"
                          style={{ background: 'var(--pb-light)', color: 'var(--pb-mid)' }}
                        >
                          {p.metodo_pago || '—'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Panel derecho: alumnos por grado + morosos */}
        <div className="flex flex-col gap-4">
          {/* Alumnos por grado */}
          <div
            className="rounded-xl p-4"
            style={{ background: 'var(--porcelain)', border: '0.5px solid var(--border-md)' }}
          >
            <h2 className="text-sm font-semibold mb-3 flex items-center gap-2" style={{ color: 'var(--jet)' }}>
              <GraduationCap size={14} style={{ color: 'var(--pb)' }} />
              Alumnos por grado
            </h2>
            {loading ? (
              <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} h={3} />)}</div>
            ) : alumnosPorGrado.length === 0 ? (
              <p className="text-xs" style={{ color: 'var(--ash)' }}>Sin datos</p>
            ) : (
              <ul className="space-y-1.5">
                {alumnosPorGrado.map((g, i) => (
                  <li key={i} className="flex items-center justify-between">
                    <span className="text-xs truncate" style={{ color: 'var(--jet)' }}>{g.grado_seccion}</span>
                    <span
                      className="text-[10px] px-2 py-0.5 rounded-full font-medium ml-2 flex-shrink-0"
                      style={{ background: 'var(--pb-light)', color: 'var(--pb-mid)' }}
                    >
                      {g.total}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Morosos */}
          <div
            className="rounded-xl p-4"
            style={{ background: 'var(--porcelain)', border: '0.5px solid var(--border-md)' }}
          >
            <h2 className="text-sm font-semibold mb-3 flex items-center gap-2" style={{ color: 'var(--jet)' }}>
              <AlertTriangle size={14} style={{ color: 'var(--red)' }} />
              Morosos
            </h2>
            {loading ? (
              <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} h={3} />)}</div>
            ) : morosos.length === 0 ? (
              <p className="text-xs" style={{ color: 'var(--ash)' }}>Sin morosos</p>
            ) : (
              <ul className="space-y-1.5">
                {morosos.map((m, i) => (
                  <li key={i} className="flex items-center justify-between gap-2">
                    <span className="text-xs truncate" style={{ color: 'var(--jet)' }}>{m.nombre} {m.apellido}</span>
                    <span className="text-xs flex-shrink-0" style={{ color: 'var(--ash)' }}>
                      {m.grado_seccion || '—'}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SedeDetalle;
