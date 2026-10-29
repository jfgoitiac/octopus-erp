import { AlertTriangle, CalendarDays, GraduationCap, UserRound } from 'lucide-react';
import { ESTILO_ESTATUS, formatearFechaHora, formatearMonto } from './comprobantesUtils';

const Dato = ({ icono: Icono, etiqueta, valor, detalle }) => (
  <div className="flex min-w-0 items-start gap-2.5">
    <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg" style={{ background: 'var(--pb-light)', color: 'var(--pb-mid)' }}>
      <Icono size={16} aria-hidden="true" />
    </span>
    <div className="min-w-0">
      <p className="text-xs" style={{ color: 'var(--ash)' }}>{etiqueta}</p>
      <p className="truncate text-sm font-semibold" style={{ color: 'var(--jet)' }}>{valor || '—'}</p>
      {detalle && <p className="truncate text-xs" style={{ color: 'var(--ash)' }}>{detalle}</p>}
    </div>
  </div>
);

const Monto = ({ etiqueta, valor, destacado }) => (
  <div className="rounded-xl px-3 py-2.5" style={{ background: destacado ? 'var(--pb-light)' : 'var(--surface-sunken)' }}>
    <p className="text-xs" style={{ color: 'var(--ash)' }}>{etiqueta}</p>
    <p className="text-base font-semibold tabular-nums sm:text-lg" style={{ color: destacado ? 'var(--pb-mid)' : 'var(--jet)' }}>
      {formatearMonto(valor)}
    </p>
  </div>
);

export default function ResumenComprobante({ comprobante }) {
  const advertencias = comprobante.advertencias || [];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="mr-auto text-base font-semibold sm:text-lg" style={{ color: 'var(--jet)' }}>
          Comprobante #{comprobante.id}
        </h2>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${ESTILO_ESTATUS[comprobante.estatus] || 'bg-gray-100 text-gray-600'}`}>
          {comprobante.estatus}
        </span>
      </div>

      {advertencias.length > 0 && (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 sm:p-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-red-800">
            <AlertTriangle size={16} aria-hidden="true" /> Revisa con cuidado antes de aprobar
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-6 text-sm text-red-800">
            {advertencias.map((a) => <li key={a}>{a}</li>)}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Dato icono={GraduationCap} etiqueta="Alumno" valor={comprobante.alumno} detalle={comprobante.grado || 'Sin grado'} />
        <Dato icono={UserRound} etiqueta="Representante" valor={comprobante.representante} detalle={comprobante.representante_cedula ? `C.I. ${comprobante.representante_cedula}` : null} />
        <Dato icono={CalendarDays} etiqueta="Mensualidad" valor={comprobante.mensualidad} />
        <Dato icono={CalendarDays} etiqueta="Enviado" valor={formatearFechaHora(comprobante.fecha_subida)} />
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Monto etiqueta="Monto de la mensualidad" valor={comprobante.monto_usd} />
        <Monto etiqueta="Ya pagado" valor={comprobante.monto_pagado_usd} />
        <Monto etiqueta="Saldo pendiente" valor={comprobante.saldo_pendiente_usd} destacado />
      </div>
    </div>
  );
}
