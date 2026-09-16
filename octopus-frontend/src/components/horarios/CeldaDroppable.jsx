import { Plus } from 'lucide-react';
import { useDroppable } from '@dnd-kit/core';
import { BloqueDraggable } from './BloqueDraggable';

// Celda destino de la grilla. Un bloque `tipo='receso'` nunca es droppable
// (no admite clases); una celda sin bloque en ese día/hora (hueco) tampoco.
// `cellKey` (ej. "lunes-07:00") da un id estable al droppable cuando no hay
// bloque, para no generar un id nuevo (impuro) en cada render.
export const CeldaDroppable = ({ bloque, clase, cellKey, onCeldaClick, onEditarClase, onTogglePin }) => {
  const droppable = useDroppable({
    id: bloque ? `bloque-${bloque.id}` : `vacio-${cellKey}`,
    data: { bloque },
    disabled: !bloque || bloque.tipo !== 'clase',
  });

  if (!bloque) {
    // Hueco: este día no tiene bloque definido a esta hora (jornadas distintas por día)
    return <div className="w-full h-12 rounded-lg" style={{ background: 'transparent' }} />;
  }

  const { setNodeRef, isOver } = droppable;
  const puedeSoltar = bloque.tipo === 'clase' && !clase;

  return (
    <div
      ref={setNodeRef}
      className="w-full min-h-12 rounded-lg transition-colors"
      style={{
        background: isOver && puedeSoltar ? 'var(--pb-light)' : 'transparent',
        outline: isOver && puedeSoltar ? '2px dashed var(--pb)' : 'none',
      }}
    >
      {clase ? (
        <BloqueDraggable clase={clase} onClick={onEditarClase} onTogglePin={onTogglePin} />
      ) : bloque.tipo === 'receso' ? (
        // Receso "suelto" (no forma parte de la fila unificada porque la
        // jornada varía por día) — hueco no interactivo, nunca abre ModalClase.
        <div className="w-full h-12 rounded-lg" style={{ background: 'transparent' }} />
      ) : (
        <button
          onClick={() => onCeldaClick(bloque)}
          aria-label={`Agregar clase — ${bloque.dia_semana} ${bloque.hora_inicio}`}
          className="group/empty w-full h-12 rounded-lg flex items-center justify-center transition-colors hover:bg-[var(--pb-light)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pb)]/50"
          style={{ border: '1px dashed var(--border-md)', color: 'var(--ash)' }}
        >
          <Plus size={14} className="opacity-40 transition-opacity group-hover/empty:opacity-100 group-focus-visible/empty:opacity-100" />
        </button>
      )}
    </div>
  );
};
