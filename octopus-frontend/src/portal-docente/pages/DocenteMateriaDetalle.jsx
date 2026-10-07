import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { datepickerPopperContainer } from '../../utils/datepickerPortal';
import { ArrowLeft, BookOpen, Calendar, FileText, Save, Loader2, Plus, AlertTriangle, Users, ClipboardList, TrendingUp, TrendingDown, Layers, List } from 'lucide-react';

import { getMateria, getLapsos, getNotasGrado, saveNotas } from '../api/academico.service';
import { useDocenteMateriales } from '../hooks/useDocenteMateriales';
import { useDocenteComparacionMateria } from '../hooks/useDocenteComparacionMateria';
import { useAsistenciaClase } from '../hooks/useAsistenciaClase';
import { calcDefinitiva } from '../../utils/notas.utils';
import { TablaNotas } from '../../components/notas/TablaNotas';
import FilaAlumno from '../../components/asistencia/FilaAlumno';
import SkeletonFila from '../../components/asistencia/SkeletonFila';
import PaseListaTarjetas from '../../components/asistencia/PaseListaTarjetas';
import { Modal } from '../../components/ui/Modal';
import TarjetaMaterial from '../../components/materiales/TarjetaMaterial';
import ModalNuevoMaterial from '../../components/materiales/ModalNuevoMaterial';
import SkeletonCard from '../../portal/components/SkeletonCard';
import PlanEvaluacionPanel from '../components/planEvaluacion/PlanEvaluacionPanel';

const TABS = [
  { id: 'notas', label: 'Notas', icon: BookOpen },
  { id: 'asistencia', label: 'Asistencia', icon: Calendar },
  { id: 'plan-evaluacion', label: 'Plan de Evaluación', icon: ClipboardList },
  { id: 'material', label: 'Material', icon: FileText },
];

const TAB_IDS = TABS.map(t => t.id);

// Preferencia de vista del tab Asistencia ("tarjetas" | "lista"), por navegador.
const VISTA_ASISTENCIA_KEY = 'docente_asistencia_vista';
const VISTAS_ASISTENCIA = [
  { id: 'tarjetas', label: 'Tarjetas', icon: Layers },
  { id: 'lista', label: 'Lista', icon: List },
];

function leerVistaAsistencia() {
  try {
    return localStorage.getItem(VISTA_ASISTENCIA_KEY) === 'lista' ? 'lista' : 'tarjetas';
  } catch {
    return 'tarjetas';
  }
}

const DocenteMateriaDetalle = () => {
  const { materiaId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Deep-links: si vienen `tab`/`lapso` en la URL, se usan como valor inicial
  // (no se resincronizan luego para no interferir con la navegación normal).
  const tabInicial = searchParams.get('tab');
  const lapsoInicial = searchParams.get('lapso');

  const [tab, setTab] = useState(TAB_IDS.includes(tabInicial) ? tabInicial : 'notas');
  const [materia, setMateria] = useState(null);
  const [loadingMateria, setLoadingMateria] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    setLoadingMateria(true);
    getMateria(materiaId, controller.signal)
      .then(res => {
        if (controller.signal.aborted) return;
        setMateria(res.data);
      })
      .catch(err => {
        if (err.code === 'ERR_CANCELED' || controller.signal.aborted) return;
        toast.error('No se pudo cargar la materia.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingMateria(false);
      });
    return () => controller.abort();
  }, [materiaId]);

  // ── Tab Notas ──────────────────────────────────────────────────────────
  const [lapsos, setLapsos] = useState([]);
  const [lapsoId, setLapsoId] = useState(lapsoInicial || '');
  const [notas, setNotas] = useState([]);
  const [loadingNotas, setLoadingNotas] = useState(false);
  const [savingNotas, setSavingNotas] = useState(false);
  const [dirtyNotas, setDirtyNotas] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    getLapsos(undefined, controller.signal)
      .then(res => {
        if (controller.signal.aborted) return;
        setLapsos(res.data || []);
      })
      .catch(err => {
        if (err.code === 'ERR_CANCELED' || controller.signal.aborted) return;
        toast.error('No se pudieron cargar los lapsos.');
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!lapsoId) { setNotas([]); return; }
    const controller = new AbortController();
    setLoadingNotas(true);
    setDirtyNotas(false);
    getNotasGrado(materiaId, lapsoId, controller.signal)
      .then(res => {
        if (controller.signal.aborted) return;
        setNotas(res.data || []);
      })
      .catch(err => {
        if (err.code === 'ERR_CANCELED' || controller.signal.aborted) return;
        toast.error('No se pudieron cargar las notas.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingNotas(false);
      });
    return () => controller.abort();
  }, [materiaId, lapsoId]);

  const lapsoSeleccionado = lapsos.find(l => String(l.id) === String(lapsoId));
  const { comparacion } = useDocenteComparacionMateria(materiaId, lapsoId);

  const handleNotaChange = useCallback((alumnoId, campo, valor) => {
    const num = parseFloat(valor);
    if (valor !== '' && (isNaN(num) || num < 0 || num > 20)) {
      toast.warning('La nota debe estar entre 0 y 20.');
      return;
    }
    setDirtyNotas(true);
    setNotas(prev => prev.map(n => {
      if (n.alumno_id !== alumnoId) return n;
      const updated = { ...n, [campo]: valor };
      updated.definitiva = calcDefinitiva(updated);
      updated.aprobado = updated.definitiva !== '' ? parseFloat(updated.definitiva) >= 10 : null;
      return updated;
    }));
  }, []);

  const handleGuardarNotas = async () => {
    setSavingNotas(true);
    try {
      await saveNotas(materiaId, lapsoId, notas);
      toast.success('Notas guardadas correctamente.');
      setDirtyNotas(false);
    } catch (err) {
      const msg = err.response?.data?.error || err.response?.data?.detail || 'Error al guardar notas.';
      toast.error(msg);
    } finally {
      setSavingNotas(false);
    }
  };

  // ── Tab Asistencia ────────────────────────────────────────────────────
  const [fechaAsistencia, setFechaAsistencia] = useState(new Date());
  const {
    registros,
    loadingAsistencia,
    savingAsistencia,
    dirtyAsistencia,
    marcar,
    actualizarObservacion,
    restaurarRegistro,
    guardarAsistencia,
    conteos,
  } = useAsistenciaClase(materia?.grado_seccion, fechaAsistencia, tab === 'asistencia');

  const [vistaAsistencia, setVistaAsistencia] = useState(leerVistaAsistencia);
  const cambiarVistaAsistencia = (vista) => {
    setVistaAsistencia(vista);
    try { localStorage.setItem(VISTA_ASISTENCIA_KEY, vista); } catch { /* storage bloqueado: solo no se recuerda */ }
  };

  // Protección de cambios sin guardar: salir, cambiar de pestaña o de fecha
  // queda en espera hasta que el docente decide en el modal. Los links del
  // layout (rail/bottom nav) no se pueden interceptar con BrowserRouter
  // (ver NOTAS_TECNICAS.md); recargar o cerrar lo cubre `beforeunload`.
  const [accionPendiente, setAccionPendiente] = useState(null);
  const hayCambiosAsistencia = tab === 'asistencia' && dirtyAsistencia;
  const confirmarSiHayCambios = (accion) => {
    if (hayCambiosAsistencia) setAccionPendiente(() => accion);
    else accion();
  };
  const cerrarConfirmacion = useCallback(() => setAccionPendiente(null), []);
  const descartarYContinuar = () => {
    const accion = accionPendiente;
    setAccionPendiente(null);
    accion?.();
  };
  const guardarYContinuar = async () => {
    const accion = accionPendiente;
    if (await guardarAsistencia()) {
      setAccionPendiente(null);
      accion?.();
    }
  };

  useEffect(() => {
    if (!hayCambiosAsistencia) return undefined;
    const handleBeforeUnload = (e) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hayCambiosAsistencia]);

  // ── Tab Material ──────────────────────────────────────────────────────
  const { materiales, loading: loadingMateriales, publicarMaterial, eliminarMaterial } = useDocenteMateriales(materiaId);
  const [modalMaterial, setModalMaterial] = useState(false);

  return (
    <div className="space-y-4 pb-20">
      <button
        onClick={() => confirmarSiHayCambios(() => navigate('/portal-docente/materias'))}
        className="flex items-center gap-1.5 text-sm text-gray-500 min-h-[44px]"
      >
        <ArrowLeft size={16} /> Mis Materias
      </button>

      <div>
        {loadingMateria ? (
          <SkeletonCard lines={1} />
        ) : (
          <>
            <h1 className="text-lg font-bold text-gray-800">{materia?.nombre}</h1>
            <p className="text-xs text-gray-400 mt-0.5">{materia?.grado_seccion}</p>
          </>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-100 overflow-x-auto">
        {TABS.map(t => {
          const Icon = t.icon;
          const activo = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => { if (!activo) confirmarSiHayCambios(() => setTab(t.id)); }}
              className={`flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium min-h-[44px] whitespace-nowrap border-b-2 -mb-px transition-colors ${
                activo ? 'text-[var(--docente-primary)] border-[var(--docente-primary)]' : 'text-gray-400 border-transparent'
              }`}
            >
              <Icon size={15} /> {t.label}
            </button>
          );
        })}
      </div>

      {tab === 'notas' && (
        <div className="space-y-4">
          <div>
            <label htmlFor="docente-lapso" className="block text-xs font-medium text-gray-500 mb-1.5">Lapso</label>
            <select
              id="docente-lapso"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--docente-primary)]/30"
              value={lapsoId}
              onChange={e => setLapsoId(e.target.value)}
            >
              <option value="">Seleccionar lapso...</option>
              {lapsos.map(l => (
                <option key={l.id} value={l.id}>
                  {l.nombre} — {l.periodo_escolar}{!l.activo ? ' (cerrado)' : ''}
                </option>
              ))}
            </select>
            {lapsoSeleccionado && !lapsoSeleccionado.activo && (
              <p className="text-[11px] mt-1.5 flex items-center gap-1 text-red-600">
                <AlertTriangle size={11} /> Este lapso está cerrado — las notas son de solo lectura
              </p>
            )}
          </div>

          {lapsoId && comparacion && comparacion.otras_secciones_count > 0 && (
            <p className="text-xs text-gray-500 flex items-center gap-1.5">
              {comparacion.porcentaje_propio >= comparacion.porcentaje_otras_secciones
                ? <TrendingUp size={13} className="text-emerald-600 flex-shrink-0" />
                : <TrendingDown size={13} className="text-amber-600 flex-shrink-0" />}
              Tu sección aprueba {comparacion.porcentaje_propio}%, el promedio de otras secciones de {comparacion.materia_nombre} es {comparacion.porcentaje_otras_secciones}%
            </p>
          )}

          {!lapsoId ? (
            <div className="bg-white rounded-2xl border border-gray-100 p-10 text-center text-gray-400">
              <BookOpen size={32} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">Selecciona un lapso para ver las notas.</p>
            </div>
          ) : (
            <>
              <TablaNotas
                notas={notas}
                loading={loadingNotas}
                lapsoActivo={!lapsoSeleccionado || lapsoSeleccionado.activo}
                onNotaChange={handleNotaChange}
              />
              <button
                onClick={handleGuardarNotas}
                disabled={savingNotas || !dirtyNotas || !notas.length}
                className="w-full flex items-center justify-center gap-2 bg-[var(--docente-primary)] text-white font-medium py-3 rounded-xl text-sm hover:bg-[var(--docente-primary-dark)] transition-colors disabled:opacity-50 min-h-[44px]"
              >
                {savingNotas ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                {savingNotas ? 'Guardando...' : 'Guardar notas'}
              </button>
            </>
          )}
        </div>
      )}

      {tab === 'asistencia' && (
        <div className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:gap-3">
            <div className="sm:w-56">
              <label htmlFor="docente-fecha-asistencia" className="block text-xs font-medium text-gray-500 mb-1.5">Fecha</label>
              <DatePicker
                selected={fechaAsistencia}
                onChange={(fecha) => { if (fecha) confirmarSiHayCambios(() => setFechaAsistencia(fecha)); }}
                locale={es}
                dateFormat="dd/MM/yyyy"
                maxDate={new Date()}
                wrapperClassName="w-full"
                popperContainer={datepickerPopperContainer}
                customInput={
                  <input
                    id="docente-fecha-asistencia"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm cursor-pointer focus:outline-none focus:ring-2 focus:ring-[var(--docente-primary)]/30"
                  />
                }
              />
            </div>

            {/* Excepción declarada del estándar: 2 botones cortos, caben en 360px */}
            <div role="group" aria-label="Vista de asistencia" className="grid grid-cols-2 gap-1 rounded-xl p-1 sm:ml-auto sm:inline-grid" style={{ background: 'var(--ash-light)' }}>
              {VISTAS_ASISTENCIA.map(({ id, label, icon: Icon }) => {
                const activa = vistaAsistencia === id;
                return (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={activa}
                    onClick={() => cambiarVistaAsistencia(id)}
                    className={`flex min-h-[40px] items-center justify-center gap-1.5 rounded-lg px-4 text-sm font-medium transition-[background-color,color,box-shadow] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--docente-primary)]/40 ${
                      activa ? 'bg-white shadow-sm text-gray-800' : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    <Icon size={15} aria-hidden="true" /> {label}
                  </button>
                );
              })}
            </div>
          </div>

          {vistaAsistencia === 'tarjetas' ? (
            <PaseListaTarjetas
              key={`${materia?.grado_seccion}-${format(fechaAsistencia, 'yyyy-MM-dd')}`}
              registros={registros}
              loading={loadingAsistencia || loadingMateria}
              materia={materia}
              fecha={fechaAsistencia}
              dirty={dirtyAsistencia}
              saving={savingAsistencia}
              onMarcar={marcar}
              onObservacion={actualizarObservacion}
              onRestaurar={restaurarRegistro}
              onGuardar={guardarAsistencia}
            />
          ) : (
            <>
            {!loadingAsistencia && registros.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {[
                  { key: 'presentes', label: 'Presentes', color: 'text-green-600', bg: 'bg-green-50' },
                  { key: 'ausentes', label: 'Ausentes', color: 'text-red-600', bg: 'bg-red-50' },
                  { key: 'justificados', label: 'Justif.', color: 'text-yellow-700', bg: 'bg-yellow-50' },
                ].map(({ key, label, color, bg }) => (
                  <div key={key} className={`flex items-center gap-2 p-2.5 rounded-xl ${bg}`}>
                    <Users size={15} className={color} />
                    <div>
                      <p className={`text-sm font-bold leading-none ${color}`}>{conteos[key]}</p>
                      <p className={`text-[10px] ${color}`}>{label}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="space-y-2">
              {loadingAsistencia ? (
                [...Array(5)].map((_, i) => <SkeletonFila key={i} />)
              ) : registros.length === 0 ? (
                <div className="bg-white rounded-2xl border border-gray-100 p-10 text-center text-gray-400">
                  <p className="text-sm">No hay alumnos registrados en esta sección.</p>
                </div>
              ) : (
                registros.map((r, i) => (
                  <FilaAlumno
                    key={`${r.alumno_id}-${i}`}
                    registro={r}
                    onMarcar={marcar}
                    onObservacion={actualizarObservacion}
                  />
                ))
              )}
            </div>

            {dirtyAsistencia && registros.length > 0 && (
              <button
                onClick={guardarAsistencia}
                disabled={savingAsistencia}
                className="w-full flex items-center justify-center gap-2 bg-[var(--docente-primary)] text-white font-medium py-3 rounded-xl text-sm hover:bg-[var(--docente-primary-dark)] transition-colors disabled:opacity-50 min-h-[44px]"
              >
                {savingAsistencia ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                {savingAsistencia ? 'Guardando...' : 'Guardar asistencia'}
              </button>
            )}
            </>
          )}
        </div>
      )}

      {tab === 'plan-evaluacion' && (
        <div className="space-y-4">
          <div>
            <label htmlFor="docente-lapso-plan" className="block text-xs font-medium text-gray-500 mb-1.5">Lapso</label>
            <select
              id="docente-lapso-plan"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--docente-primary)]/30"
              value={lapsoId}
              onChange={e => setLapsoId(e.target.value)}
            >
              <option value="">Seleccionar lapso...</option>
              {lapsos.map(l => (
                <option key={l.id} value={l.id}>
                  {l.nombre} — {l.periodo_escolar}{!l.activo ? ' (cerrado)' : ''}
                </option>
              ))}
            </select>
            {lapsoSeleccionado && !lapsoSeleccionado.activo && (
              <p className="text-[11px] mt-1.5 flex items-center gap-1 text-red-600">
                <AlertTriangle size={11} /> Este lapso está cerrado — el plan y las notas son de solo lectura
              </p>
            )}
          </div>

          {!lapsoId ? (
            <div className="bg-white rounded-2xl border border-gray-100 p-10 text-center text-gray-400">
              <ClipboardList size={32} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">Selecciona un lapso para ver el plan de evaluación.</p>
            </div>
          ) : (
            <PlanEvaluacionPanel
              materiaId={materiaId}
              lapsoId={lapsoId}
              tipoEvaluacion={materia?.tipo_evaluacion || 'numerica'}
              lapsoActivo={!lapsoSeleccionado || lapsoSeleccionado.activo}
            />
          )}
        </div>
      )}

      {tab === 'material' && (
        <div className="space-y-3">
          <button
            onClick={() => setModalMaterial(true)}
            className="w-full flex items-center justify-center gap-2 bg-[var(--docente-primary)] text-white font-medium py-2.5 rounded-xl text-sm min-h-[44px]"
          >
            <Plus size={16} /> Agregar Material
          </button>

          {loadingMateriales ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => <SkeletonCard key={i} lines={1} />)}
            </div>
          ) : materiales.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 p-10 text-center text-gray-400">
              <FileText size={32} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">Todavía no hay material publicado.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {materiales.map(m => (
                <TarjetaMaterial key={m.id} material={m} onEliminar={eliminarMaterial} puedeEliminar />
              ))}
            </div>
          )}
        </div>
      )}

      <Modal
        open={accionPendiente !== null}
        onClose={cerrarConfirmacion}
        size="sm"
        titulo={<><AlertTriangle size={18} aria-hidden="true" /> Cambios sin guardar</>}
        footer={
          <>
            <button
              type="button"
              onClick={cerrarConfirmacion}
              className="w-full sm:w-auto min-h-[44px] px-4 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-100 transition-colors"
            >
              Seguir editando
            </button>
            <button
              type="button"
              onClick={descartarYContinuar}
              className="w-full sm:w-auto min-h-[44px] px-4 rounded-xl text-sm font-medium transition-colors hover:bg-[var(--red-light)]"
              style={{ color: 'var(--red)', boxShadow: 'inset 0 0 0 1px var(--red-light)' }}
            >
              Descartar cambios
            </button>
            <button
              type="button"
              onClick={guardarYContinuar}
              disabled={savingAsistencia}
              className="w-full sm:w-auto min-h-[44px] px-4 rounded-xl text-sm font-semibold text-white flex items-center justify-center gap-2 bg-[var(--docente-primary)] hover:bg-[var(--docente-primary-dark)] transition-colors disabled:opacity-50"
            >
              {savingAsistencia ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              {savingAsistencia ? 'Guardando...' : 'Guardar y continuar'}
            </button>
          </>
        }
      >
        <p className="text-sm" style={{ color: 'var(--jet)' }}>
          Hay asistencia marcada que todavía no se guardó. Si continúas sin guardar, esos cambios se pierden.
        </p>
      </Modal>

      {modalMaterial && (
        <ModalNuevoMaterial onClose={() => setModalMaterial(false)} onSubmit={publicarMaterial} />
      )}
    </div>
  );
};

export default DocenteMateriaDetalle;
