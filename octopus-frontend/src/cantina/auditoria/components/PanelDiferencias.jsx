import { Link } from 'react-router-dom';
import { ChevronRight, ClipboardCheck, Scale } from 'lucide-react';
import PanelTarjeta, { PanelVacio } from './PanelTarjeta';
import { fmtFecha, fmtUsdConSigno, tonoDiferencia } from './PanelFormato';

const ESTADOS = {
  pendiente: { texto: 'Pendiente', color: 'var(--jet-mid)', fondo: 'var(--jet-light)' },
  observado: { texto: 'Observado', color: 'var(--orange)', fondo: 'var(--orange-light)' },
  revisado: { texto: 'Revisado', color: 'var(--teal)', fondo: 'var(--teal-light)' },
  aprobado: { texto: 'Aprobado', color: 'var(--green)', fondo: 'var(--green-light)' },
};

// Cierres con diferencia ≠ 0 aún sin aprobar (máx. 5 según CONTRATO §2).
const PanelDiferencias = ({ diferencias }) => {
  const cierres = diferencias?.cierres ?? [];
  const tonoTotal = tonoDiferencia(diferencias?.monto_total_usd);

  return (
    <PanelTarjeta
      icono={Scale}
      titulo="Diferencias pendientes"
      contador={diferencias?.cantidad ?? 0}
      subtitulo={cierres.length ? (
        <>Total: <span className="tabular-nums" style={{ color: tonoTotal.color, fontWeight: 'var(--fw-semibold)' }}>
          {fmtUsdConSigno(diferencias?.monto_total_usd)}
        </span></>
      ) : null}
      enlace={{ to: '/cantina/auditoria/cierres', texto: 'Ver cierres' }}
    >
      {cierres.length === 0 ? (
        <PanelVacio icono={ClipboardCheck} texto="No hay cierres con diferencias por revisar." />
      ) : (
        <ul className="flex flex-col gap-2">
          {cierres.map((c) => {
            const tono = tonoDiferencia(c.diferencia_usd);
            const estado = ESTADOS[c.estado_revision] ?? ESTADOS.pendiente;
            return (
              <li key={c.id}>
                <Link
                  to={`/cantina/auditoria/cierres/${c.id}`}
                  className="group flex min-h-[44px] items-center gap-3 rounded-lg p-2.5 transition-colors hover:bg-[var(--surface-sunken)]"
                  style={{ border: '1px solid var(--border)' }}
                >
                  <span className="h-9 w-1 shrink-0 rounded-full" style={{ background: tono.color }} aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm" style={{ color: 'var(--jet)', fontWeight: 'var(--fw-medium)' }}>
                      Cierre #{c.id} · {c.cajero?.nombre ?? '—'}
                    </p>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs" style={{ color: 'var(--ash)' }}>
                      <span>{fmtFecha(c.fecha)}</span>
                      <span className="rounded-full px-1.5 py-px" style={{ background: estado.fondo, color: estado.color }}>
                        {estado.texto}
                      </span>
                    </div>
                  </div>
                  <span className="shrink-0 text-sm tabular-nums" style={{ color: tono.color, fontWeight: 'var(--fw-semibold)' }}>
                    {fmtUsdConSigno(c.diferencia_usd)}
                  </span>
                  <ChevronRight size={16} className="shrink-0 transition-transform group-hover:translate-x-0.5" style={{ color: 'var(--ash)' }} aria-hidden="true" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </PanelTarjeta>
  );
};

export default PanelDiferencias;
