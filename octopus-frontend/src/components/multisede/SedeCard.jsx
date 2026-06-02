import { Building2, AlertTriangle, ArrowRight } from 'lucide-react';
import { fmt } from '../../utils/format';

// Umbrales configurables: >15% morosos = peligro, >8% = advertencia
const UMBRAL_PELIGRO    = 15;
const UMBRAL_ADVERTENCIA = 8;

const ProgressBar = ({ value, max }) => {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  const color =
    pct > UMBRAL_PELIGRO    ? 'var(--red)' :
    pct > UMBRAL_ADVERTENCIA ? '#d97706'   :
    'var(--pb)';

  return (
    <div
      className="w-full rounded-full overflow-hidden mt-3"
      style={{ height: 4, background: 'var(--border-md)' }}
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label="Porcentaje de morosos"
    >
      <div
        style={{
          width: `${pct}%`,
          height: '100%',
          background: color,
          borderRadius: 999,
          transition: 'width 0.6s ease',
        }}
      />
    </div>
  );
};

const SedeCard = ({ sede, onVerDetalle }) => {
  const morososPct   = sede.alumnos_activos > 0
    ? ((sede.morosos / sede.alumnos_activos) * 100).toFixed(1)
    : 0;
  const alertaMorosos = Number(morososPct) > UMBRAL_PELIGRO;

  return (
    <article
      className="rounded-xl p-4 card-lift"
      style={{
        background:    'var(--porcelain)',
        border:        '0.5px solid var(--border-md)',
        borderLeft:    `3px solid ${sede.activa ? 'var(--pb)' : 'var(--ash)'}`,
      }}
    >
      {/* Encabezado */}
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
            color:      sede.activa ? 'var(--pb-mid)'   : 'var(--ash)',
          }}
        >
          {sede.activa ? 'Activa' : 'Inactiva'}
        </span>
      </div>

      {/* Métricas 2×2 */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-wide mb-0.5" style={{ color: 'var(--ash)' }}>
            Alumnos
          </p>
          <p className="text-base font-bold" style={{ color: 'var(--jet)' }}>
            {fmt(sede.alumnos_activos)}
          </p>
        </div>

        <div>
          <p className="text-[10px] uppercase tracking-wide mb-0.5" style={{ color: 'var(--ash)' }}>
            Morosos{' '}
            {alertaMorosos && (
              <AlertTriangle size={10} className="inline" style={{ color: 'var(--red)' }} aria-hidden="true" />
            )}
          </p>
          <p className="text-base font-bold" style={{ color: alertaMorosos ? 'var(--red)' : 'var(--jet)' }}>
            {fmt(sede.morosos)}
            <span className="text-[10px] ml-1 font-normal" style={{ color: 'var(--ash)' }}>
              ({morososPct}%)
            </span>
          </p>
        </div>

        <div>
          <p className="text-[10px] uppercase tracking-wide mb-0.5" style={{ color: 'var(--ash)' }}>
            Deuda USD
          </p>
          <p className="text-base font-bold" style={{ color: 'var(--red)' }}>
            ${fmt(sede.deuda_total_usd, 2)}
          </p>
        </div>

        <div>
          <p className="text-[10px] uppercase tracking-wide mb-0.5" style={{ color: 'var(--ash)' }}>
            Pagos mes
          </p>
          <p className="text-base font-bold" style={{ color: '#16a34a' }}>
            ${fmt(sede.pagos_mes_actual, 2)}
          </p>
        </div>
      </div>

      <ProgressBar value={sede.morosos} max={sede.alumnos_activos} />

      <button
        onClick={() => onVerDetalle(sede.id)}
        aria-label={`Ver detalle de ${sede.nombre}`}
        className="mt-3 w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg
                   text-xs font-medium cursor-pointer transition-colors duration-150
                   bg-[var(--pb-light)] text-[var(--pb-mid)]
                   hover:bg-[var(--pb)] hover:text-white"
      >
        Ver detalle
        <ArrowRight size={12} aria-hidden="true" />
      </button>
    </article>
  );
};

export default SedeCard;
