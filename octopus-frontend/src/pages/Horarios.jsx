import { useState, useEffect } from 'react';
import { Clock, GraduationCap, Printer, Wand2 } from 'lucide-react';
import GradoSelect from '../components/GradoSelect';
import { useHorarios } from '../hooks/useHorarios';
import { DIA_MAP } from '../constants/horarios';
import { INPUT_STYLE } from '../constants/styles';
import { GrillaHorario } from '../components/horarios/GrillaHorario';
import { ModalClase } from '../components/horarios/ModalClase';
import { ModalGenerador } from '../components/horarios/ModalGenerador';
import { PanelMaterias } from '../components/horarios/PanelMaterias';

const Horarios = () => {
  const {
    grado, setGrado,
    horarios, materias,
    loading, saving, savingMateria, generando,
    horasInicio, horasFin,
    getClaseEnCelda,
    tieneConflicto,
    guardar, eliminar, generar, recargar,
    crearMateria, actualizarMateria, eliminarMateria,
  } = useHorarios();

  // modal: null | { clase: objeto|null, celdaDefecto: {dia,hora}|null }
  const [modal, setModal]               = useState(null);
  const [showGenerador, setShowGenerador] = useState(false);

  // IDs de clases bloqueadas — el generador las respeta y no las mueve
  const [lockedIds, setLockedIds] = useState(new Set());

  // Limpiar locks al cambiar de grado (IDs ya no corresponden)
  useEffect(() => { setLockedIds(new Set()); }, [grado]);

  const toggleLock = (id) => setLockedIds(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const abrirCelda = (dia, hora) => {
    const clase = getClaseEnCelda(dia, hora);
    setModal({
      clase:         clase ?? null,
      celdaDefecto:  clase ? null : { dia: DIA_MAP[dia], hora },
    });
  };

  const cerrarModal = () => setModal(null);

  const handleGuardar = async (form) => {
    const ok = await guardar(form);
    if (ok) cerrarModal();
  };

  const handleEliminar = async (id) => {
    const ok = await eliminar(id);
    if (ok) cerrarModal();
  };

  const handleGeneradoOk = () => {
    setShowGenerador(false);
    recargar();
  };

  return (
    <div className="animate-fadeIn">

      {/* Header — oculto al imprimir */}
      <div className="mb-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 print:hidden">
        <div>
          <h2 className="text-lg font-medium flex items-center gap-2" style={{ color: 'var(--jet)' }}>
            <Clock size={20} style={{ color: 'var(--pb)' }} />
            Horarios de Clases
          </h2>
          <p className="text-sm mt-1" style={{ color: 'var(--ash)' }}>
            Visualiza y edita la grilla horaria por grado
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setShowGenerador(true)}
            disabled={!grado}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-40"
            style={{ background: 'var(--pb)' }}
            title={!grado ? 'Selecciona un grado primero' : 'Generar horario automáticamente'}
          >
            <Wand2 size={16} />
            Generar automático
          </button>
          <button
            onClick={() => window.print()}
            disabled={!grado || !horarios.length}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
            style={{ border: '0.5px solid var(--border-md)', color: 'var(--ash)' }}
          >
            <Printer size={16} />
            Vista imprimible
          </button>
        </div>
      </div>

      {/* Selector de grado — oculto al imprimir */}
      <div className="mb-6 max-w-xs print:hidden">
        <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>
          Grado / Año
        </label>
        <GradoSelect
          value={grado}
          onChange={e => setGrado(e.target.value)}
          className="w-full px-3 py-2 rounded-lg text-sm outline-none"
          style={INPUT_STYLE}
          incluirVacio
        />
      </div>

      {/* Panel de materias — solo cuando hay grado seleccionado */}
      {grado && (
        <PanelMaterias
          materias={materias}
          savingMateria={savingMateria}
          onCrear={crearMateria}
          onActualizar={actualizarMateria}
          onEliminar={eliminarMateria}
        />
      )}

      {/* Título visible solo al imprimir */}
      {grado && (
        <h2 className="hidden print:block text-lg font-bold mb-4" style={{ color: 'var(--jet)' }}>
          Horario de Clases — {grado}
        </h2>
      )}

      {/* Contenido principal */}
      {!grado ? (
        <div className="rounded-xl p-16 text-center"
          style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)', color: 'var(--ash)' }}>
          <GraduationCap size={40} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">Selecciona un grado para ver el horario.</p>
        </div>
      ) : (
        <GrillaHorario
          loading={loading}
          isEmpty={!loading && !horarios.length}
          horasInicio={horasInicio}
          getClaseEnCelda={getClaseEnCelda}
          onCeldaClick={abrirCelda}
          lockedIds={lockedIds}
          onToggleLock={toggleLock}
        />
      )}

      {grado && !loading && !!horarios.length && (
        <p className="mt-3 text-xs print:hidden" style={{ color: 'var(--ash)' }}>
          Haz clic en una celda vacía para agregar clase, o en una existente para editarla.
        </p>
      )}

      {/* Modal clase (crear / editar) */}
      {modal && (
        <ModalClase
          materias={materias}
          claseInicial={modal.clase}
          celdaDefecto={modal.celdaDefecto}
          saving={saving}
          horasInicio={horasInicio}
          horasFin={horasFin}
          tieneConflicto={tieneConflicto}
          onClose={cerrarModal}
          onSave={handleGuardar}
          onDelete={handleEliminar}
        />
      )}

      {/* Modal generador automático */}
      {showGenerador && (
        <ModalGenerador
          generando={generando}
          lockedIds={lockedIds}
          onClose={() => setShowGenerador(false)}
          onGenerar={generar}
          onGeneradoOk={handleGeneradoOk}
        />
      )}

    </div>
  );
};

export default Horarios;
