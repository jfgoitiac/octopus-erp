import { Lock } from 'lucide-react';
import { etiquetaMetodo, formatearFecha, formatearFechaHora, formatearMonto } from './comprobantesUtils';

const Fila = ({ etiqueta, valor }) => (
  <div className="flex flex-col gap-0.5 py-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3" style={{ borderBottom: '0.5px solid var(--border)' }}>
    <dt className="text-xs sm:text-sm" style={{ color: 'var(--ash)' }}>{etiqueta}</dt>
    <dd className="text-sm font-medium break-words sm:text-right" style={{ color: 'var(--jet)' }}>{valor || '—'}</dd>
  </div>
);

/** Revisión de un comprobante ya procesado (aprobado o rechazado). */
export default function RevisionSoloLectura({ comprobante }) {
  const r = comprobante.revision || {};
  const aprobado = comprobante.estatus === 'aprobado';
  return (
    <div className="space-y-3">
      <p className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm" style={{ background: 'var(--surface-sunken)', color: 'var(--jet-mid)' }}>
        <Lock size={15} aria-hidden="true" />
        Este comprobante ya fue {aprobado ? 'aprobado' : 'rechazado'}; la revisión es de solo lectura.
      </p>
      <dl>
        {aprobado ? (
          <>
            <Fila etiqueta="Referencia" valor={comprobante.referencia_bancaria} />
            <Fila etiqueta="Método" valor={etiquetaMetodo(comprobante.metodo_pago)} />
            <Fila etiqueta="Banco receptor" valor={comprobante.banco_receptor_nombre} />
            <Fila etiqueta="Fecha del pago" valor={formatearFecha(r.fecha_pago)} />
            <Fila etiqueta="Monto recibido" valor={r.monto_recibido ? formatearMonto(r.monto_recibido, r.moneda) : null} />
            <Fila etiqueta="Tasa aplicada" valor={r.tasa_aplicada ? `Bs. ${Number(r.tasa_aplicada).toLocaleString('es-VE', { maximumFractionDigits: 4 })}` : null} />
            <Fila etiqueta="Abonado a la mensualidad" valor={formatearMonto(r.monto_usd_aplicado)} />
            {r.pago_id && <Fila etiqueta="Pago registrado" valor={`#${r.pago_id}`} />}
          </>
        ) : (
          <Fila etiqueta="Motivo comunicado" valor={<span className="whitespace-pre-line">{comprobante.observaciones}</span>} />
        )}
        <Fila etiqueta="Revisado por" valor={r.revisado_por} />
        <Fila etiqueta="Fecha de revisión" valor={r.fecha_revision ? formatearFechaHora(r.fecha_revision) : null} />
        {aprobado && comprobante.observaciones && <Fila etiqueta="Observaciones" valor={comprobante.observaciones} />}
      </dl>
    </div>
  );
}
