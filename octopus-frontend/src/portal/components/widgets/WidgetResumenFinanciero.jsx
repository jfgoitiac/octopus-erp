import { AlertTriangle, CheckCircle } from 'lucide-react';
import SkeletonCard from '../SkeletonCard';

const WidgetResumenFinanciero = ({ resumen, tieneDeuda, loading, onPagar }) => {
  if (loading) {
    return <SkeletonCard lines={3} />;
  }

  if (!resumen) return null;

  return (
    <div className={`rounded-2xl p-4 border ${tieneDeuda ? 'bg-red-50 border-red-100' : 'bg-green-50 border-green-100'}`}>
      <div className="flex items-center gap-2 mb-3">
        {tieneDeuda ? (
          <AlertTriangle size={18} className="text-red-500 flex-shrink-0" />
        ) : (
          <CheckCircle size={18} className="text-green-600 flex-shrink-0" />
        )}
        <span className={`font-semibold text-sm ${tieneDeuda ? 'text-red-700' : 'text-green-700'}`}>
          {tieneDeuda
            ? `Deuda pendiente: $${Number(resumen.total_deuda_usd).toFixed(2)} USD`
            : 'Solvente — al día con los pagos'}
        </span>
      </div>

      {/* Mensualidades vencidas */}
      {resumen.mensualidades_vencidas?.length > 0 && (
        <div className="space-y-2">
          {resumen.mensualidades_vencidas.map((m) => (
            <div key={m.id} className="flex items-center justify-between bg-white/70 rounded-xl px-3 py-2">
              <div>
                <p className="text-sm font-medium text-gray-700">
                  {m.mes_nombre} {m.anio}
                </p>
                <p className="text-xs text-red-500">{m.dias_mora} días de mora</p>
                {m.porcentaje_beca_aplicado > 0 && (
                  <span className="inline-block mt-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-[var(--portal-primary,#0fa3b1)]/10 text-[var(--portal-primary,#0fa3b1)]">
                    Beca -{m.porcentaje_beca_aplicado}%
                  </span>
                )}
              </div>
              <div className="flex flex-col items-end gap-1.5">
                {m.porcentaje_beca_aplicado > 0 && m.monto_original_usd && (
                  <p className="text-xs text-gray-400 line-through">${Number(m.monto_original_usd).toFixed(2)}</p>
                )}
                {m.monto_recargo > 0 ? (
                  <>
                    <p className="text-xs text-gray-400 line-through">${Number(m.monto_usd).toFixed(2)}</p>
                    <p className="text-sm font-semibold text-red-600">${Number(m.monto_total).toFixed(2)}</p>
                    <p className="text-[10px] text-red-500 font-medium">
                      + ${Number(m.monto_recargo).toFixed(2)} {m.nombre_recargo}
                    </p>
                  </>
                ) : (
                  <p className="text-sm font-semibold text-gray-800">${Number(m.monto_usd).toFixed(2)}</p>
                )}
                <button
                  onClick={() => onPagar(m)}
                  className="px-3 py-1.5 rounded-lg bg-[var(--portal-primary,#0fa3b1)]/10 text-[var(--portal-primary,#0fa3b1)] text-sm font-medium min-h-[44px] flex items-center hover:bg-[var(--portal-primary,#0fa3b1)]/20 transition-colors"
                >
                  Pagar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Otros conceptos pendientes: inscripción y proyecto de inversión.
          No tienen botón "Pagar": el comprobante del portal solo aplica
          a mensualidades, este pago se coordina con administración. */}
      {resumen.otros_conceptos_pendientes?.length > 0 && (
        <div className="space-y-2 mt-2">
          {resumen.otros_conceptos_pendientes.map((c) => (
            <div key={`${c.tipo}-${c.id}`} className="flex items-center justify-between bg-white/70 rounded-xl px-3 py-2">
              <div>
                <p className="text-sm font-medium text-gray-700">{c.concepto}</p>
                <p className="text-xs text-gray-500">
                  {c.alumno_nombre || 'Aplica a todos los hijos inscritos'}
                </p>
              </div>
              <p className="text-sm font-semibold text-gray-800">${Number(c.monto_usd).toFixed(2)}</p>
            </div>
          ))}
          <p className="text-xs text-gray-400 pt-1">
            Para pagar estos conceptos, contacta a administración.
          </p>
        </div>
      )}
    </div>
  );
};

export default WidgetResumenFinanciero;
