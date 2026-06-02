import { useNavigate } from 'react-router-dom';
import {
  Building2, Users, AlertTriangle,
  DollarSign, TrendingUp, RefreshCw,
} from 'lucide-react';
import { fmt } from '../utils/format';
import { useMultiSedeDashboard } from '../hooks/useMultiSedeDashboard';
import SedeCard from '../components/multisede/SedeCard';

// ── Skeletons ─────────────────────────────────────────────────────────────────
const SkeletonSummary = () => (
  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
    {[1, 2, 3].map(i => (
      <div
        key={i}
        className="rounded-xl p-4 animate-pulse"
        style={{ background: 'var(--porcelain)', border: '0.5px solid var(--border-md)' }}
      >
        <div className="h-3 w-20 rounded mb-2" style={{ background: 'var(--border-md)' }} />
        <div className="h-7 w-28 rounded"      style={{ background: 'var(--border-md)' }} />
      </div>
    ))}
  </div>
);

const SkeletonGrid = () => (
  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
    {[1, 2, 3, 4, 5, 6].map(i => (
      <div
        key={i}
        className="rounded-xl p-4 animate-pulse"
        style={{ background: 'var(--porcelain)', border: '0.5px solid var(--border-md)' }}
      >
        <div className="flex items-center justify-between mb-3">
          <div className="h-4 w-32 rounded" style={{ background: 'var(--border-md)' }} />
          <div className="h-5 w-14 rounded-full" style={{ background: 'var(--border-md)' }} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          {[1, 2, 3, 4].map(j => (
            <div key={j}>
              <div className="h-3 w-16 rounded mb-1" style={{ background: 'var(--border-md)' }} />
              <div className="h-5 w-20 rounded"      style={{ background: 'var(--border-md)' }} />
            </div>
          ))}
        </div>
        <div className="mt-3 h-1.5 rounded-full" style={{ background: 'var(--border-md)' }} />
      </div>
    ))}
  </div>
);

// ── Estado vacío ──────────────────────────────────────────────────────────────
const EmptyState = ({ onReintentar, esError }) => (
  <div
    className="rounded-xl p-10 text-center"
    style={{ background: 'var(--porcelain)', border: '0.5px solid var(--border-md)' }}
  >
    {esError
      ? <AlertTriangle size={32} className="mx-auto mb-3" style={{ color: 'var(--red)' }} />
      : <Building2    size={32} className="mx-auto mb-3" style={{ color: 'var(--ash)' }} />
    }
    <p className="text-sm" style={{ color: 'var(--ash)' }}>
      {esError ? 'No se pudo cargar la información.' : 'No hay sedes registradas.'}
    </p>
    {esError && (
      <button
        onClick={onReintentar}
        className="mt-4 text-sm underline cursor-pointer"
        style={{ color: 'var(--pb)' }}
      >
        Reintentar
      </button>
    )}
  </div>
);

// ── Tarjetas de resumen global ────────────────────────────────────────────────
const RESUMEN_ITEMS = [
  { icon: Users,      label: 'Total alumnos',  key: 'alumnos_activos',  prefix: '',  color: 'var(--pb)',  accent: 'var(--pb-light)', decimals: 0 },
  { icon: DollarSign, label: 'Deuda total USD', key: 'deuda_total_usd',  prefix: '$', color: 'var(--red)', accent: 'var(--red-light)', decimals: 2 },
  { icon: TrendingUp, label: 'Pagos este mes',  key: 'pagos_mes_actual', prefix: '$', color: '#16a34a',   accent: '#dcfce7',         decimals: 2 },
];

const ResumenGlobal = ({ totales }) => (
  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
    {RESUMEN_ITEMS.map(({ icon: Icon, label, key, prefix, color, accent, decimals }) => (
      <div
        key={label}
        className="rounded-xl p-4 flex items-center gap-4"
        style={{
          background:  'var(--porcelain)',
          border:      '0.5px solid var(--border-md)',
          borderLeft:  `3px solid ${color}`,
        }}
      >
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: accent }}
        >
          <Icon size={18} style={{ color }} aria-hidden="true" />
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-wide" style={{ color: 'var(--ash)' }}>
            {label}
          </p>
          <p className="text-xl font-bold mt-0.5" style={{ color: 'var(--jet)' }}>
            {prefix}{fmt(totales[key], decimals)}
          </p>
        </div>
      </div>
    ))}
  </div>
);

// ── Página ────────────────────────────────────────────────────────────────────
const MultiSedeDashboard = () => {
  const navigate = useNavigate();
  const { loading, error, cargar, totales, sedes } = useMultiSedeDashboard();

  const mostrarError = !loading && error;
  const mostrarVacio = !loading && !error && sedes.length === 0;
  const mostrarGrid  = !loading && !error && sedes.length > 0;

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto">
      {/* Encabezado */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--jet)' }}>
            Dashboard Multi-Sede
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--ash)' }}>
            Vista consolidada de todas las sedes
          </p>
        </div>

        <button
          onClick={cargar}
          disabled={loading}
          aria-label="Actualizar datos"
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors duration-150
            ${loading
              ? 'opacity-50 cursor-not-allowed'
              : 'cursor-pointer hover:bg-[var(--ash-light)]'
            }`}
          style={{
            background: 'var(--porcelain)',
            border:     '0.5px solid var(--border-md)',
            color:      'var(--ash)',
          }}
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} aria-hidden="true" />
          Actualizar
        </button>
      </div>

      {/* Resumen global */}
      {loading
        ? <SkeletonSummary />
        : !error && <ResumenGlobal totales={totales} />
      }

      {/* Encabezado del grid */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide" style={{ color: 'var(--ash)' }}>
          Sedes {!loading && `(${sedes.length})`}
        </h2>
      </div>

      {/* Grid de sedes */}
      {loading && <SkeletonGrid />}

      {(mostrarError || mostrarVacio) && (
        <EmptyState esError={mostrarError} onReintentar={cargar} />
      )}

      {mostrarGrid && (
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
