import { useContext, useMemo } from 'react';
import { BookOpen, GraduationCap, Save, Plus, Pencil, Loader2, AlertTriangle } from 'lucide-react';
import { AuthContext } from '../context/AuthContext';
import GradoSelect from '../components/GradoSelect';
import { useNotas } from '../hooks/useNotas';
import { useLapsos } from '../hooks/useLapsos';
import { TablaNotas } from '../components/notas/TablaNotas';
import { ModalLapso } from '../components/notas/ModalLapso';

const INPUT_STYLE = {
  border: '0.5px solid var(--border-md)',
  background: '#fff',
  color: 'var(--jet)',
  fontSize: '16px',
};

const Notas = () => {
  const { user } = useContext(AuthContext);
  const esAdmin = useMemo(() => ['director', 'sistemas'].includes(user?.rol), [user?.rol]);

  const {
    grado, materias, materiaId, lapsoId, notas,
    loading, loadingCombos, saving, dirty,
    cambiarGrado, cambiarMateria, cambiarLapso, resetLapso,
    handleNotaChange, guardar,
  } = useNotas();

  const {
    lapsos, modalLapso,
    lapsoEditando, formLapso, setFormLapso,
    guardandoLapso, cerrandoLapso,
    confirmCerrar, setConfirmCerrar,
    abrirModalCrear, abrirModalEditar, cerrarModal,
    guardarLapso, cerrarLapso,
  } = useLapsos();

  const lapsoSeleccionado = useMemo(
    () => lapsos.find(l => String(l.id) === String(lapsoId)),
    [lapsos, lapsoId],
  );

  const handleCerrarLapso = async () => {
    const cerrado = await cerrarLapso(lapsoId);
    if (cerrado) resetLapso();
  };

  return (
    <div className="animate-fadeIn">

      {/* Header */}
      <div className="mb-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-lg font-medium flex items-center gap-2" style={{ color: 'var(--jet)' }}>
            <BookOpen size={20} style={{ color: 'var(--pb)' }} />
            Registro de Notas
          </h2>
          <p className="text-sm mt-1" style={{ color: 'var(--ash)' }}>
            Ingresa y actualiza las calificaciones por materia y lapso
          </p>
        </div>
        <button
          onClick={guardar}
          disabled={saving || !dirty || !notas.length}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-all disabled:opacity-50 min-h-[44px]"
          style={{ background: 'var(--pb)' }}
        >
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          {saving ? 'Guardando...' : 'Guardar notas'}
        </button>
      </div>

      {/* Filtros */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">

        {/* Grado */}
        <div>
          <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>
            Grado / Año
          </label>
          <GradoSelect
            value={grado}
            onChange={e => cambiarGrado(e.target.value)}
            className="w-full px-3 py-2 rounded-lg text-sm outline-none"
            style={INPUT_STYLE}
            incluirVacio
          />
        </div>

        {/* Materia */}
        <div>
          <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>
            Materia
          </label>
          <select
            className="w-full px-3 py-2 rounded-lg text-sm outline-none"
            style={INPUT_STYLE}
            value={materiaId}
            onChange={e => cambiarMateria(e.target.value)}
            disabled={!grado || loadingCombos}
          >
            <option value="">{loadingCombos ? 'Cargando...' : 'Seleccionar materia...'}</option>
            {materias.map(m => (
              <option key={m.id} value={m.id}>{m.nombre}</option>
            ))}
          </select>
        </div>

        {/* Lapso + botones de gestión */}
        <div>
          <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>
            Lapso
          </label>
          <div className="flex gap-2 items-center">
            <select
              className="flex-1 px-3 py-2 rounded-lg text-sm outline-none"
              style={INPUT_STYLE}
              value={lapsoId}
              onChange={e => cambiarLapso(e.target.value)}
            >
              <option value="">Seleccionar lapso...</option>
              {lapsos.map(l => (
                <option key={l.id} value={l.id}>
                  {l.nombre} — {l.periodo_escolar}{!l.activo ? ' (cerrado)' : ''}
                </option>
              ))}
            </select>

            {esAdmin && (
              <button
                onClick={abrirModalCrear}
                title="Crear nuevo lapso"
                aria-label="Crear nuevo lapso"
                className="flex-shrink-0 p-2 rounded-lg text-white"
                style={{ background: 'var(--pb)' }}
              >
                <Plus size={16} />
              </button>
            )}

            {esAdmin && lapsoId && (
              <button
                onClick={() => abrirModalEditar(lapsoId)}
                title="Editar lapso seleccionado"
                aria-label="Editar lapso seleccionado"
                className="flex-shrink-0 p-2 rounded-lg"
                style={{ border: '0.5px solid var(--border-md)', color: 'var(--ash)', background: '#fff' }}
              >
                <Pencil size={15} />
              </button>
            )}
          </div>

          {lapsoSeleccionado && !lapsoSeleccionado.activo && (
            <p className="text-[11px] mt-1 flex items-center gap-1" style={{ color: 'var(--red)' }}>
              <AlertTriangle size={11} /> Este lapso está cerrado — las notas son de solo lectura
            </p>
          )}
        </div>
      </div>

      {/* Tabla o estado vacío */}
      {(!materiaId || !lapsoId) ? (
        <div
          className="rounded-xl p-16 text-center"
          style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)', color: 'var(--ash)' }}
        >
          <GraduationCap size={40} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">Selecciona grado, materia y lapso para ver las notas.</p>
        </div>
      ) : (
        <TablaNotas
          notas={notas}
          loading={loading}
          lapsoActivo={!lapsoSeleccionado || lapsoSeleccionado.activo}
          onNotaChange={handleNotaChange}
        />
      )}

      {/* Modal crear / editar lapso */}
      {modalLapso && (
        <ModalLapso
          lapsoEditando={lapsoEditando}
          formLapso={formLapso}
          setFormLapso={setFormLapso}
          guardando={guardandoLapso}
          cerrando={cerrandoLapso}
          confirmCerrar={confirmCerrar}
          onConfirmCerrar={() => setConfirmCerrar(true)}
          onCancelCerrar={() => setConfirmCerrar(false)}
          onGuardar={guardarLapso}
          onCerrarLapso={handleCerrarLapso}
          onClose={cerrarModal}
        />
      )}
    </div>
  );
};

export default Notas;
