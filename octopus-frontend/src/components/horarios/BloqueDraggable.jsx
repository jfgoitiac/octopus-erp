import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { Edit3, Lock, LockOpen } from 'lucide-react';
import { getColor } from '../../constants/horarios';

// Chip de una clase ya colocada en la grilla. Arrastrable con @dnd-kit salvo
// que esté pineada (pineado=true) — una clase pineada solo se edita/despinea
// por click, no se puede soltar encima de otra celda.
export const BloqueDraggable = ({ clase, onClick, onTogglePin }) => {
  const pineado = !!clase.pineado;
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `clase-${clase.id}`,
    data: { clase },
    disabled: pineado,
  });

  const style = transform ? {
    transform: CSS.Translate.toString(transform),
    zIndex: isDragging ? 50 : undefined,
    opacity: isDragging ? 0.6 : undefined,
  } : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...(pineado ? {} : listeners)}
      {...(pineado ? {} : attributes)}
      className="relative w-full rounded-lg px-2 py-2 text-left group touch-none"
    >
      <button
        type="button"
        onClick={() => onClick(clase)}
        aria-label={`Editar ${clase.materia?.nombre || 'clase'}`}
        className="w-full text-left rounded-lg transition-all hover:opacity-80 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pb)]/50 focus-visible:ring-offset-1"
        style={{
          background: getColor(clase.materia?.id),
          border: pineado ? '2px solid #7c3aed' : '1px solid rgba(0,0,0,0.07)',
          padding: '0.4rem 0.5rem',
        }}
      >
        <p className="text-[11px] font-bold leading-tight" style={{ color: 'var(--jet)' }}>
          {clase.materia?.nombre || 'Materia'}
        </p>
        {clase.aula && (
          <p className="text-[10px] mt-0.5" style={{ color: 'var(--ash)' }}>{clase.aula}</p>
        )}
        <p className="text-[9px] mt-0.5 opacity-60" style={{ color: 'var(--jet)' }}>
          {clase.hora_inicio} – {clase.hora_fin}
        </p>
      </button>

      {onTogglePin && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onTogglePin(clase); }}
          aria-label={pineado ? 'Despinear clase (permitir moverla)' : 'Pinear clase (el generador no la moverá)'}
          className={`absolute top-1 left-1 p-0.5 rounded transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pb)]/60 ${pineado ? 'flex' : 'hidden group-hover:flex group-focus-within:flex'}`}
          style={{ background: 'rgba(255,255,255,0.85)' }}
        >
          {pineado
            ? <Lock size={10} style={{ color: '#7c3aed' }} />
            : <LockOpen size={10} style={{ color: 'var(--ash)' }} />
          }
        </button>
      )}

      <div className="absolute top-1 right-1 hidden group-hover:flex gap-1">
        <span className="p-0.5 rounded" style={{ background: 'rgba(255,255,255,0.8)' }}>
          <Edit3 size={10} style={{ color: 'var(--pb)' }} />
        </span>
      </div>
    </div>
  );
};
