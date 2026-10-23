import { Ban, PencilLine, SearchX } from 'lucide-react';
import { TablaScroll } from '../../../components/ui/TablaScroll';
import { etiquetaMetodo } from '../../../components/cantina/metodoPagoUtils';
import { ESTILO_TARJETA, ETIQUETA_AREA, fmtFechaHora, usd } from './CierreFormato';

const ESTADOS_VENTA = {
  completada: { texto: 'Completada', color: 'var(--green)', fondo: 'var(--green-light)' },
  anulada: { texto: 'Anulada', color: 'var(--red)', fondo: 'var(--red-light)' },
};

function Insignia({ color, fondo, children }) {
  return (
    <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap" style={{ color, background: fondo }}>
      {children}
    </span>
  );
}

function EstadoVenta({ venta }) {
  const meta = ESTADOS_VENTA[venta.estado] ?? { texto: venta.estado ?? '—', color: 'var(--jet-mid)', fondo: 'var(--jet-light)' };
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <Insignia color={meta.color} fondo={meta.fondo}>{meta.texto}</Insignia>
      {venta.corregida && <Insignia color="var(--violet)" fondo="var(--violet-light)">Corregida</Insignia>}
      {venta.cierre_cerrado && <Insignia color="var(--jet-mid)" fondo="var(--jet-light)">Turno cerrado</Insignia>}
    </span>
  );
}

const idDe = (v) => v.id ?? v.venta_id;
const puedeCorregir = (v) => (v.corregible ?? v.estado !== 'anulada');
const fechaDe = (v) => v.fecha ?? v.fecha_hora;

function BotonCorregir({ venta, onCorregir, className = '' }) {
  if (!puedeCorregir(venta)) {
    return (
      <span className={`inline-flex items-center gap-1 text-xs ${className}`} style={{ color: 'var(--ash)' }}>
        <Ban size={14} aria-hidden="true" /> Anulada
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={() => onCorregir(venta)}
      aria-label={`Corregir venta ${idDe(venta)}`}
      className={`inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl px-3 text-sm font-semibold transition-colors hover:brightness-95 ${className}`}
      style={{ background: 'var(--pb-light)', color: 'var(--pb-mid)' }}
    >
      <PencilLine size={15} aria-hidden="true" />
      Corregir
    </button>
  );
}

export function CorreccionVentasSkeleton() {
  return (
    <div className="flex flex-col gap-3" aria-busy="true" aria-label="Cargando ventas">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="h-20 animate-pulse rounded-2xl" style={{ background: 'var(--border)' }} />
      ))}
    </div>
  );
}

// Resultados del buscador de ventas: tarjetas en móvil, tabla desde sm.
export default function CorreccionVentas({ ventas, buscando, onCorregir }) {
  if (ventas.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-2xl p-8 text-center sm:p-12" style={{ ...ESTILO_TARJETA, borderStyle: 'dashed' }}>
        <SearchX size={28} aria-hidden="true" style={{ color: 'var(--ash)' }} />
        <p className="text-sm font-medium" style={{ color: 'var(--jet)' }}>
          {buscando ? 'No hay ventas que coincidan con la búsqueda.' : 'Busca una venta para corregirla.'}
        </p>
        <p className="max-w-sm text-xs" style={{ color: 'var(--ash)' }}>
          Escribe el número de venta, el nombre del cajero o del alumno, o ajusta el rango de fechas.
        </p>
      </div>
    );
  }

  return (
    <>
      <ul className="flex flex-col gap-3 sm:hidden">
        {ventas.map((v) => (
          <li key={idDe(v)} className="flex flex-col gap-3 rounded-2xl p-3" style={ESTILO_TARJETA}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-semibold" style={{ color: 'var(--jet)' }}>Venta #{idDe(v)}</p>
                <p className="truncate text-xs" style={{ color: 'var(--ash)' }}>
                  {v.cajero?.nombre ?? '—'} · {fmtFechaHora(fechaDe(v))}
                </p>
                {v.cliente?.nombre && <p className="truncate text-xs" style={{ color: 'var(--jet-mid)' }}>{v.cliente.nombre}</p>}
              </div>
              <p className="shrink-0 font-mono text-base font-semibold tabular-nums" style={{ color: 'var(--jet)' }}>{usd(v.total_usd)}</p>
            </div>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs" style={{ color: 'var(--jet-mid)' }}>
              <EstadoVenta venta={v} />
              <span>{etiquetaMetodo(v.metodo_pago)}</span>
              <span>· {ETIQUETA_AREA[v.area] ?? v.area ?? '—'}</span>
              {Number(v.descuento_usd) > 0 && <span>· Desc. {usd(v.descuento_usd)}</span>}
            </div>
            <BotonCorregir venta={v} onCorregir={onCorregir} className="w-full" />
          </li>
        ))}
      </ul>

      <div className="hidden overflow-hidden rounded-2xl sm:block" style={ESTILO_TARJETA}>
        <TablaScroll>
          <table className="w-full min-w-[920px] text-sm">
            <thead>
              <tr style={{ background: 'var(--porcelain)' }}>
                {['Venta', 'Fecha', 'Cajero', 'Cliente', 'Área', 'Método', 'Descuento', 'Total', 'Estado', ''].map((t, i) => (
                  <th
                    key={t || i}
                    scope="col"
                    className={`px-3 py-2.5 text-xs font-medium uppercase tracking-wider ${i === 6 || i === 7 ? 'text-right' : 'text-left'}`}
                    style={{ color: 'var(--ash)' }}
                  >
                    {t || <span className="sr-only">Acciones</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ventas.map((v) => (
                <tr key={idDe(v)} className="transition-colors hover:bg-[var(--porcelain)]" style={{ borderTop: '0.5px solid var(--border)' }}>
                  <td className="px-3 py-2.5 font-mono font-medium" style={{ color: 'var(--jet)' }}>#{idDe(v)}</td>
                  <td className="whitespace-nowrap px-3 py-2.5" style={{ color: 'var(--jet-mid)' }}>{fmtFechaHora(fechaDe(v))}</td>
                  <td className="px-3 py-2.5" style={{ color: 'var(--jet)' }}>{v.cajero?.nombre ?? '—'}</td>
                  <td className="px-3 py-2.5" style={{ color: 'var(--jet-mid)' }}>{v.cliente?.nombre ?? '—'}</td>
                  <td className="px-3 py-2.5" style={{ color: 'var(--jet-mid)' }}>{ETIQUETA_AREA[v.area] ?? v.area ?? '—'}</td>
                  <td className="px-3 py-2.5" style={{ color: 'var(--jet-mid)' }}>{etiquetaMetodo(v.metodo_pago)}</td>
                  <td className="px-3 py-2.5 text-right font-mono tabular-nums" style={{ color: 'var(--jet-mid)' }}>{usd(v.descuento_usd)}</td>
                  <td className="px-3 py-2.5 text-right font-mono font-semibold tabular-nums" style={{ color: 'var(--jet)' }}>{usd(v.total_usd)}</td>
                  <td className="px-3 py-2.5"><EstadoVenta venta={v} /></td>
                  <td className="px-3 py-1.5 text-right"><BotonCorregir venta={v} onCorregir={onCorregir} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </TablaScroll>
      </div>
    </>
  );
}
