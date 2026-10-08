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
  const mensualidades = resumen.mensualidades_vencidas || [];
  const otrosConceptos = resumen.otros_conceptos_pendientes || [];
  const cantidadPendientes = mensualidades.length + otrosConceptos.length;

  return (
    <section className={`portal-card p-4 sm:p-5 h-full ${tieneDeuda ? 'bg-[var(--red-light)]/70' : 'bg-[var(--green-light)]/70'}`}>
      <div className="flex items-center gap-2 mb-2">
        {tieneDeuda ? (
          <AlertTriangle size={18} className="text-[var(--red)] flex-shrink-0" />
        ) : (
          <CheckCircle size={18} className="text-[var(--green)] flex-shrink-0" />
        )}
        <span className={`font-semibold text-sm ${tieneDeuda ? 'text-[var(--red)]' : 'text-[var(--green)]'}`}>
          {tieneDeuda
            ? (variosAlumnos ? 'Deuda familiar pendiente' : 'Deuda pendiente')
            : 'Solvente — al día con los pagos'}
        </span>
      </div>

      {tieneDeuda && (
        <div className="mb-3"><MontoRef usd={resumen.total_deuda_usd} tasaBcv={tasaBcv} size="lg" align="left" colorRef="text-[var(--red)]" colorBs="text-[var(--red)]" />
          <p className="mt-1 text-xs text-[var(--red)]/80">{variosAlumnos ? `Un solo total que reúne las deudas de todos tus hijos (${cantidadPendientes} concepto${cantidadPendientes === 1 ? '' : 's'}).` : `${cantidadPendientes} concepto${cantidadPendientes === 1 ? '' : 's'} pendiente${cantidadPendientes === 1 ? '' : 's'}.`}</p>
        </div>
      )}

      {/* Para familias con varios alumnos, el monto único evita sumar mentalmente.
          El detalle sigue disponible de forma secundaria, sin repetir importes. */}
      {variosAlumnos && tieneDeuda && (
        <details className="mb-3 rounded-xl bg-[var(--surface)]/70 px-3 py-2 text-xs text-[var(--jet-mid)]">
          <summary className="cursor-pointer font-medium text-[var(--portal-primary)]">Ver conceptos incluidos</summary>
          <p className="mt-2 leading-relaxed">Incluye {mensualidades.length} mensualidad{mensualidades.length === 1 ? '' : 'es'} pendiente{mensualidades.length === 1 ? '' : 's'} y {otrosConceptos.length} concepto{otrosConceptos.length === 1 ? '' : 's'} adicional{otrosConceptos.length === 1 ? '' : 'es'}, correspondientes a todos tus hijos.</p>
        </details>
      )}

      {/* Mensualidades vencidas */}
      {!variosAlumnos && mensualidades.length > 0 && (
        <div className="space-y-2">
          {mensualidades.map((m) => (
            <div key={m.id} className="flex items-center justify-between gap-3 bg-[var(--surface)]/70 rounded-xl px-3 py-2">
              <div className="min-w-0">
                <p className="text-sm font-medium text-[var(--jet-mid)]">
                  {m.mes_nombre} {m.anio}
                </p>
                {variosAlumnos && m.alumno_nombre && (
                  <p className="text-xs text-[var(--ash)] truncate">{m.alumno_nombre}</p>
                )}
                <p className="text-xs text-[var(--red)]">{m.dias_mora} días de mora</p>
                {m.porcentaje_beca_aplicado > 0 && (
                  <span className="inline-block mt-1 text-xs font-semibold px-1.5 py-0.5 rounded-full bg-[var(--portal-primary)]/10 text-[var(--portal-primary)]">
                    Beca -{m.porcentaje_beca_aplicado}%
                  </span>
                )}
              </div>
              <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                {m.porcentaje_beca_aplicado > 0 && m.monto_original_usd && (
                  <p className="text-xs text-[var(--ash)] line-through">REF. {fmtMonto(m.monto_original_usd)}</p>
                )}
                {m.monto_recargo > 0 ? (
                  <>
                    <p className="text-xs text-[var(--ash)] line-through">REF. {fmtMonto(m.monto_usd)}</p>
                    <MontoRef usd={m.monto_total} tasaBcv={tasaBcv} colorRef="text-[var(--red)]" />
                    <p className="text-xs text-[var(--red)] font-medium">
                      + REF. {fmtMonto(m.monto_recargo)} {m.nombre_recargo}
                    </p>
                  </>
                ) : m.monto_descuento > 0 ? (
                  <>
                    <p className="text-xs text-[var(--ash)] line-through">REF. {fmtMonto(m.monto_usd)}</p>
                    <MontoRef usd={m.monto_total} tasaBcv={tasaBcv} colorRef="text-[var(--green)]" />
                    <p className="text-xs text-[var(--green)] font-medium">
                      - REF. {fmtMonto(m.monto_descuento)} {m.nombre_descuento}
                    </p>
                  </>
                ) : (
                  <MontoRef usd={m.monto_usd} tasaBcv={tasaBcv} />
                )}
                <button
                  onClick={() => onPagar(m)}
                  className="px-3 py-1.5 rounded-lg bg-[var(--portal-primary)]/10 text-[var(--portal-primary)] text-sm font-medium min-h-[44px] flex items-center hover:bg-[var(--portal-primary)]/20 transition-colors"
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
      {!variosAlumnos && otrosConceptos.length > 0 && (
        <div className="space-y-2 mt-2">
          {otrosConceptos.map((c) => (
            <div key={`${c.tipo}-${c.id}`} className="flex items-center justify-between gap-3 bg-[var(--surface)]/70 rounded-xl px-3 py-2">
              <div className="min-w-0">
                <p className="text-sm font-medium text-[var(--jet-mid)]">{c.concepto}</p>
                <p className="text-xs text-[var(--ash)]">
                  {c.alumno_nombre || 'Aplica a todos los hijos inscritos'}
                </p>
              </div>
              <MontoRef usd={c.monto_usd} tasaBcv={tasaBcv} className="flex-shrink-0" />
            </div>
          ))}
          <p className="text-xs text-[var(--ash)] pt-1">
            Para pagar estos conceptos, contacta a administración.
          </p>
        </div>
      )}

      {variosAlumnos && mensualidades.length > 0 && (
        <button onClick={() => onPagar(mensualidades[0])} className="w-full min-h-[44px] rounded-xl bg-[var(--portal-primary)] text-sm font-semibold text-white transition-opacity hover:opacity-90">Registrar comprobante de pago</button>
      )}

      {tieneDeuda && <NotaTasaBcv tasaBcv={tasaBcv} className="mt-3" />}
    </section>
  );
};

export default WidgetResumenFinanciero;
