import { AlertTriangle, CheckCircle } from 'lucide-react';
import SkeletonCard from '../SkeletonCard';
import MontoRef, { NotaTasaBcv } from '../MontoRef';
import { fmtMonto } from '../../utils/montos';
import { textoVencimiento } from '../../utils/fechas';
import { ESTATUS_COMPROBANTE } from '../../utils/estados';
import EstadoBadge from '../EstadoBadge';

// Acción de cada mensualidad según su último comprobante: si está en
// revisión no se ofrece pagar de nuevo (el backend lo rechazaría); si fue
// rechazado se invita a reenviarlo.
const AccionMensualidad = ({ mensualidad, comprobante, onPagar }) => {
  if (comprobante?.estatus === 'pendiente') return <EstadoBadge estado={ESTATUS_COMPROBANTE.pendiente} />;
  const rechazado = comprobante?.estatus === 'rechazado';
  return (
    <button
      type="button"
      onClick={() => onPagar(mensualidad)}
      className="px-4 rounded-full bg-[var(--portal-hero)] text-white text-sm font-semibold min-h-[44px] flex items-center hover:bg-[color-mix(in_srgb,var(--portal-hero)_85%,black)] transition-colors whitespace-nowrap"
    >
      {rechazado ? 'Enviar de nuevo' : 'Pagar'}
    </button>
  );
};

// La deuda es SIEMPRE la de todos los hijos del representante (el backend la
// suma); con varios hijos cada mensualidad indica a qué hijo corresponde.
const WidgetResumenFinanciero = ({ resumen, tieneDeuda, loading, onPagar, variosAlumnos = false, comprobantePorMensualidad = {} }) => {
  if (loading) {
    return <SkeletonCard lines={3} />;
  }

  if (!resumen) return null;

  const tasaBcv = resumen.tasa_bcv;
  const mensualidades = resumen.mensualidades_vencidas || [];
  const otrosConceptos = resumen.otros_conceptos_pendientes || [];
  const cantidadPendientes = mensualidades.length + otrosConceptos.length;

  return (
    <section className="portal-card p-5 sm:p-6 h-full" aria-labelledby="resumen-financiero">
      <div className="flex items-center gap-2 mb-3">
        {tieneDeuda ? (
          <AlertTriangle size={18} className="text-[var(--red)] flex-shrink-0" aria-hidden="true" />
        ) : (
          <CheckCircle size={18} className="text-[var(--green)] flex-shrink-0" aria-hidden="true" />
        )}
        <h3 id="resumen-financiero" className={`portal-section-title text-lg sm:text-xl ${tieneDeuda ? '!text-[var(--red)]' : '!text-[var(--green)]'}`}>
          {tieneDeuda ? 'Pendiente de pago' : 'Solvente: al día con los pagos'}
        </h3>
      </div>

      {/* El total ya está en el saludo de arriba: aquí solo el detalle. */}
      {tieneDeuda && (
        <p className="mb-5 text-sm text-[var(--portal-muted)]">
          {cantidadPendientes} concepto{cantidadPendientes === 1 ? '' : 's'}{variosAlumnos ? ' entre todos tus hijos' : ''}. Toca "Pagar" en el mes que ya pagaste para enviar el comprobante.
        </p>
      )}

      {mensualidades.length > 0 && (
        <ul className="space-y-2.5">
          {mensualidades.map((m) => (
            <li key={m.id} className="flex items-center justify-between gap-3 bg-[var(--portal-canvas)] rounded-[var(--portal-radius-sm)] px-4 py-3.5">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[var(--portal-ink)] sm:text-base">{m.mes_nombre} {m.anio}</p>
                {variosAlumnos && m.alumno_nombre && (
                  <p className="text-xs text-[var(--jet-mid)] truncate">{m.alumno_nombre}</p>
                )}
                <p className={`text-xs ${Number(m.dias_mora) > 0 ? 'text-[var(--red)] font-medium' : 'text-[var(--portal-muted)]'}`}>{textoVencimiento(m)}</p>
                {m.porcentaje_beca_aplicado > 0 && (
                  <span className="inline-block mt-1 text-xs font-semibold px-1.5 py-0.5 rounded-full bg-[var(--portal-tint)] text-[var(--portal-tint-ink)]">
                    Beca -{m.porcentaje_beca_aplicado}%
                  </span>
                )}
                {m.monto_recargo > 0 && (
                  <p className="text-xs text-[var(--red)] font-medium">Incluye REF. {fmtMonto(m.monto_recargo)} de {m.nombre_recargo || 'recargo'}</p>
                )}
                {m.monto_descuento > 0 && (
                  <p className="text-xs text-[var(--green)] font-medium">Ahorras REF. {fmtMonto(m.monto_descuento)} ({m.nombre_descuento || 'descuento'})</p>
                )}
              </div>
              <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                <MontoRef usd={m.monto_total ?? m.monto_usd} tasaBcv={tasaBcv} />
                <AccionMensualidad mensualidad={m} comprobante={comprobantePorMensualidad[m.id]} onPagar={onPagar} />
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Otros conceptos pendientes: inscripción y proyecto de inversión.
          No tienen botón "Pagar": el comprobante del portal solo aplica
          a mensualidades, este pago se coordina con administración. */}
      {otrosConceptos.length > 0 && (
        <div className="space-y-2.5 mt-2.5">
          {otrosConceptos.map((c) => (
            <div key={`${c.tipo}-${c.id}`} className="flex items-center justify-between gap-3 bg-[var(--portal-canvas)] rounded-[var(--portal-radius-sm)] px-4 py-3.5">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[var(--portal-ink)]">{c.concepto}</p>
                <p className="text-xs text-[var(--ash)]">
                  {c.alumno_nombre || 'Aplica a toda la familia'}
                </p>
              </div>
              <MontoRef usd={c.monto_usd} tasaBcv={tasaBcv} className="flex-shrink-0" />
            </div>
          ))}
          <p className="text-xs text-[var(--jet-mid)] pt-1">
            Estos conceptos se pagan coordinando con administración.
          </p>
        </div>
      )}

      {tieneDeuda && <NotaTasaBcv tasaBcv={tasaBcv} className="mt-3" />}
    </section>
  );
};

export default WidgetResumenFinanciero;
