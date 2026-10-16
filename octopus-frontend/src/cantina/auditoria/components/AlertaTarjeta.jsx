import { Link } from 'react-router-dom';
import { AlertOctagon, AlertTriangle, ArrowUpRight, CalendarDays, CheckCircle2, Info, MapPin } from 'lucide-react';
import { ETIQUETA_AREA, ESTILO_TARJETA, fmtFechaCorta, fmtFechaHora } from './CierreFormato';
import { ESTILO_BOTON_PRIMARIO, REFERENCIA_A_OBJETO, SEVERIDADES_ALERTA } from './BitacoraFormato';

const ICONO_SEVERIDAD = { critica: AlertOctagon, advertencia: AlertTriangle, info: Info };

// Destino del enlace "ver objeto": un cierre tiene pantalla propia; un
// usuario o cualquier otro objeto abre la bitácora filtrada por él.
const destinoReferencia = (alerta) => {
  const { referencia_tipo: tipo, referencia_id: id } = alerta;
  if (!tipo || id == null || id === '') return null;
  if (tipo === 'cierre') return { to: `/cantina/auditoria/cierres/${id}`, texto: `Ver cierre #${id}` };
  if (tipo === 'usuario') return { to: `?tab=bitacora&usuario=${encodeURIComponent(id)}`, texto: 'Ver acciones del usuario' };
  const objeto = REFERENCIA_A_OBJETO[tipo];
  if (!objeto) return null;
  return {
    to: `?tab=bitacora&objeto_tipo=${objeto}&objeto_id=${encodeURIComponent(id)}`,
    texto: 'Ver en la bitácora',
  };
};

// Tarjeta de una alerta (§6). Las abiertas ofrecen "Atender".
export default function AlertaTarjeta({ alerta, onAtender }) {
  const sev = SEVERIDADES_ALERTA[alerta.severidad] ?? SEVERIDADES_ALERTA.info;
  const Icono = ICONO_SEVERIDAD[alerta.severidad] ?? Info;
  const abierta = alerta.estado === 'abierta';
  const destino = destinoReferencia(alerta);

  return (
    <li
      className="rounded-2xl p-3 sm:p-4 flex flex-col gap-3 min-w-0"
      style={{ ...ESTILO_TARJETA, boxShadow: `inset 3px 0 0 ${sev.color}` }}
    >
      <div className="flex items-start gap-3 min-w-0">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl" style={{ background: sev.fondo, color: sev.color }}>
          <Icono size={18} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="px-2 py-0.5 rounded-md text-xs font-semibold uppercase tracking-wider" style={{ background: sev.fondo, color: sev.color }}>
              {sev.texto}
            </span>
            <span className="text-xs" style={{ color: 'var(--jet-mid)' }}>{alerta.tipo_etiqueta ?? alerta.tipo}</span>
            {!abierta && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium" style={{ background: 'var(--green-light)', color: 'var(--green)' }}>
                <CheckCircle2 size={12} aria-hidden="true" />
                Atendida
              </span>
            )}
          </div>
          <p className="mt-1 text-sm font-semibold [overflow-wrap:anywhere]" style={{ color: 'var(--jet)' }}>{alerta.titulo}</p>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs" style={{ color: 'var(--ash)' }}>
            <span className="inline-flex items-center gap-1">
              <CalendarDays size={12} aria-hidden="true" />
              {fmtFechaCorta(alerta.fecha)}
            </span>
            {alerta.area && (
              <span className="inline-flex items-center gap-1">
                <MapPin size={12} aria-hidden="true" />
                {ETIQUETA_AREA[alerta.area] ?? alerta.area}
              </span>
            )}
          </p>
        </div>
      </div>

      {!abierta && (alerta.nota_atencion || alerta.atendida_por) && (
        <div className="rounded-xl px-3 py-2 text-xs flex flex-col gap-0.5 [overflow-wrap:anywhere]" style={{ background: 'var(--surface-sunken)', color: 'var(--jet-mid)' }}>
          <span style={{ color: 'var(--ash)' }}>
            Atendida por {alerta.atendida_por?.nombre ?? '—'}
            {alerta.atendida_en && ` · ${fmtFechaHora(alerta.atendida_en)}`}
          </span>
          {alerta.nota_atencion && <span>“{alerta.nota_atencion}”</span>}
        </div>
      )}

      {(destino || abierta) && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          {destino ? (
            <Link
              to={destino.to}
              className="inline-flex items-center justify-center sm:justify-start gap-1 min-h-[40px] px-2.5 rounded-lg text-sm font-medium hover:bg-[var(--jet-light)]"
              style={{ color: 'var(--pb-mid)' }}
            >
              {destino.texto}
              <ArrowUpRight size={15} aria-hidden="true" />
            </Link>
          ) : <span className="hidden sm:block" />}
          {abierta && (
            <button
              type="button"
              onClick={() => onAtender(alerta)}
              className="inline-flex items-center justify-center gap-1.5 min-h-[44px] px-4 rounded-xl text-sm font-semibold w-full sm:w-auto"
              style={ESTILO_BOTON_PRIMARIO}
            >
              <CheckCircle2 size={16} aria-hidden="true" />
              Atender
            </button>
          )}
        </div>
      )}
    </li>
  );
}

export function AlertaTarjetaSkeleton() {
  return (
    <ul className="grid grid-cols-1 lg:grid-cols-2 gap-3" aria-busy="true" aria-label="Cargando alertas">
      {[0, 1, 2, 3].map((i) => (
        <li key={i} className="rounded-2xl p-4 flex gap-3" style={ESTILO_TARJETA}>
          <div className="size-10 rounded-xl motion-safe:animate-pulse shrink-0" style={{ background: 'var(--border)' }} />
          <div className="flex-1 flex flex-col gap-2">
            <div className="h-3 w-1/3 rounded-md motion-safe:animate-pulse" style={{ background: 'var(--border)' }} />
            <div className="h-4 w-4/5 rounded-md motion-safe:animate-pulse" style={{ background: 'var(--border)' }} />
            <div className="h-3 w-1/4 rounded-md motion-safe:animate-pulse" style={{ background: 'var(--border)' }} />
            <div className="h-11 w-full sm:w-28 sm:self-end rounded-xl motion-safe:animate-pulse mt-1" style={{ background: 'var(--border)' }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
