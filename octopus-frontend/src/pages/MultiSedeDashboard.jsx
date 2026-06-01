import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Building2, Users, AlertTriangle, DollarSign,
  TrendingUp, ArrowRight, RefreshCw
} from 'lucide-react';
import { toast } from 'react-toastify';
import { getDashboardConsolidado } from '../api/multisede.service';
import { useSede } from '../context/SedeContext';

// ── helpers ──────────────────────────────────────────────────────────────────
const fmt = (n, d = 0) =>
  Number(n || 0).toLocaleString('es-VE', { minimumFractionDigits: d, maximumFractionDigits: d });

// ── Skeleton ─────────────────────────────────────────────────────────────────
const SkeletonCard = () => (
  <div className="rounded-xl p-4 animate-pulse" style={{ background: 'var(--porcelain)', border: '0.5px solid var(--border-md)' }}>
    <div className="flex items-center justify-between mb-3">
      <div className="h-4 w-32 rounded" style={{ background: 'var(--border-md)' }} />
      <div className="h-5 w-14 rounded-full" style={{ background: 'var(--border-md)' }} />
    </div>
    <div className="grid grid-cols-2 gap-3">
      {[1,2,3,4].map(i => (
        <div key={i}>
          <div className="h-3 w-16 rounded mb-1" style={{ background: 'var(--border-md)' }} />
          <div className="h-5 w-20 rounded" style={{ background: 'var(--border-md)' }} />
        </div>
      ))}
    </div>
    <div className="mt-3 h-1.5 rounded-full" style={{ background: 'var(--border-md)' }} />
  </div>
);

const SkeletonSummary = () => (
  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
    {[1,2,3].map(i => (
      <div key={i} className="rounded-xl p-4 animate-pulse" style={{ background: 'var(--porcelain)', border: '0.5px solid var(--border-md)' }}>
        <div className="h-3 w-20 rounded mb-2" style={{ background: 'var(--border-md)' }} />
        <div className="h-7 w-28 rounded" style={{ background: 'var(--border-md)' }} />
      </div>
    ))}
  </div>
);

// ── Barra de progreso ─────────────────────────────────────────────────────────
const ProgressBar = ({ value, max }) => {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  const color = pct > 15 ? 'var(--red)' : pct > 8 ? '#d97706' : 'var(--pb)';
  return (
    <div className="w-full rounded-full overflow-hidden mt-3" style={{ height: 4, background: 'var(--border-md)' }}>
      <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 999, transition: 'width 0.6s ease' }} />
    </div>
  );
};

// ── Card de sede ──────────────────────────────────────────────────────────────
const SedeCard = ({ sede, onVerDetalle }) => {
  const morososPct = sede.alumnos_activos > 0
    ? ((sede.morosos / sede.alumnos_activos) * 100).toFixed(1)
    : 0;
  const alertaMorosos = Number(morososPct) > 15;

  return (
    <div
      className="rounded-xl p-4 card-lift cursor-default"
      style={{
        background: 'var(--porcelain)',
        border: '0.5px solid var(--border-md)',
        borderLeft: `3px solid ${sede.activa ? 'var(--pb)' : 'var(--ash)'}`,
      }}
    >
      {/* Header sede */}
      <div className="flex items-start justify-between mb-3 gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Building2 size={15} style={{ color: 'var(--pb)', flexShrink: 0 }} />
          <span className="text-sm font-semibold truncate" style={{ color: 'var(--jet)' }}>
            {sede.nombre}
          </span>
        </div>
        <span
          className="text-[10px] px-2 py-0.5 rounded-full flex-shrink-0 font-medium"
          style={{
            background: sede.activa ? 'var(--pb-light)' : 'var(--ash-light)',
            color: sede.activa ? 'var(--pb-mid)' : 'var(--ash)',
          }}
        >
          {sede.activa ? 'Activa' : 'Inactiva'}
        </span>
      </div>

      {/* Métricas 2×2 */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-wide mb-0.5" style={{ color: 'var(--ash)' }}>Alumnos</p>
          <p className="text-base font-bold" style={{ color: 'var(--jet)' }}>{fmt(sede.alumnos_activos)}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wide mb-0.5" style={{ color: 'var(--ash)' }}>
            Morosos {alertaMorosos && <AlertTriangle size={10} className="inline" style={{ color: 'var(--red)' }} />}
          </p>
          <p className="text-base font-bold" style={{ color: alertaMorosos ? 'var(--red)' : 'var(--jet)' }}>
            {fmt(sede.morosos)}
            <span className="text-[10px] ml-1 font-normal" style={{ color: 'var(--ash)' }}>({morososPct}%)</span>
          </p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wide mb-0.5" style={{ color: 'var(--ash)' }}>Deuda USD</p>
          <p className="text-base font-bold" style={{ color: 'var(--red)' }}>${fmt(sede.deuda_total_usd, 2)}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wide mb-0.5" style={{ color: 'var(--ash)' }}>Pagos mes</p>
          <p className="text-base font-bold" style={{ color: '#16a34a' }}>${fmt(sede.pagos_mes_actual, 2)}</p>
        </div>
      </div>

      <ProgressBar value={sede.morosos} max={sede.alumnos_activos} />

      <button
        onClick={() => onVerDetalle(sede.id)}
        className="mt-3 w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium"
        style={{
          background: 'var(--pb-light)',
          color: 'var(--pb-mid)',
          transition: 'background 0.15s, transform 0.15s',
        }}
        onMouseEnter={e => { e.currentTarget.style.background = 'var(--pb)'; e.currentTarget.style.color = '#fff'; }}
        onMouseLeave={e => { e.currentTarget.style.background = 'var(--pb-light)'; e.currentTarget.style.color = 'var(--pb-mid)'; }}
      >
        Ver detalle
        <ArrowRight size={12} />
      </button>
    </div>
  );
};

// ── Página principal ──────────────────────────────────────────────────────────
const MultiSedeDashboard = () => {
  const navigate = useNavigate();
  const { setSedes, setLoadingSedes } = useSede();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);

  const cargar = async () => {
    setLoading(true);
    setLoadingSedes(true);
    try {
      const res = await getDashboardConsolidado();
      setData(res);
      setSedes(res.sedes || []);
    } catch (err) {
      toast.error('Error al cargar el dashboard consolidado');
    } finally {
      setLoading(false);
      setLoadingSedes(false);
    }
  };

  useEffect(() => { cargar(); }, []);

  const totales = data?.totales || {};
  const sedes   = data?.sedes   || [];

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Encabezado */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--jet)' }}>Dashboard Multi-Sede</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--ash)' }}>
            Vista consolidada de todas las sedes
          </p>
        </div>
        <button
          onClick={cargar}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm"
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
          Actualizar
        </button>
      </div>

      {/* Resumen global */}
      {loading ? (
        <SkeletonSummary />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          {[
            { icon: Users,       label: 'Total alumnos',    value: fmt(totales.alumnos_activos),              color: 'var(--pb)',  accent: 'var(--pb-light)' },
            { icon: DollarSign,  label: 'Deuda total USD',  value: `$${fmt(totales.deuda_total_usd, 2)}`, color: 'var(--red)', accent: 'var(--red-light)' },
            { icon: TrendingUp,  label: 'Pagos este mes',   value: `$${fmt(totales.pagos_mes_actual, 2)}`,    color: '#16a34a',   accent: '#dcfce7' },
          ].map(({ icon: Icon, label, value, color, accent }) => (
            <div
              key={label}
              className="rounded-xl p-4 flex items-center gap-4"
              style={{ background: 'var(--porcelain)', border: '0.5px solid var(--border-md)', borderLeft: `3px solid ${color}` }}
            >
              <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: accent }}>
                <Icon size={18} style={{ color }} />
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wide" style={{ color: 'var(--ash)' }}>{label}</p>
                <p className="text-xl font-bold mt-0.5" style={{ color: 'var(--jet)' }}>{value}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Grid de sedes */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide" style={{ color: 'var(--ash)' }}>
          Sedes ({sedes.length})
        </h2>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {[1,2,3,4,5,6].map(i => <SkeletonCard key={i} />)}
        </div>
      ) : sedes.length === 0 ? (
        <div className="rounded-xl p-10 text-center" style={{ background: 'var(--porcelain)', border: '0.5px solid var(--border-md)' }}>
          <Building2 size={32} className="mx-auto mb-3" style={{ color: 'var(--ash)' }} />
          <p className="text-sm" style={{ color: 'var(--ash)' }}>No hay sedes registradas.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {sedes.map(sede => (
            <SedeCard
              key={sede.id}
              sede={sede}
              onVerDetalle={(id) => navigate(`/multisede/${id}`)}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default MultiSedeDashboard;
