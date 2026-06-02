import { useParams, useNavigate } from 'react-router-dom';
import {
  Users, AlertTriangle, DollarSign,
  TrendingUp, ArrowLeft, RefreshCw, GraduationCap, AlertCircle,
} from 'lucide-react';
import { fmt } from '../utils/format';
import { useSedeDetalle } from '../hooks/useSedeDetalle';
import PagosTable from '../components/multisede/PagosTable';
import MorososList from '../components/multisede/MorososList';

// ── Skeleton ──────────────────────────────────────────────────────────────────
const Skeleton = ({ h = 4, w = 'full', className = '' }) => (
  <div
    className={`rounded animate-pulse ${className}`}
    style={{ height: h, width: w === 'full' ? '100%' : w, background: 'var(--border-md)' }}
  />
);

const SkeletonCards = () => (
  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
    {[1, 2, 3, 4].map(i => (
      <div
        key={i}
        className="rounded-xl p-4 animate-pulse"
        style={{ background: 'var(--porcelain)', border: '0.5px solid var(--border-md)' }}
      >
        <Skeleton h={3} w={80} className="mb-2" />
        <Skeleton h={6} w={100} />
      </div>
    ))}
  </div>
);

// ── MetricCard ────────────────────────────────────────────────────────────────
const MetricCard = ({ icon: Icon, label, value, color, accent, tooltip }) => (
  <div
    className="rounded-xl p-4"
    title={tooltip}
    style={{
      background: 'var(--porcelain)',
      border: '0.5px solid var(--border-md)',
      borderLeft: `3px solid ${color}`,
    }}
  >
    <div className="flex items-center gap-3">
      <div
        className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{ background: accent }}
      >
        <Icon size={16} style={{ color }} />
      </div>
      <div>
        <p className="text-[11px] uppercase tracking-wide" style={{ color: 'var(--ash)' }}>{label}</p>
        <p className="text-lg font-bold mt-0.5" style={{ color: 'var(--jet)' }}>{value}</p>
      </div>
    </div>
  </div>
);

// ── Panel ─────────────────────────────────────────────────────────────────────
const Panel = ({ title, icon: Icon, iconColor, action, children, className = '' }) => (
  <div
    className={`rounded-xl p-4 ${className}`}
    style={{ background: 'var(--porcelain)', border: '0.5px solid var(--border-md)' }}
  >
    {title && (
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold flex items-center gap-2" style={{ color: 'var(--jet)' }}>
          {Icon && <Icon size={14} style={{ color: iconColor }} />}
          {title}
        </h2>
        {action}
      </div>
    )}
    {children}
  </div>
);

// ── Estado de error ───────────────────────────────────────────────────────────
const ErrorState = ({ onRetry }) => (
  <div className="flex flex-col items-center justify-center py-16 gap-3">
    <AlertCircle size={32} style={{ color: 'var(--ash)' }} />
    <p className="text-sm" style={{ color: 'var(--ash)' }}>No se pudieron cargar los datos de la sede</p>
    <button
      onClick={onRetry}
      className="px-4 py-2 rounded-lg text-sm font-medium transition-colors
                 bg-[var(--porcelain)] hover:bg-[var(--ash-light)]
                 border-[0.5px] border-[var(--border-md)] text-[var(--ash)]"
    >
      Reintentar
    </button>
  </div>
);

// ── Botón ghost ───────────────────────────────────────────────────────────────
const BtnGhost = ({ onClick, disabled, children, ariaLabel }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    aria-label={ariaLabel}
    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm flex-shrink-0
               bg-[var(--porcelain)] hover:bg-[var(--ash-light)]
               border-[0.5px] border-[var(--border-md)] text-[var(--ash)]
               transition-colors disabled:opacity-50 disabled:pointer-events-none"
  >
    {children}
  </button>
);

// ── Página ────────────────────────────────────────────────────────────────────
const SedeDetalle = () => {
  const { sedeId }  = useParams();
  const navigate    = useNavigate();
  const { loading, error, cargar, sede, metricas, ultimosPagos, alumnosPorGrado, morosos } =
    useSedeDetalle(sedeId);

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <BtnGhost onClick={() => navigate('/multisede')} ariaLabel="Volver a multisede">
            <ArrowLeft size={13} aria-hidden="true" />
            Volver
          </BtnGhost>
          <div className="min-w-0">
            {loading ? (
              <Skeleton h={5} w={200} />
            ) : (
              <>
                <h1 className="text-xl font-bold truncate" style={{ color: 'var(--jet)' }}>
                  {sede.nombre || `Sede #${sedeId}`}
                </h1>
                {(sede.municipio || sede.estado) && (
                  <p className="text-sm mt-0.5" style={{ color: 'var(--ash)' }}>
                    {[sede.municipio, sede.estado].filter(Boolean).join(', ')}
                  </p>
                )}
              </>
            )}
          </div>
        </div>
        <BtnGhost onClick={cargar} disabled={loading} ariaLabel="Actualizar datos de la sede">
          <RefreshCw size={13} aria-hidden="true" className={loading ? 'animate-spin' : ''} />
        </BtnGhost>
      </div>

      {/* Error state */}
      {!loading && error && <ErrorState onRetry={cargar} />}

      {!error && (
        <>
          {/* Métricas */}
          {loading ? (
            <SkeletonCards />
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
              <MetricCard
                icon={Users}
                label="Alumnos activos"
                value={fmt(metricas.alumnos_activos)}
                color="var(--pb)"
                accent="var(--pb-light)"
                tooltip="Total de alumnos con matrícula activa en esta sede"
              />
              <MetricCard
                icon={AlertTriangle}
                label="Morosos"
                value={fmt(metricas.morosos)}
                color="var(--red)"
                accent="var(--red-light)"
                tooltip="Alumnos con facturas vencidas sin pagar"
              />
              <MetricCard
                icon={DollarSign}
                label="Deuda USD"
                value={`$${fmt(metricas.deuda_total_usd, 2)}`}
                color="var(--red)"
                accent="var(--red-light)"
                tooltip="Suma total de deuda en dólares de todos los alumnos morosos"
              />
              <MetricCard
                icon={TrendingUp}
                label="Pagos del mes"
                value={`$${fmt(metricas.pagos_mes_actual, 2)}`}
                color="var(--green)"
                accent="var(--green-light)"
                tooltip="Total recaudado en el mes en curso"
              />
            </div>
          )}

          {/* Grid de secciones */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Últimos pagos */}
            <Panel title="Últimos pagos" className="lg:col-span-2">
              <PagosTable pagos={ultimosPagos} loading={loading} />
            </Panel>

            {/* Columna derecha */}
            <div className="flex flex-col gap-4">
              {/* Alumnos por grado */}
              <Panel title="Alumnos por grado" icon={GraduationCap} iconColor="var(--pb)">
                {loading ? (
                  <div className="space-y-2">
                    {[1, 2, 3].map(i => (
                      <div key={i} className="h-3 rounded animate-pulse" style={{ background: 'var(--border-md)' }} />
                    ))}
                  </div>
                ) : alumnosPorGrado.length === 0 ? (
                  <p className="text-xs" style={{ color: 'var(--ash)' }}>Sin datos</p>
                ) : (
                  <ul className="space-y-1.5">
                    {alumnosPorGrado.map(g => (
                      <li key={g.grado_seccion} className="flex items-center justify-between">
                        <span
                          className="text-xs truncate"
                          title={g.grado_seccion}
                          style={{ color: 'var(--jet)' }}
                        >
                          {g.grado_seccion}
                        </span>
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
              </Panel>

              {/* Morosos */}
              <Panel title="Morosos" icon={AlertTriangle} iconColor="var(--red)">
                <MorososList morosos={morosos} loading={loading} />
              </Panel>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default SedeDetalle;
