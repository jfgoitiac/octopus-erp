import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, ShoppingCart } from 'lucide-react';
import { SkeletonLine } from './SkeletonCard';

const formatFecha = (fechaStr) => {
  if (!fechaStr) return '—';
  try {
    return format(new Date(fechaStr), "d 'de' MMM yyyy, HH:mm", { locale: es });
  } catch {
    return fechaStr;
  }
};

const TIPO_LABELS = {
  recarga: 'Recarga',
  consumo: 'Consumo',
  ajuste: 'Ajuste',
  reverso: 'Reverso',
};

const TIPO_BADGE = {
  recarga: 'bg-green-100 text-green-700',
  consumo: 'bg-gray-100 text-gray-600',
  ajuste: 'bg-amber-100 text-amber-700',
  reverso: 'bg-red-100 text-red-700',
};

/**
 * HistorialConsumoList
 * Props:
 *   movimientos: Array<{ id, tipo, tipo_display, monto, saldo_antes, saldo_despues, creado_en }>
 *   loading: boolean
 *   pagina: number
 *   totalPaginas: number
 *   onCambiarPagina: (pagina: number) => void
 */
const HistorialConsumoList = ({ movimientos = [], loading, pagina = 1, totalPaginas = 1, onCambiarPagina }) => {
  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 space-y-2 animate-pulse">
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

  if (!movimientos.length) {
    return (
      <div className="bg-white rounded-2xl p-8 border border-gray-100 text-center">
        <ShoppingCart size={32} className="text-gray-200 mx-auto mb-3" aria-hidden="true" />
        <p className="text-sm text-gray-500">Aún no hay consumos registrados.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="bg-white rounded-2xl overflow-hidden shadow-sm divide-y divide-gray-100">
        {movimientos.map((mov) => {
          const monto = Number(mov.monto ?? 0);
          const esPositivo = ['recarga', 'reverso'].includes(mov.tipo);
          return (
            <div key={mov.id} className="px-4 py-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 line-clamp-2">
                    {mov.tipo_display || TIPO_LABELS[mov.tipo] || mov.tipo}
                  </p>
                  <p className="text-sm text-gray-400 mt-0.5">{formatFecha(mov.creado_en)}</p>
                  <p className="text-xs text-gray-400">Saldo luego del movimiento: ${Number(mov.saldo_despues ?? 0).toFixed(2)}</p>
                </div>
                <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                  <p className={`text-sm font-semibold ${esPositivo ? 'text-green-600' : 'text-gray-800'}`}>
                    {esPositivo ? '+' : '-'}${Math.abs(monto).toFixed(2)}
                  </p>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${TIPO_BADGE[mov.tipo] || 'bg-gray-100 text-gray-600'}`}>
                    {mov.tipo_display || TIPO_LABELS[mov.tipo] || mov.tipo}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {totalPaginas > 1 && (
        <div className="flex items-center gap-3 pt-2">
          <button
            onClick={() => onCambiarPagina(Math.max(1, pagina - 1))}
            disabled={pagina === 1}
            className="flex-1 flex items-center justify-center gap-1 py-3 rounded-xl border border-gray-200 text-sm text-gray-600 disabled:opacity-40 hover:bg-gray-50 transition-colors min-h-[44px]"
          >
            <ChevronLeft size={16} aria-hidden="true" />
            Anterior
          </button>
          <span className="text-sm text-gray-500 whitespace-nowrap">
            {pagina} / {totalPaginas}
          </span>
          <button
            onClick={() => onCambiarPagina(Math.min(totalPaginas, pagina + 1))}
            disabled={pagina === totalPaginas}
            className="flex-1 flex items-center justify-center gap-1 py-3 rounded-xl border border-gray-200 text-sm text-gray-600 disabled:opacity-40 hover:bg-gray-50 transition-colors min-h-[44px]"
          >
            Siguiente
            <ChevronRight size={16} aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  );
};

export default HistorialConsumoList;
