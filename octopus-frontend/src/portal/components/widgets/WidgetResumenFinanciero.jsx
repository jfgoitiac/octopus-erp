import { AlertTriangle, CheckCircle } from 'lucide-react';
import SkeletonCard from '../SkeletonCard';
import MontoRef, { NotaTasaBcv } from '../MontoRef';
import { fmtMonto } from '../../utils/montos';

// La deuda es SIEMPRE la de todos los hijos del representante (el backend la
// suma); con varios hijos se muestra además el desglose por cada uno y cada
// mensualidad indica a qué hijo corresponde.
const WidgetResumenFinanciero = ({ resumen, tieneDeuda, loading, onPagar, variosAlumnos = false }) => {
  if (loading) {
    return <SkeletonCard lines={3} />;
  }

  if (!resumen) return null;

  const tasaBcv = resumen.tasa_bcv;
  const desglose = (resumen.deuda_por_alumno || []).filter((d) => Number(d.deuda_usd) > 0);

  return (
    <section className={`portal-card p-4 sm:p-5 h-full ${tieneDeuda ? 'bg-red-50/70' : 'bg-emerald-50/70'}`}>
      <div className="flex items-center gap-2 mb-2">
        {tieneDeuda ? (
          <AlertTriangle size={18} className="text-red-500 flex-shrink-0" />
        ) : (
          <CheckCircle size={18} className="text-green-600 flex-shrink-0" />
        )}
        <span className={`font-semibold text-sm ${tieneDeuda ? 'text-red-700' : 'text-green-700'}`}>
          {tieneDeuda
            ? (variosAlumnos ? 'Deuda total pendiente (todos tus hijos)' : 'Deuda pendiente')
            : 'Solvente — al día con los pagos'}
        </span>
      </div>

      {tieneDeuda && (
        <MontoRef
          usd={resumen.total_deuda_usd}
          tasaBcv={tasaBcv}
          size="lg"
          align="left"
          colorRef="text-red-700"
          colorBs="text-red-600"
          className="mb-3"
        />
      )}

      {/* Desglose por hijo */}
      {variosAlumnos && desglose.length > 0 && (
        <div className="bg-white/70 rounded-xl px-3 py-2 mb-3 divide-y divide-red-100">
          {desglose.map((d) => (
            <div key={d.alumno_id} className="flex items-center justify-between gap-3 py-1.5">
              <p className="text-sm text-gray-700 min-w-0 truncate">{d.alumno_nombre}</p>
              <MontoRef usd={d.deuda_usd} tasaBcv={tasaBcv} />
            </div>
          ))}
        </div>
      )}

      {/* Mensualidades vencidas */}
      {resumen.mensualidades_vencidas?.length > 0 && (
        <div className="space-y-2">
          {resumen.mensualidades_vencidas.map((m) => (
            <div key={m.id} className="flex items-center justify-between gap-3 bg-white/70 rounded-xl px-3 py-2">
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-700">
                  {m.mes_nombre} {m.anio}
                </p>
                {variosAlumnos && m.alumno_nombre && (
                  <p className="text-xs text-gray-500 truncate">{m.alumno_nombre}</p>
                )}
                <p className="text-xs text-red-500">{m.dias_mora} días de mora</p>
                {m.porcentaje_beca_aplicado > 0 && (
                  <span className="inline-block mt-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-[var(--portal-primary,#0fa3b1)]/10 text-[var(--portal-primary,#0fa3b1)]">
                    Beca -{m.porcentaje_beca_aplicado}%
                  </span>
                )}
              </div>
              <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                {m.porcentaje_beca_aplicado > 0 && m.monto_original_usd && (
                  <p className="text-xs text-gray-400 line-through">REF. {fmtMonto(m.monto_original_usd)}</p>
                )}
                {m.monto_recargo > 0 ? (
                  <>
                    <p className="text-xs text-gray-400 line-through">REF. {fmtMonto(m.monto_usd)}</p>
                    <MontoRef usd={m.monto_total} tasaBcv={tasaBcv} colorRef="text-red-600" />
                    <p className="text-[10px] text-red-500 font-medium">
                      + REF. {fmtMonto(m.monto_recargo)} {m.nombre_recargo}
                    </p>
                  </>
                ) : m.monto_descuento > 0 ? (
                  <>
                    <p className="text-xs text-gray-400 line-through">REF. {fmtMonto(m.monto_usd)}</p>
                    <MontoRef usd={m.monto_total} tasaBcv={tasaBcv} colorRef="text-green-600" />
                    <p className="text-[10px] text-green-600 font-medium">
                      - REF. {fmtMonto(m.monto_descuento)} {m.nombre_descuento}
                    </p>
                  </>
                ) : (
                  <MontoRef usd={m.monto_usd} tasaBcv={tasaBcv} />
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
            <div key={`${c.tipo}-${c.id}`} className="flex items-center justify-between gap-3 bg-white/70 rounded-xl px-3 py-2">
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-700">{c.concepto}</p>
                <p className="text-xs text-gray-500">
                  {c.alumno_nombre || 'Aplica a todos los hijos inscritos'}
                </p>
              </div>
              <MontoRef usd={c.monto_usd} tasaBcv={tasaBcv} className="flex-shrink-0" />
            </div>
          ))}
          <p className="text-xs text-gray-400 pt-1">
            Para pagar estos conceptos, contacta a administración.
          </p>
        </div>
      )}

      {tieneDeuda && <NotaTasaBcv tasaBcv={tasaBcv} className="mt-3" />}
    </section>
  );
};

export default WidgetResumenFinanciero;
