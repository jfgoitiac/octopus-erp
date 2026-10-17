import { Link } from 'react-router-dom';
import { ChevronRight, History, Inbox, Paperclip } from 'lucide-react';
import { TablaScroll } from '../../../components/ui/TablaScroll';
import EstadoRevisionBadge from './EstadoRevisionBadge';
import {
  ESTILO_TARJETA, ETIQUETA_AREA, colorDiferencia, fmtFecha, fmtFechaCorta, fondoDiferencia, usd, usdConSigno,
} from './CierreFormato';

function Indicadores({ cierre }) {
  if (!cierre.tiene_adjuntos && !cierre.fue_reabierto) return null;
  return (
    <span className="inline-flex items-center gap-1.5" style={{ color: 'var(--ash)' }}>
      {cierre.tiene_adjuntos && (
        <span title="Tiene adjuntos" className="inline-flex"><Paperclip size={14} aria-label="Tiene adjuntos" /></span>
      )}
      {cierre.fue_reabierto && (
        <span title="Caja reabierta" className="inline-flex" style={{ color: 'var(--violet)' }}>
          <History size={14} aria-label="Caja reabierta" />
        </span>
      )}
    </span>
  );
}

function Diferencia({ valor, className = '' }) {
  return (
    <span className={`font-mono font-semibold tabular-nums ${className}`} style={{ color: colorDiferencia(valor) }}>
      {usdConSigno(valor)}
    </span>
  );
}

export function CierreListaSkeleton({ filas = 5 }) {
  return (
    <div className="flex flex-col gap-2" aria-busy="true" aria-label="Cargando cierres">
      {Array.from({ length: filas }).map((_, i) => (
        <div key={i} className="h-24 sm:h-12 rounded-2xl animate-pulse" style={{ background: 'var(--border)' }} />
      ))}
    </div>
  );
}

// Lista de cierres: tarjetas apiladas en móvil, tabla con scroll propio desde sm.
export default function CierreLista({ cierres }) {
  if (cierres.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-2xl p-8 sm:p-12 text-center" style={ESTILO_TARJETA}>
        <Inbox size={28} aria-hidden="true" style={{ color: 'var(--ash)' }} />
        <p className="text-sm font-medium" style={{ color: 'var(--jet)' }}>No hay cierres con estos filtros</p>
        <p className="text-xs" style={{ color: 'var(--ash)' }}>Prueba ampliando el rango de fechas o quitando filtros.</p>
      </div>
    );
  }

  return (
    <>
      {/* Móvil: tarjetas */}
      <ul className="flex flex-col gap-2 sm:hidden">
        {cierres.map((c) => (
          <li key={c.id}>
            <Link
              to={String(c.id)}
              className="flex flex-col gap-2 rounded-2xl p-3 active:scale-[0.99] transition-transform"
              style={ESTILO_TARJETA}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate" style={{ color: 'var(--jet)' }}>{c.cajero?.nombre ?? '—'}</p>
                  <p className="text-xs truncate" style={{ color: 'var(--ash)' }}>
                    {fmtFecha(c.fecha)} · {ETIQUETA_AREA[c.area] ?? c.area}
                  </p>
                </div>
                <EstadoRevisionBadge estado={c.estado_revision} />
              </div>
              <div className="flex items-end justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs truncate" style={{ color: 'var(--ash)' }}>{c.turno?.etiqueta}</p>
                  <p className="text-xs" style={{ color: 'var(--jet-mid)' }}>
                    Ventas <span className="font-mono">{usd(c.total_ventas_usd)}</span>
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Indicadores cierre={c} />
                  <Diferencia valor={c.diferencia_usd} className="text-base" />
                  <ChevronRight size={16} aria-hidden="true" style={{ color: 'var(--ash)' }} />
                </div>
              </div>
            </Link>
          </li>
        ))}
      </ul>

      {/* sm en adelante: tabla */}
      <div className="hidden sm:block rounded-2xl overflow-hidden" style={ESTILO_TARJETA}>
        <TablaScroll>
          <table className="w-full text-sm min-w-[860px]">
            <thead>
              <tr style={{ background: 'var(--porcelain)' }}>
                {['Fecha', 'Cajero', 'Turno', 'Área', 'Ventas', 'Esperado', 'Conteo', 'Diferencia', 'Revisión', ''].map((t, i) => (
                  <th
                    key={t || i}
                    scope="col"
                    className={`px-3 py-2.5 font-medium text-xs uppercase tracking-wider ${i >= 4 && i <= 7 ? 'text-right' : 'text-left'}`}
                    style={{ color: 'var(--ash)' }}
                  >
                    {t || <span className="sr-only">Indicadores</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cierres.map((c) => {
                const conDiferencia = Number(c.diferencia_usd) !== 0;
                return (
                  <tr
                    key={c.id}
                    className="group hover:bg-[var(--pb-light)] transition-colors"
                    style={{ borderTop: '0.5px solid var(--border-md)' }}
                  >
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <Link to={String(c.id)} className="font-medium hover:underline" style={{ color: 'var(--jet)' }}>
                        {fmtFechaCorta(c.fecha)}
                      </Link>
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap" style={{ color: 'var(--jet)' }}>{c.cajero?.nombre ?? '—'}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-xs" style={{ color: 'var(--jet-mid)' }}>{c.turno?.etiqueta ?? '—'}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap" style={{ color: 'var(--jet-mid)' }}>{ETIQUETA_AREA[c.area] ?? c.area}</td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums" style={{ color: 'var(--jet)' }}>{usd(c.total_ventas_usd)}</td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums" style={{ color: 'var(--jet-mid)' }}>{usd(c.esperado_efectivo_usd)}</td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums" style={{ color: 'var(--jet-mid)' }}>{usd(c.conteo_fisico_usd)}</td>
                    <td className="px-3 py-2.5 text-right">
                      <span
                        className="inline-block rounded-lg px-2 py-0.5"
                        style={conDiferencia ? { background: fondoDiferencia(c.diferencia_usd) } : undefined}
                      >
                        <Diferencia valor={c.diferencia_usd} />
                      </span>
                    </td>
                    <td className="px-3 py-2.5"><EstadoRevisionBadge estado={c.estado_revision} /></td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center justify-end gap-2">
                        <Indicadores cierre={c} />
                        <Link
                          to={String(c.id)}
                          aria-label={`Ver cierre #${c.id}`}
                          className="inline-flex items-center justify-center w-8 h-8 rounded-lg group-hover:bg-white"
                          style={{ color: 'var(--pb-mid)' }}
                        >
                          <ChevronRight size={16} aria-hidden="true" />
                        </Link>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TablaScroll>
      </div>
    </>
  );
}
