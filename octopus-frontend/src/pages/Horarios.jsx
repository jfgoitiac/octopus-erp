import { useState } from 'react';
import { Clock, GraduationCap, Printer, Wand2 } from 'lucide-react';
import { GradoSelect } from '../constants/grados';
import { useHorarios } from '../hooks/useHorarios';
import { DIA_MAP } from '../constants/horarios';
import { GrillaHorario } from '../components/horarios/GrillaHorario';
import { ModalClase } from '../components/horarios/ModalClase';
import { ModalGenerador } from '../components/horarios/ModalGenerador';

const INPUT_STYLE = {
  border: '0.5px solid var(--border-md)',
  background: '#fff',
  color: 'var(--jet)',
};

const Horarios = () => {
  const {
    grado, setGrado,
    horarios, materias,
    loading, saving, generando,
    getClaseEnCelda,
    guardar, eliminar, generar, recargar,
  } = useHorarios();

  // modal: null | { clase: objeto|null, celdaDefecto: {dia,hora}|null }
  const [modal, setModal]             = useState(null);
  const [showGenerador, setShowGenerador] = useState(false);

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

      {/* Header */}
      <div className="mb-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
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

      {/* Selector de grado */}
      <div className="mb-6 max-w-xs">
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
          getClaseEnCelda={getClaseEnCelda}
          onCeldaClick={abrirCelda}
        />
      )}

      {grado && !loading && (
        <p className="mt-3 text-xs" style={{ color: 'var(--ash)' }}>
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
          onClose={cerrarModal}
          onSave={handleGuardar}
          onDelete={handleEliminar}
        />
      )}

      {/* Modal generador automático */}
      {showGenerador && (
        <ModalGenerador
          generando={generando}
          onClose={() => setShowGenerador(false)}
          onGenerar={generar}
          onGeneradoOk={handleGeneradoOk}
        />
      )}

    </div>
  );
};

export default Horarios;
