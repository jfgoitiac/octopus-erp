import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { HandCoins, Receipt } from 'lucide-react';
import SkeletonCard, { SkeletonLine } from './SkeletonCard';

const formatFecha = (fechaStr) => {
  if (!fechaStr) return '—';
  try {
    return format(new Date(fechaStr), "d 'de' MMM yyyy", { locale: es });
  } catch {
    return fechaStr;
  }
};

// Del lado del representante solo dólares de referencia, sin bolívares.
const usd = (valor) => `REF. ${Number(valor ?? 0).toFixed(2)}`;

/**
 * CuentaCantinaCard — deuda de cantina/librería del representante (solo lectura).
 * Props:
 *   cuenta: { saldo_usd, por_area, cargos, abonos } | null
 *   loading: boolean
 */
const CuentaCantinaCard = ({ cuenta, loading }) => {
  if (loading) {
    return (
      <div className="space-y-3">
        <SkeletonCard lines={2} />
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 space-y-3 animate-pulse">
          <SkeletonLine width="w-2/5" height="h-3" />
          <SkeletonLine width="w-full" height="h-4" />
          <SkeletonLine width="w-4/5" height="h-4" />
        </div>
      </div>
    );
  }

  if (!cuenta) return null;

  const saldo = Number(cuenta.saldo_usd ?? 0);
  const hayDeuda = saldo > 0;
  const cargos = cuenta.cargos || [];
  const abonos = cuenta.abonos || [];

  return (
    <div className="space-y-4">
      {/* Deuda total y por área */}
      <div className={`rounded-2xl p-4 border ${hayDeuda ? 'bg-red-50 border-red-100' : 'bg-white border-gray-100'}`}>
        <div className="flex items-center gap-2 mb-2">
          <HandCoins
            size={18}
            className={`flex-shrink-0 ${hayDeuda ? 'text-red-500' : 'text-[var(--portal-primary,#0fa3b1)]'}`}
            aria-hidden="true"
          />
          <span className={`font-semibold text-sm ${hayDeuda ? 'text-red-700' : 'text-gray-700'}`}>
            Cuenta de cantina y librería
          </span>
        </div>
        <p className={`text-3xl font-bold ${hayDeuda ? 'text-red-600' : 'text-gray-800'}`}>{usd(saldo)}</p>
        <p className="text-xs text-gray-500 mt-1">
          {hayDeuda ? 'Deuda pendiente. Cancélala en la cantina o librería del colegio.' : 'No tienes deuda pendiente.'}
        </p>
        <dl className="mt-3 grid grid-cols-1 gap-1 sm:grid-cols-2 sm:gap-3">
          {(cuenta.por_area || []).map((a) => (
            <div key={a.area} className="flex items-center justify-between gap-2 text-sm">
              <dt className="text-gray-500">{a.area_display}</dt>
              <dd className="font-semibold text-gray-800">{usd(a.saldo_usd)}</dd>
            </div>
          ))}
        </dl>
      </div>

      {/* Consumos pendientes */}
      {cargos.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-gray-700">Consumos pendientes</h2>
          <div className="bg-white rounded-2xl overflow-hidden shadow-sm divide-y divide-gray-100">
            {cargos.map((c) => (
              <div key={c.id} className="px-4 py-3 flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">
                    {c.alumno_nombre || 'Sin alumno indicado'}
                  </p>
                  <p className="text-sm text-gray-400 mt-0.5">
                    {formatFecha(c.fecha)} · {c.area_display}
                  </p>
                </div>
                <div className="flex flex-col items-end flex-shrink-0">
                  <p className="text-sm font-semibold text-red-600">{usd(c.saldo_usd)}</p>
                  {Number(c.monto_pagado) > 0 && (
                    <p className="text-xs text-gray-400">de {usd(c.monto_usd)}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Últimos abonos */}
      {abonos.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-gray-700">Últimos abonos</h2>
          <div className="bg-white rounded-2xl overflow-hidden shadow-sm divide-y divide-gray-100">
            {abonos.map((ab) => (
              <div key={ab.operacion_uuid} className="px-4 py-3 flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0 flex items-start gap-2">
                  <Receipt size={16} className="text-gray-300 mt-0.5 flex-shrink-0" aria-hidden="true" />
                  <div className="min-w-0">
                    <p className="text-sm text-gray-800 truncate">{(ab.metodos || []).join(', ')}</p>
                    <p className="text-sm text-gray-400 mt-0.5">{formatFecha(ab.fecha_pago)}</p>
                  </div>
                </div>
                <p className="text-sm font-semibold text-green-600 flex-shrink-0">+{usd(ab.total_usd)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {cargos.length === 0 && abonos.length === 0 && (
        <p className="text-sm text-gray-400 text-center">Aún no hay consumos cargados a tu cuenta.</p>
      )}
    </div>
  );
};

export default CuentaCantinaCard;
