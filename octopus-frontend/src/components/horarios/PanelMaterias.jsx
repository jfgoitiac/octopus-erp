import { useState } from 'react';
import { ChevronDown, ChevronUp, Plus, Pencil, BookOpen } from 'lucide-react';
import { getColor } from '../../constants/horarios';
import { ModalMateria } from './ModalMateria';

export const PanelMaterias = ({ materias, savingMateria, onCrear, onActualizar, onEliminar }) => {
  const [abierto, setAbierto]   = useState(true);
  const [modal, setModal]       = useState(null); // null | { materia: obj|null }

  const abrirNueva   = ()  => setModal({ materia: null });
  const abrirEditar  = (m) => setModal({ materia: m });
  const cerrarModal  = ()  => setModal(null);

  const handleSave = async (form) => {
    const ok = form.id ? await onActualizar(form) : await onCrear(form);
    if (ok) cerrarModal();
  };

  const handleDelete = async (id) => {
    const ok = await onEliminar(id);
    if (ok) cerrarModal();
  };

  return (
    <>
      <div className="mb-5 rounded-xl overflow-hidden print:hidden"
        style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)' }}>

        {/* Cabecera colapsable */}
        <button
          type="button"
          onClick={() => setAbierto(p => !p)}
          className="w-full px-4 py-3 flex items-center justify-between text-left"
          style={{ borderBottom: abierto ? '0.5px solid var(--border)' : 'none' }}
        >
          <span className="flex items-center gap-2 text-sm font-semibold" style={{ color: 'var(--jet)' }}>
            <BookOpen size={15} style={{ color: 'var(--pb)' }} />
            Materias del grado
            <span className="text-[11px] font-normal px-2 py-0.5 rounded-full"
              style={{ background: 'var(--border-md)', color: 'var(--ash)' }}>
              {materias.length}
            </span>
          </span>
          {abierto ? <ChevronUp size={16} style={{ color: 'var(--ash)' }} /> : <ChevronDown size={16} style={{ color: 'var(--ash)' }} />}
        </button>

        {/* Contenido */}
        {abierto && (
          <div className="px-4 py-3">
            {materias.length === 0 ? (
              <p className="text-xs py-2" style={{ color: 'var(--ash)' }}>
                Este grado no tiene materias. Agrega la primera para poder generar el horario.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2 mb-3">
                {materias.map(m => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => abrirEditar(m)}
                    title={`Editar ${m.nombre}`}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all hover:opacity-80 group"
                    style={{
                      background: getColor(m.id),
                      border: '1px solid rgba(0,0,0,0.07)',
                      color: 'var(--jet)',
                    }}
                  >
                    <span>{m.nombre}</span>
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold"
                      style={{ background: 'rgba(0,0,0,0.08)' }}>
                      {m.horas_academicas}h
                    </span>
                    <Pencil size={10} className="opacity-0 group-hover:opacity-60 transition-opacity" />
                  </button>
                ))}
              </div>
            )}

            <button
              type="button"
              onClick={abrirNueva}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
              style={{
                border: '0.5px dashed var(--border-md)',
                color: 'var(--pb)',
                background: 'transparent',
              }}
            >
              <Plus size={13} />
              Agregar materia
            </button>
          </div>
        )}
      </div>

      {modal && (
        <ModalMateria
          materia={modal.materia}
          saving={savingMateria}
          onClose={cerrarModal}
          onSave={handleSave}
          onDelete={handleDelete}
        />
      )}
    </>
  );
};
