import { useState } from 'react';
import { ChevronDown, ChevronUp, Plus, BookOpen, User, UserX, X } from 'lucide-react';
import { getColor } from '../../constants/horarios';
import { ModalMateria } from './ModalMateria';

export const PanelMaterias = ({ materias, savingMateria, onCrear, onActualizar, onEliminar, materiaActiva, onSeleccionarMateria, titulo = 'Materias del grado', permitirGestion = true, mostrarDocente = true, mensajeVacio, horasAsignadasPorMateria, instruccion }) => {
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
          aria-expanded={abierto}
          className="w-full px-4 py-3 flex items-center justify-between text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--pb)]/40"
          style={{ borderBottom: abierto ? '0.5px solid var(--border)' : 'none' }}
        >
          <span className="flex items-center gap-2 text-sm font-semibold" style={{ color: 'var(--jet)' }}>
            <BookOpen size={15} style={{ color: 'var(--pb)' }} />
            {titulo}
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
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-3">
              <p className="text-xs" style={{ color: materiaActiva ? 'var(--pb-mid)' : 'var(--ash)' }}>
                {materiaActiva ? <>Modo rápido: toca celdas vacías para ubicar <strong>{materiaActiva.nombre}</strong>.</> : (instruccion || 'Selecciona una materia para ubicarla con un toque en varias celdas.')}
              </p>
              {materiaActiva && <button type="button" onClick={() => onSeleccionarMateria(null)} className="w-full sm:w-auto inline-flex items-center justify-center gap-1 text-xs font-medium" style={{ color: 'var(--ash)' }}><X size={13} /> Salir del modo rápido</button>}
            </div>
            {materias.length === 0 ? (
              <p className="text-xs py-2" style={{ color: 'var(--ash)' }}>
                {mensajeVacio || 'Este grado no tiene materias. Agrega la primera para poder generar el horario.'}
              </p>
            ) : (
              <div className="flex flex-wrap gap-2 mb-3">
                {materias.map(m => {
                  const docenteNombre = m.docente_nombre || m.docente_username || m.docente?.username || null;
                  const horasAsignadas = horasAsignadasPorMateria?.[m.id];
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => onSeleccionarMateria(materiaActiva?.id === m.id ? null : m)}
                      onDoubleClick={() => abrirEditar(m)}
                      title={`Seleccionar ${m.nombre} para colocación rápida`}
                      aria-pressed={materiaActiva?.id === m.id}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all hover:opacity-80 group focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pb)]/50 focus-visible:ring-offset-1"
                      style={{
                        background: getColor(m.id),
                        border: materiaActiva?.id === m.id ? '2px solid var(--pb)' : !mostrarDocente || docenteNombre ? '1px solid rgba(0,0,0,0.07)' : '1px dashed var(--red)',
                        color: 'var(--jet)',
                      }}
                    >
                      <span>{m.nombre}</span>
                      {!mostrarDocente && m.grado_seccion && <span className="text-[10px] font-medium" style={{ color: 'var(--jet-mid)' }}>{m.grado_seccion}</span>}
                      {m.horas_academicas != null && <span className="px-1.5 py-0.5 rounded text-[10px] font-bold" style={{ background: 'rgba(0,0,0,0.08)' }}>{horasAsignadas != null ? `${horasAsignadas}/${m.horas_academicas}h` : `${m.horas_academicas}h`}</span>}
                      {/* Indicador de docente asignado — jerarquía visual clara para grados sin cubrir */}
                      {mostrarDocente && (docenteNombre ? (
                        <span className="flex items-center gap-1 text-[10px] font-normal" style={{ color: 'var(--jet-mid)' }}>
                          <User size={10} />
                          {docenteNombre}
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-[10px] font-semibold" style={{ color: 'var(--red)' }}>
                          <UserX size={10} />
                          Sin docente
                        </span>
                      ))}
                    </button>
                  );
                })}
              </div>
            )}

            {permitirGestion && <button
              type="button"
              onClick={abrirNueva}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors hover:bg-[var(--pb-light)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pb)]/40"
              style={{
                border: '0.5px dashed var(--border-md)',
                color: 'var(--pb)',
                background: 'transparent',
              }}
            >
              <Plus size={13} />
              Agregar materia
            </button>}
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
