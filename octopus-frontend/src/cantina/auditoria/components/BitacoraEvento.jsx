import { useId, useState } from 'react';
import { ArrowRight, ChevronDown, Clock, MapPin, MessageSquareText, User } from 'lucide-react';
import { ETIQUETA_AREA, ESTILO_TARJETA, fmtFechaHora } from './CierreFormato';
import {
  COLOR_TIPO_EVENTO, OBJETO_ETIQUETA, ROL_ETIQUETA, diferenciasEvento, etiquetaCampo, formatearValor,
} from './BitacoraFormato';

// Detalle antes → después: una fila por campo; las que cambiaron se resaltan.
function BitacoraCambios({ filas }) {
  return (
    <dl className="flex flex-col gap-1.5 rounded-xl p-2.5 sm:p-3 text-xs" style={{ background: 'var(--porcelain)', border: '0.5px solid var(--border)' }}>
      {filas.map((f) => (
        <div
          key={f.clave}
          className="flex flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-3 rounded-lg px-2 py-1.5 min-w-0"
          style={f.cambio ? { background: 'var(--yellow-light)', boxShadow: 'inset 3px 0 0 var(--amber-ink)' } : undefined}
        >
          <dt className="sm:w-44 shrink-0 font-medium" style={{ color: f.cambio ? 'var(--amber-ink)' : 'var(--ash)' }}>
            {etiquetaCampo(f.clave)}
            {f.cambio && <span className="sr-only"> (cambió)</span>}
          </dt>
          <dd className="flex flex-wrap items-center gap-1.5 min-w-0 [overflow-wrap:anywhere]" style={{ color: 'var(--jet)' }}>
            {f.tieneAntes && (
              <span className={f.cambio ? 'line-through' : ''} style={f.cambio ? { color: 'var(--ash)' } : undefined}>
                {formatearValor(f.clave, f.antes)}
              </span>
            )}
            {f.cambio && <ArrowRight size={12} aria-hidden="true" style={{ color: 'var(--amber-ink)' }} />}
            {f.tieneDespues && (f.cambio || !f.tieneAntes) && (
              <span className="font-semibold">{formatearValor(f.clave, f.despues)}</span>
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}

// Un evento de la bitácora (§5). Solo lectura: no hay editar ni borrar.
export default function BitacoraEvento({ evento }) {
  const detalleId = useId();
  const [abierto, setAbierto] = useState(false);
  const filas = diferenciasEvento(evento.antes, evento.despues);
  const cambiados = filas.filter((f) => f.cambio).length;
  const color = COLOR_TIPO_EVENTO[evento.tipo] ?? 'var(--ash)';
  const objeto = evento.objeto_etiqueta
    || (evento.objeto_tipo ? `${OBJETO_ETIQUETA[evento.objeto_tipo] ?? evento.objeto_tipo} #${evento.objeto_id}` : null);

  return (
    <li className="rounded-2xl p-3 sm:p-4 flex flex-col gap-2.5 min-w-0" style={{ ...ESTILO_TARJETA, boxShadow: `inset 3px 0 0 ${color}` }}>
      <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold [overflow-wrap:anywhere]" style={{ color: 'var(--jet)' }}>
            {evento.tipo_etiqueta ?? evento.tipo}
            {objeto && <span className="font-normal" style={{ color: 'var(--jet-mid)' }}> · {objeto}</span>}
          </p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs" style={{ color: 'var(--jet-mid)' }}>
            <span className="inline-flex items-center gap-1">
              <User size={12} aria-hidden="true" style={{ color: 'var(--ash)' }} />
              {evento.usuario?.nombre ?? 'Sistema'}
              {evento.usuario_rol && (
                <span className="ml-1 px-1.5 py-0.5 rounded-md text-[11px]" style={{ background: 'var(--surface-sunken)', color: 'var(--jet-mid)' }}>
                  {ROL_ETIQUETA[evento.usuario_rol] ?? evento.usuario_rol}
                </span>
              )}
            </span>
            {evento.area && (
              <span className="inline-flex items-center gap-1">
                <MapPin size={12} aria-hidden="true" style={{ color: 'var(--ash)' }} />
                {ETIQUETA_AREA[evento.area] ?? evento.area}
              </span>
            )}
          </p>
        </div>
        <time dateTime={evento.creado_en} className="inline-flex items-center gap-1 text-xs shrink-0" style={{ color: 'var(--ash)' }}>
          <Clock size={12} aria-hidden="true" />
          {fmtFechaHora(evento.creado_en)}
        </time>
      </div>

      {evento.motivo && (
        <p className="flex items-start gap-1.5 text-xs rounded-xl px-2.5 py-2 [overflow-wrap:anywhere]" style={{ background: 'var(--surface-sunken)', color: 'var(--jet-mid)' }}>
          <MessageSquareText size={13} aria-hidden="true" className="mt-px shrink-0" style={{ color: 'var(--ash)' }} />
          <span><span className="font-medium" style={{ color: 'var(--jet)' }}>Motivo:</span> {evento.motivo}</span>
        </p>
      )}

      {filas.length > 0 && (
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => setAbierto((v) => !v)}
            aria-expanded={abierto}
            aria-controls={detalleId}
            className="self-start inline-flex items-center gap-1.5 min-h-[36px] px-2.5 -ml-1 rounded-lg text-xs font-medium hover:bg-[var(--jet-light)]"
            style={{ color: 'var(--pb-mid)' }}
          >
            <ChevronDown size={14} aria-hidden="true" className={`transition-transform ${abierto ? 'rotate-180' : ''}`} />
            {abierto ? 'Ocultar detalle' : 'Ver detalle'}
            {cambiados > 0 && (
              <span className="px-1.5 py-0.5 rounded-md text-[11px]" style={{ background: 'var(--yellow-light)', color: 'var(--amber-ink)' }}>
                {cambiados} cambio{cambiados === 1 ? '' : 's'}
              </span>
            )}
          </button>
          {abierto && (
            <div id={detalleId}>
              <BitacoraCambios filas={filas} />
            </div>
          )}
        </div>
      )}
    </li>
  );
}

export function BitacoraEventoSkeleton() {
  return (
    <ul className="flex flex-col gap-3" aria-busy="true" aria-label="Cargando eventos">
      {[0, 1, 2, 3].map((i) => (
        <li key={i} className="rounded-2xl p-4 flex flex-col gap-2.5" style={ESTILO_TARJETA}>
          <div className="flex items-start justify-between gap-3">
            <div className="h-4 w-2/3 sm:w-1/3 rounded-md animate-pulse" style={{ background: 'var(--border)' }} />
            <div className="hidden sm:block h-3 w-28 rounded-md animate-pulse" style={{ background: 'var(--border)' }} />
          </div>
          <div className="h-3 w-1/2 sm:w-1/4 rounded-md animate-pulse" style={{ background: 'var(--border)' }} />
          <div className="h-8 w-full rounded-xl animate-pulse" style={{ background: 'var(--border)' }} />
        </li>
      ))}
    </ul>
  );
}
