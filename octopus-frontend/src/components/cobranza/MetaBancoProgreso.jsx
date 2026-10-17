import { Target } from 'lucide-react';

const dinero = (valor) => Number(valor || 0).toLocaleString('en-US', {
  minimumFractionDigits: 2, maximumFractionDigits: 2,
});

export default function MetaBancoProgreso({ progreso }) {
  if (!progreso?.meta) return null;
  const porcentaje = Math.max(0, Number(progreso.porcentaje || 0));
  return <div className="rounded-lg p-3 space-y-2" style={{ border: '1px solid var(--pb)', background: 'var(--pb-light)' }} aria-label={`Meta de ${progreso.meta.banco_nombre}`}>
    <div className="flex items-center justify-between gap-2"><span className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: 'var(--pb-mid)' }}><Target size={14} /> Meta · {progreso.meta.banco_nombre}</span><span className="text-xs font-bold" style={{ color: 'var(--pb)' }}>{porcentaje.toFixed(0)}%</span></div>
    <p className="text-sm font-semibold tabular-nums" style={{ color: 'var(--jet)' }}>${dinero(progreso.acumulado_usd)} <span className="font-normal" style={{ color: 'var(--ash)' }}>de ${dinero(progreso.objetivo_usd)}</span></p>
    <div className="h-2 rounded-full overflow-hidden" style={{ background: '#fff' }}><div className="h-full rounded-full" style={{ width: `${Math.min(100, porcentaje)}%`, background: 'var(--pb)' }} /></div>
    <p className="text-xs" style={{ color: 'var(--ash)' }}>Faltan ${dinero(progreso.restante_usd)}</p>
  </div>;
}
