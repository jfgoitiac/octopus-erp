import { Wallet, AlertTriangle, CreditCard } from 'lucide-react';
import SkeletonCard from './SkeletonCard';

/**
 * SaldoTarjetaCard
 * Props:
 *   saldoTarjeta: { tiene_tarjeta, saldo, limite_credito, estado, dias_negativo } | null
 *   loading: boolean
 *   onRecargar: () => void
 */
const SaldoTarjetaCard = ({ saldoTarjeta, loading, onRecargar }) => {
  if (loading) {
    return <SkeletonCard lines={2} />;
  }

  if (!saldoTarjeta || !saldoTarjeta.tiene_tarjeta) {
    return (
      <div className="bg-white rounded-2xl p-5 border border-gray-100 text-center">
        <CreditCard size={32} className="text-gray-200 mx-auto mb-3" aria-hidden="true" />
        <p className="text-sm font-medium text-gray-600">Sin tarjeta de cantina</p>
        <p className="text-xs text-gray-400 mt-1">
          Tu hijo aún no tiene tarjeta de cantina asignada, contacta a la administración.
        </p>
      </div>
    );
  }

  const saldo = Number(saldoTarjeta.saldo ?? 0);
  const esNegativo = saldoTarjeta.en_negativo ?? saldo < 0;
  const diasNegativo = saldoTarjeta.dias_en_negativo ?? 0;

  return (
    <div className={`rounded-2xl p-4 border ${esNegativo ? 'bg-red-50 border-red-100' : 'bg-white border-gray-100'}`}>
      <div className="flex items-center gap-2 mb-2">
        {esNegativo ? (
          <AlertTriangle size={18} className="text-red-500 flex-shrink-0" aria-hidden="true" />
        ) : (
          <Wallet size={18} className="text-[var(--portal-primary,#0fa3b1)] flex-shrink-0" aria-hidden="true" />
        )}
        <span className={`font-semibold text-sm ${esNegativo ? 'text-red-700' : 'text-gray-700'}`}>
          Saldo de la tarjeta
        </span>
      </div>

      <p className={`text-3xl font-bold ${esNegativo ? 'text-red-600' : 'text-gray-800'}`}>
        ${saldo.toFixed(2)}
      </p>

      {esNegativo && (
        <p className="text-xs text-red-500 mt-1">
          Saldo negativo{diasNegativo ? ` desde hace ${diasNegativo} día${diasNegativo === 1 ? '' : 's'}` : ''}.
          {' '}Crédito disponible: ${Number(saldoTarjeta.limite_credito ?? 0).toFixed(2)}.
        </p>
      )}

      {saldoTarjeta.estado && saldoTarjeta.estado !== 'activa' && (
        <p className="text-xs text-amber-600 mt-1">Tarjeta: {saldoTarjeta.estado_display || saldoTarjeta.estado}</p>
      )}

      <button
        onClick={onRecargar}
        className="mt-3 w-full flex items-center justify-center gap-2 bg-[var(--portal-primary,#0fa3b1)] text-white font-medium py-3 rounded-xl text-sm hover:bg-[color-mix(in_srgb,var(--portal-primary,#0fa3b1)_85%,black)] transition-colors min-h-[44px]"
      >
        <Wallet size={16} aria-hidden="true" />
        Recargar saldo
      </button>
    </div>
  );
};

export default SaldoTarjetaCard;
