import { CheckCircle2, CircleDashed, TriangleAlert } from 'lucide-react';
import { ESTILOS_DIFERENCIA } from './calculosCierre';

const ICONOS = {
  cuadrado: CheckCircle2,
  faltante: TriangleAlert,
  sobrante: TriangleAlert,
  invalido: TriangleAlert,
};

// Estado de una diferencia: siempre palabra e icono, nunca solo color.
export default function EstadoDiferencia({ tipo, texto, id, enVivo = false }) {
  const Icono = ICONOS[tipo] ?? CircleDashed;
  return (
    <p
      id={id}
      aria-live={enVivo ? 'polite' : undefined}
      className="flex items-center gap-1.5 text-sm font-medium tabular-nums min-w-0"
      style={{ color: ESTILOS_DIFERENCIA[tipo]?.tinta ?? 'var(--jet-mid)' }}
    >
      <Icono size={16} aria-hidden="true" className="shrink-0" />
      <span className="min-w-0 break-words">{texto}</span>
    </p>
  );
}
