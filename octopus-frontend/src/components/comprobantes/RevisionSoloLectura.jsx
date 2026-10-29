import { Lock, Printer } from 'lucide-react';
import { etiquetaMetodo, formatearFecha, formatearFechaHora, formatearMonto } from './comprobantesUtils';
import { imprimirReciboPago } from '../../utils/reciboCobranza';

const Fila = ({ etiqueta, valor }) => (
  <div className="flex flex-col gap-0.5 py-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3" style={{ borderBottom: '0.5px solid var(--border)' }}>
    <dt className="text-xs sm:text-sm" style={{ color: 'var(--ash)' }}>{etiqueta}</dt>
    <dd className="text-sm font-medium break-words sm:text-right" style={{ color: 'var(--jet)' }}>{valor || '—'}</dd>
  </div>
);

const montoPago = (pago) => {
  const usd = Number(pago?.monto_usd) || 0;
  const ves = Number(pago?.monto_ves) || 0;
  if (usd > 0 && ves > 0) return `${formatearMonto(usd)} · ${formatearMonto(ves, 'VES')}`;
  if (ves > 0) return formatearMonto(ves, 'VES');
  return formatearMonto(usd);
};

/**
 * Comprobante ya procesado. Aprobado = se registró un pago en caja; se muestra
 * el `pago` resumido que devuelve el detalle y el botón del recibo (mismo PDF
 * del backend que imprime la caja). Rechazado = motivo comunicado.
 */
export default function RevisionSoloLectura({ comprobante }) {
  // El bloque `revision` de la v1 desaparece; se toleran ambos formatos.
  const revisadoPor = comprobante.revisado_por ?? comprobante.revision?.revisado_por;
  const fechaRevision = comprobante.fecha_revision ?? comprobante.revision?.fecha_revision;
  const aprobado = comprobante.estatus === 'aprobado';
  const pago = comprobante.pago || null;
  return (
    <div className="space-y-3">
      <p className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm" style={{ background: 'var(--surface-sunken)', color: 'var(--jet-mid)' }}>
        <Lock size={15} aria-hidden="true" className="shrink-0" />
        Este comprobante ya fue {aprobado ? 'aprobado' : 'rechazado'}; la revisión es de solo lectura.
      </p>
      <dl>
        {aprobado ? (
          pago ? (
            <>
              <Fila etiqueta="Pago registrado" valor={pago.factura_id ? `Recibo ${pago.factura_id}` : `#${pago.id}`} />
              <Fila etiqueta="Fecha del pago" valor={formatearFecha(pago.fecha_pago)} />
              <Fila etiqueta="Monto" valor={montoPago(pago)} />
              <Fila etiqueta="Método" valor={etiquetaMetodo(pago.metodo_pago)} />
              <Fila etiqueta="Referencia" valor={pago.referencia} />
            </>
          ) : (
            <Fila etiqueta="Pago registrado" valor="Sin pago asociado" />
          )
        ) : (
          <Fila etiqueta="Motivo comunicado" valor={<span className="whitespace-pre-line">{comprobante.observaciones}</span>} />
        )}
        <Fila etiqueta="Revisado por" valor={revisadoPor} />
        <Fila etiqueta="Fecha de revisión" valor={fechaRevision ? formatearFechaHora(fechaRevision) : null} />
        {aprobado && comprobante.observaciones && <Fila etiqueta="Observaciones" valor={comprobante.observaciones} />}
      </dl>
      {aprobado && pago?.id && (
        <button
          type="button"
          onClick={() => imprimirReciboPago(pago.id)}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 min-h-[44px] text-sm font-semibold sm:w-auto"
          style={{ border: '0.5px solid var(--border-md)', color: 'var(--jet)', background: 'var(--surface)' }}
        >
          <Printer size={16} aria-hidden="true" /> Ver recibo
        </button>
      )}
    </div>
  );
}
