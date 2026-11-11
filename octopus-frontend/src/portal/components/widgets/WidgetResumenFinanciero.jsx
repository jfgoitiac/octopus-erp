import { AlertTriangle, CheckCircle } from 'lucide-react';
import SkeletonCard from '../SkeletonCard';
import MontoRef, { NotaTasaBcv } from '../MontoRef';
import { fmtMonto } from '../../utils/montos';
import { fmtFecha, textoVencimiento } from '../../utils/fechas';
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
      {rechazado ? 'Enviar de nuevo' : 'Reportar pago'}
    </button>
  );
};

// El backend entrega la deuda familiar y el desglose por alumno. Este widget
// muestra el consolidado o filtra el detalle cuando el representante elige
// uno de sus hijos.
const WidgetResumenFinanciero = ({ resumen, tieneDeuda, loading, onPagar, variosAlumnos = false, alumnoId = null, comprobantePorMensualidad = {} }) => {
  if (loading) {
    return <SkeletonCard lines={3} />;
  }

  if (!resumen) return null;

  const tasaBcv = resumen.tasa_bcv;
  const mensualidades = (resumen.mensualidades_vencidas || []).filter(
    (mensualidad) => alumnoId === null || String(mensualidad.alumno_id) === String(alumnoId),
  );
  const otrosConceptos = [
    ...(resumen.otros_conceptos_pendientes || []),
    ...(resumen.penalidades_convenio || []),
  ].filter(
    (concepto) => alumnoId === null || String(concepto.alumno_id) === String(alumnoId),
  );
  const cantidadPendientes = mensualidades.length + otrosConceptos.length;
  const gruposMensualidades = mensualidades.reduce((grupos, mensualidad) => {
    const clave = String(mensualidad.alumno_id ?? 'sin-alumno');
    if (!grupos.has(clave)) grupos.set(clave, []);
    grupos.get(clave).push(mensualidad);
    return grupos;
  }, new Map());

  const renderMensualidad = (m) => (
    <li key={m.id} className="flex items-center justify-between gap-3 bg-[var(--portal-canvas)] rounded-[var(--portal-radius-sm)] px-4 py-3.5">
      <div className="min-w-0">
        {/* El nombre del hijo va en el encabezado de su grupo (vista familiar). */}
        <p className="text-sm font-semibold text-[var(--portal-ink)] sm:text-base">{m.mes_nombre} {m.anio}</p>
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
  );

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
          {cantidadPendientes} concepto{cantidadPendientes === 1 ? '' : 's'}{variosAlumnos && alumnoId === null ? ' entre todos tus hijos' : ''}. Puedes reunir varias mensualidades vencidas en un solo comprobante.
        </p>
      )}

      {mensualidades.length > 0 && (
        variosAlumnos && alumnoId === null ? (
          <div className="space-y-5">
            {[...gruposMensualidades.values()].map((grupo) => (
              <div key={grupo[0].alumno_id}>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <p className="truncate text-sm font-semibold text-[var(--portal-ink)]">{grupo[0].alumno_nombre}</p>
                  <p className="shrink-0 text-xs text-[var(--portal-muted)]">{grupo.length} mensualidad{grupo.length === 1 ? '' : 'es'}</p>
                </div>
                <ul className="space-y-2.5">{grupo.map(renderMensualidad)}</ul>
              </div>
            ))}
          </div>
        ) : (
          <ul className="space-y-2.5">{mensualidades.map(renderMensualidad)}</ul>
        )
      )}

      {/* Otros conceptos pendientes: inscripción y proyecto de inversión.
          No tienen botón "Pagar": el comprobante del portal solo aplica
          a mensualidades, este pago se coordina con administración. */}
      {otrosConceptos.length > 0 && (
        <div className="space-y-2.5 mt-2.5">
          {otrosConceptos.map((c) => (
            <div key={`${c.tipo}-${c.id}`} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3 bg-[var(--portal-canvas)] rounded-[var(--portal-radius-sm)] px-4 py-3.5">
              <div className="min-w-0 break-words">
                <p className="text-sm font-semibold text-[var(--portal-ink)]">{c.concepto}</p>
                <p className="text-xs text-[var(--ash)]">
                  {c.alumno_nombre || 'Aplica a toda la familia'}
                </p>
                {c.tipo === 'recargo_convenio' && <p className="mt-1 text-xs text-[var(--portal-muted)]">Generada el {fmtFecha(c.fecha_programada)} · Incluida en tu saldo pendiente.</p>}
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
