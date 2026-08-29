import { useContext, useMemo } from 'react';
import { GraduationCap, Save, Plus, Pencil, Loader2, AlertTriangle } from 'lucide-react';
import { AuthContext } from '../context/AuthContext';
import GradoSelect from '../components/GradoSelect';
import { useNotas } from '../hooks/useNotas';
import { useLapsos } from '../hooks/useLapsos';
import { TablaNotas } from '../components/notas/TablaNotas';
import { ModalLapso } from '../components/notas/ModalLapso';
import { Modal } from '../components/ui/Modal';
import { PageHeader } from '../components/ui/PageHeader';
import { Card } from '../components/ui/Card';

const INPUT_STYLE = {
  border: '0.5px solid var(--border-md)',
  background: '#fff',
  color: 'var(--jet)',
  fontSize: '16px',
};

const Notas = () => {
  const { user } = useContext(AuthContext);
  const esAdmin = useMemo(() => ['director', 'sistemas'].includes(user?.rol), [user?.rol]);
  const esDocente = useMemo(() => user?.rol === 'docente', [user?.rol]);

  const {
    grado, materias, materiaId, lapsoId, notas,
    loading, loadingCombos, saving, dirty, pendingFiltro,
    cambiarGrado, cambiarMateria, cambiarLapso, resetLapso,
    handleNotaChange, guardar,
    confirmarDescartarCambios, cancelarDescartarCambios,
  } = useNotas(esDocente);

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
    <div className="animate-fadeIn pb-24 sm:pb-0">

      <PageHeader
        titulo="Registro de Notas"
        descripcion="Ingresa y actualiza las calificaciones por materia y lapso"
        acciones={(
          <button
            onClick={guardar}
            disabled={saving || !dirty || !notas.length}
            className="hidden sm:flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-all disabled:opacity-50 min-h-[44px] outline-none focus-visible:ring-2 focus-visible:ring-[var(--pb)]/40"
            style={{ background: 'var(--pb)' }}
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            {saving ? 'Guardando...' : 'Guardar notas'}
          </button>
        )}
      />

      {/* Filtros */}
      <div className={`grid grid-cols-1 ${esDocente ? 'md:grid-cols-2' : 'md:grid-cols-3'} gap-4 mb-6`}>

        {/* Grado — solo secretaria/director; el docente ve directo sus propias materias */}
        {!esDocente && (
          <div>
            <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>
              Grado / Año
            </label>
            <GradoSelect
              value={grado}
              onChange={e => cambiarGrado(e.target.value)}
              className="w-full px-3 py-2 rounded-lg text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--pb)]/40"
              style={INPUT_STYLE}
              incluirVacio
            />
          </div>
        )}

        {/* Materia */}
        <div>
          <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>
            Materia
          </label>
          <select
            className="w-full px-3 py-2 rounded-lg text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--pb)]/40 disabled:opacity-50 disabled:cursor-not-allowed"
            style={INPUT_STYLE}
            value={materiaId}
            onChange={e => cambiarMateria(e.target.value)}
            disabled={(!esDocente && !grado) || loadingCombos}
          >
            <option value="">{loadingCombos ? 'Cargando...' : 'Seleccionar materia...'}</option>
            {materias.map(m => (
              <option key={m.id} value={m.id}>{esDocente ? `${m.nombre} — ${m.grado_seccion}` : m.nombre}</option>
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
              className="flex-1 px-3 py-2 rounded-lg text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--pb)]/40"
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
                className="flex-shrink-0 flex items-center justify-center w-9 h-9 rounded-lg text-white outline-none focus-visible:ring-2 focus-visible:ring-[var(--pb)]/40 transition-colors hover:bg-[var(--pb-mid)]"
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
                className="flex-shrink-0 flex items-center justify-center w-9 h-9 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-[var(--pb)]/40 transition-colors hover:bg-[var(--ash-light)]"
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
        <Card>
          <div className="py-16 text-center" style={{ color: 'var(--ash)' }}>
            <GraduationCap size={40} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm">Selecciona grado, materia y lapso para ver las notas.</p>
          </div>
        </Card>
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

      {/* Modal confirmación al cambiar de filtro con notas sin guardar */}
      {pendingFiltro && (
        <Modal
          open
          onClose={cancelarDescartarCambios}
          titulo={(
            <>
              <AlertTriangle size={18} style={{ color: '#b45309' }} />
              Cambios sin guardar
            </>
          )}
          footer={(
            <>
              <button
                onClick={cancelarDescartarCambios}
                className="w-full sm:w-auto rounded-xl py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--pb)]/40 transition-colors hover:bg-[var(--ash-light)]"
                style={{ border: '0.5px solid var(--border-md)', color: 'var(--ash)' }}
              >
                Seguir editando
              </button>
              <button
                onClick={confirmarDescartarCambios}
                className="w-full sm:w-auto text-white rounded-xl py-2 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-[var(--red)]/40 transition-colors hover:brightness-90"
                style={{ background: 'var(--red)' }}
              >
                Descartar cambios y continuar
              </button>
            </>
          )}
          size="sm"
        >
          <p className="text-sm" style={{ color: 'var(--ash)' }}>
            Tienes notas sin guardar. Si continúas, se perderán los cambios realizados en esta materia/lapso.
          </p>
        </Modal>
      )}

      {/* Botón guardar sticky — solo mobile, visible cuando hay cambios */}
      {dirty && notas.length > 0 && (
        <div
          className="fixed bottom-0 left-0 right-0 p-4 sm:hidden z-40"
          style={{ background: 'var(--porcelain)', borderTop: '1px solid var(--border-md)' }}
        >
          <button
            onClick={guardar}
            disabled={saving}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-medium text-white disabled:opacity-50 outline-none focus-visible:ring-2 focus-visible:ring-[var(--pb)]/40"
            style={{ background: 'var(--pb)' }}
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            {saving ? 'Guardando...' : 'Guardar notas'}
          </button>
        </div>
      )}
    </div>
  );
};

export default Notas;
