import { CheckCircle2, Clock, Eye, MessageSquareWarning } from 'lucide-react';
import { ESTADOS_REVISION } from './CierreFormato';

const ICONOS = { pendiente: Clock, revisado: Eye, aprobado: CheckCircle2, observado: MessageSquareWarning };

// Badge del estado de revisión de un cierre (pendiente/revisado/aprobado/observado).
export default function EstadoRevisionBadge({ estado, className = '' }) {
  const meta = ESTADOS_REVISION[estado] ?? { etiqueta: estado || '—', color: 'var(--ash)', fondo: 'var(--ash-light)' };
  const Icono = ICONOS[estado] ?? Clock;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ${className}`}
      style={{ color: meta.color, background: meta.fondo }}
    >
      <Icono size={12} aria-hidden="true" />
      {meta.etiqueta}
    </span>
  );
}
