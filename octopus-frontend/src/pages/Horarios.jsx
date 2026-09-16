import { useState, useMemo } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { GraduationCap, Printer, Wand2, Settings2, Package, ChevronLeft } from 'lucide-react';
import { useHorarios } from '../hooks/useHorarios';
import { usePaquetesHorario, useGradosPaquete } from '../hooks/usePaquetesHorario';
import { INPUT_STYLE } from '../constants/styles';
import { GrillaHorario } from '../components/horarios/GrillaHorario';
import { ModalClase } from '../components/horarios/ModalClase';
import { ModalGenerador } from '../components/horarios/ModalGenerador';
import { ResumenGeneracion } from '../components/horarios/ResumenGeneracion';
import { EditorBloques } from '../components/horarios/EditorBloques';
import { PanelMaterias } from '../components/horarios/PanelMaterias';
import { PageHeader } from '../components/ui/PageHeader';

const Horarios = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const paqueteId = searchParams.get('paquete') || '';

  const { paquetes, loading: loadingPaquetes } = usePaquetesHorario();
  const paqueteActual = useMemo(
    () => paquetes.find(p => String(p.id) === String(paqueteId)),
    [paquetes, paqueteId]
  );
  const { grados: gradosPaquete, loading: loadingGrados } = useGradosPaquete(paqueteId);

  const [grado, setGrado] = useState('');

  const {
    bloques, materias,
    loading, saving, savingMateria, generando,
    getClaseEnBloque,
    tieneConflicto,
    guardar, eliminar, pinear, generar, deshacerGeneracion, recargar,
    crearMateria, actualizarMateria, eliminarMateria,
  } = useHorarios(paqueteId, grado);

  // modal: null | { clase: objeto|null, bloque: bloque|null }
  const [modal, setModal]                 = useState(null);
  const [showGenerador, setShowGenerador]  = useState(false);
  const [resultadoGeneracion, setResultadoGeneracion] = useState(null);
  const [showEditorBloques, setShowEditorBloques]     = useState(false);

  const seleccionarPaquete = (id) => {
    setGrado('');
    setSearchParams(id ? { paquete: id } : {});
  };

  const abrirCelda = (bloque) => {
    setModal({ clase: null, bloque });
  };

  const editarClase = (clase) => {
    setModal({ clase, bloque: null });
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

  // Drag & drop: mover una clase existente a otro bloque (mismo día u otro)
  const handleMoverClase = async (clase, bloqueDestino) => {
    await guardar({
      id: clase.id,
      materia_id: clase.materia?.id,
      dia_semana: bloqueDestino.dia_semana,
      bloque_id: bloqueDestino.id,
      aula: clase.aula,
    });
  };

  const handleGenerar = async (config) => generar(config);

  const handleGeneradoOk = (data) => {
    setShowGenerador(false);
    setResultadoGeneracion(data);
    recargar();
  };

  // Paso 1: no hay paquete seleccionado — elegir uno
  if (!paqueteId) {
    return (
      <div className="animate-fadeIn">
        <PageHeader
          titulo="Horarios de Clases"
          descripcion="Selecciona un paquete de horario para ver o editar su grilla"
          acciones={
            <Link
              to="/horarios/paquetes"
              className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors"
              style={{ background: 'var(--pb)' }}
            >
              <Package size={16} />
              Gestionar paquetes
            </Link>
          }
        />

        {loadingPaquetes ? (
          <p className="text-sm" style={{ color: 'var(--ash)' }}>Cargando paquetes de horario...</p>
        ) : paquetes.length === 0 ? (
          <div className="rounded-xl p-16 text-center"
            style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)', color: 'var(--ash)' }}>
            <Package size={40} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm">Aún no hay paquetes de horario. Crea uno desde "Gestionar paquetes".</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {paquetes.map(p => (
              <button
                key={p.id}
                onClick={() => seleccionarPaquete(p.id)}
                className="text-left rounded-xl p-4 transition-colors hover:bg-[var(--pb-light)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pb)]/40"
                style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)' }}
              >
                <p className="text-sm font-semibold" style={{ color: 'var(--jet)' }}>{p.nombre}</p>
                <p className="text-xs mt-1" style={{ color: 'var(--ash)' }}>{p.periodo_escolar}</p>
                <p className="text-[11px] mt-2" style={{ color: 'var(--ash)' }}>
                  {p.grados?.length || 0} grado{(p.grados?.length || 0) !== 1 ? 's' : ''} · {p.estado === 'publicado' ? 'Publicado' : 'Borrador'}
                </p>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="animate-fadeIn">

      {/* Header — oculto al imprimir */}
      <div className="print:hidden">
        <PageHeader
          titulo={paqueteActual ? paqueteActual.nombre : 'Horarios de Clases'}
          descripcion="Visualiza y edita la grilla horaria por grado"
          acciones={
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => setShowEditorBloques(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors hover:bg-[var(--ash-light)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pb)]/40 focus-visible:ring-offset-2"
                style={{ border: '0.5px solid var(--border-md)', color: 'var(--ash)' }}
              >
                <Settings2 size={16} />
                Editar bloques
              </button>
              <button
                onClick={() => setShowGenerador(true)}
                disabled={!grado}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pb)]/40 focus-visible:ring-offset-2"
                style={{ background: 'var(--pb)' }}
                title={!grado ? 'Selecciona un grado primero' : 'Generar horario automáticamente'}
              >
                <Wand2 size={16} />
                Generar automático
              </button>
              <button
                onClick={() => window.print()}
                disabled={!grado || !bloques.length}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed hover:enabled:bg-[var(--ash-light)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pb)]/40 focus-visible:ring-offset-2"
                style={{ border: '0.5px solid var(--border-md)', color: 'var(--ash)' }}
              >
                <Printer size={16} />
                Vista imprimible
              </button>
            </div>
          }
        />
        <button
          onClick={() => setSearchParams({})}
          className="mb-4 flex items-center gap-1.5 text-xs font-medium"
          style={{ color: 'var(--pb)' }}
        >
          <ChevronLeft size={14} />
          Cambiar paquete de horario
        </button>
      </div>

      {/* Selector de grado (dentro del paquete) — oculto al imprimir */}
      <div className="mb-6 max-w-xs print:hidden">
        <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>
          Grado / Año
        </label>
        {loadingGrados ? (
          <p className="text-sm" style={{ color: 'var(--ash)' }}>Cargando grados...</p>
        ) : gradosPaquete.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--ash)' }}>
            Este paquete no tiene grados. Agrégalos desde{' '}
            <Link to="/horarios/paquetes" className="underline" style={{ color: 'var(--pb)' }}>Gestionar paquetes</Link>.
          </p>
        ) : (
          <select
            value={grado}
            onChange={e => setGrado(e.target.value)}
            className="w-full px-3 py-2 rounded-lg text-sm outline-none"
            style={INPUT_STYLE}
          >
            <option value="">Seleccionar...</option>
            {gradosPaquete.map(g => (
              <option key={g.id} value={g.grado_seccion}>{g.grado_seccion}</option>
            ))}
          </select>
        )}
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
          bloques={bloques}
          getClaseEnBloque={getClaseEnBloque}
          onCeldaClick={abrirCelda}
          onEditarClase={editarClase}
          onTogglePin={(clase) => pinear(clase.id, !clase.pineado)}
          onMoverClase={handleMoverClase}
        />
      )}

      {grado && !loading && !!bloques.length && (
        <p className="mt-3 text-xs print:hidden" style={{ color: 'var(--ash)' }}>
          Haz clic en una celda vacía para agregar clase, en una existente para editarla, o arrástrala a otro bloque para moverla.
        </p>
      )}

      {/* Modal clase (crear / editar) */}
      {modal && (
        <ModalClase
          materias={materias}
          claseInicial={modal.clase}
          bloque={modal.bloque}
          saving={saving}
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
          onClose={() => setShowGenerador(false)}
          onGenerar={handleGenerar}
          onGeneradoOk={handleGeneradoOk}
        />
      )}

      {/* Resumen post-generación */}
      {resultadoGeneracion && (
        <ResumenGeneracion
          resultado={resultadoGeneracion}
          deshaciendo={generando}
          onClose={() => setResultadoGeneracion(null)}
          onDeshacer={deshacerGeneracion}
        />
      )}

      {/* Editor de bloques de la jornada */}
      {showEditorBloques && (
        <EditorBloques
          paqueteId={paqueteId}
          onClose={() => { setShowEditorBloques(false); recargar(); }}
        />
      )}

    </div>
  );
};

export default Horarios;
