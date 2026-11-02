import { ChevronLeft, ChevronRight, ShoppingCart } from 'lucide-react';
import { SkeletonLine } from './SkeletonCard';
import { fmtFecha } from '../utils/fechas';
import { fmtMonto } from '../utils/montos';

const usd = (valor) => `REF. ${fmtMonto(valor)}`;

// "2 × Empanada, 1 × Jugo": deja ver qué se compró sin abrir el detalle.
const resumenItems = (items = []) =>
  items.map((i) => `${i.cantidad} × ${i.producto_nombre}`).join(', ') || 'Compra sin detalle';

/**
 * EstadoCuentaConsumos — compras de cantina/librería de un alumno.
 * Props:
 *   estado: respuesta de GET cantina/consumos/ | null
 *   loading: boolean
 *   pagina: number
 *   onCambiarPagina: (pagina: number) => void
 *   onVerConsumo: (consumo) => void
 */
const EstadoCuentaConsumos = ({ estado, loading, pagina = 1, onCambiarPagina, onVerConsumo }) => {
  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-[var(--surface)] rounded-2xl p-4 border border-[var(--border)] space-y-2 animate-pulse">
            <div className="flex justify-between">
              <SkeletonLine width="w-2/5" height="h-4" />
              <SkeletonLine width="w-1/5" height="h-4" />
            </div>
            <SkeletonLine width="w-1/3" height="h-3" />
          </div>
        ))}
      </div>
    );
  }

  const consumos = estado?.results || [];
  const totalPaginas = estado?.total_pages || 1;

  if (!consumos.length) {
    return (
      <div className="bg-[var(--surface)] rounded-2xl p-8 border border-[var(--border)] text-center">
        <ShoppingCart size={32} className="text-[var(--border-md)] mx-auto mb-3" aria-hidden="true" />
        <p className="text-sm text-[var(--ash)]">Aún no hay consumos registrados.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <dl className="grid grid-cols-1 gap-1 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 sm:grid-cols-2 sm:gap-3">
        <div className="flex items-center justify-between gap-2 text-sm">
          <dt className="text-[var(--ash)]">Consumido este mes</dt>
          <dd className="font-semibold text-[var(--jet)]">{usd(estado.total_mes_usd)}</dd>
        </div>
        <div className="flex items-center justify-between gap-2 text-sm">
          <dt className="text-[var(--ash)]">Total consumido</dt>
          <dd className="font-semibold text-[var(--jet)]">{usd(estado.total_consumido_usd)}</dd>
        </div>
      </dl>

      <div className="bg-[var(--surface)] rounded-2xl overflow-hidden divide-y divide-[var(--border)]">
        {consumos.map((consumo) => {
          const anulada = consumo.estado === 'anulada';
          return (
            <button
              key={consumo.id}
              type="button"
              onClick={() => onVerConsumo(consumo)}
              className="w-full px-4 py-3 flex items-start gap-2 text-left min-h-[44px] hover:bg-[var(--surface-sunken)] transition-colors"
            >
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-medium text-[var(--jet)] line-clamp-2">
                  {resumenItems(consumo.items)}
                </span>
                <span className="block text-sm text-[var(--ash)] mt-0.5">
                  {fmtFecha(consumo.creado_en, "d 'de' MMM yyyy, h:mm a")} · {consumo.area_display}
                </span>
              </span>
              <span className="flex flex-col items-end gap-1 flex-shrink-0">
                <span className={`text-sm font-semibold ${anulada ? 'text-[var(--ash)] line-through' : 'text-[var(--jet)]'}`}>
                  {usd(consumo.total_usd)}
                </span>
                {anulada && (
                  <span className="text-xs font-medium px-2 py-0.5 rounded-lg bg-[var(--red-light)] text-[var(--red)]">
                    Anulada
                  </span>
                )}
                {!anulada && consumo.saldo_pendiente_usd != null && (
                  <span className="text-xs font-medium px-2 py-0.5 rounded-lg bg-[var(--yellow-light)] text-[var(--yellow)]">
                    Por pagar
                  </span>
                )}
              </span>
              <ChevronRight size={16} className="text-[var(--ash)] mt-0.5 flex-shrink-0" aria-hidden="true" />
            </button>
          );
        })}
      </div>

      {totalPaginas > 1 && (
        <div className="flex items-center gap-3 pt-2">
          <button
            onClick={() => onCambiarPagina(Math.max(1, pagina - 1))}
            disabled={pagina === 1}
            className="flex-1 flex items-center justify-center gap-1 py-3 rounded-xl border border-[var(--border)] text-sm text-[var(--jet-mid)] disabled:opacity-40 hover:bg-[var(--surface-sunken)] transition-colors min-h-[44px]"
          >
            <ChevronLeft size={16} aria-hidden="true" />
            Anterior
          </button>
          <span className="text-sm text-[var(--ash)] whitespace-nowrap">
            {pagina} / {totalPaginas}
          </span>
          <button
            onClick={() => onCambiarPagina(Math.min(totalPaginas, pagina + 1))}
            disabled={pagina === totalPaginas}
            className="flex-1 flex items-center justify-center gap-1 py-3 rounded-xl border border-[var(--border)] text-sm text-[var(--jet-mid)] disabled:opacity-40 hover:bg-[var(--surface-sunken)] transition-colors min-h-[44px]"
          >
            Siguiente
            <ChevronRight size={16} aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  );
};

export default EstadoCuentaConsumos;
