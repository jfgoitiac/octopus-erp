import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { ArrowLeft, BookOpen, Calendar, FileText, Save, Loader2, Plus, AlertTriangle, Users, ClipboardList, TrendingUp, TrendingDown } from 'lucide-react';

import { getMateria, getLapsos, getNotasGrado, saveNotas, getAsistencia, saveAsistencia } from '../api/academico.service';
import { useDocenteMateriales } from '../hooks/useDocenteMateriales';
import { useDocenteComparacionMateria } from '../hooks/useDocenteComparacionMateria';
import { calcDefinitiva } from '../../utils/notas.utils';
import { ESTADO, ESTADO_A_BACKEND, BACKEND_A_ESTADO } from '../../constants/asistencia';
import { TablaNotas } from '../../components/notas/TablaNotas';
import FilaAlumno from '../../components/asistencia/FilaAlumno';
import SkeletonFila from '../../components/asistencia/SkeletonFila';
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

function normalizeRegistro(r) {
  if (r.estado && BACKEND_A_ESTADO[r.estado]) {
    return { ...r, estado: BACKEND_A_ESTADO[r.estado] };
  }
  return {
    ...r,
    estado: r.presente === true && !r.justificada ? ESTADO.PRESENTE
          : r.justificada                          ? ESTADO.JUSTIFICADO
          : r.presente === false                   ? ESTADO.AUSENTE
          : ESTADO.SIN_MARCAR,
  };
}

const TAB_IDS = TABS.map(t => t.id);

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
  const [registros, setRegistros] = useState([]);
  const [loadingAsistencia, setLoadingAsistencia] = useState(false);
  const [savingAsistencia, setSavingAsistencia] = useState(false);
  const [dirtyAsistencia, setDirtyAsistencia] = useState(false);
  const abortAsistenciaRef = useRef(null);

  const fetchAsistencia = useCallback(async () => {
    if (!materia?.grado_seccion || !fechaAsistencia) return;
    abortAsistenciaRef.current?.abort();
    const controller = new AbortController();
    abortAsistenciaRef.current = controller;

    setLoadingAsistencia(true);
    setDirtyAsistencia(false);
    try {
      const fechaStr = format(fechaAsistencia, 'yyyy-MM-dd');
      const res = await getAsistencia(materia.grado_seccion, fechaStr, controller.signal);
      if (controller.signal.aborted) return;
      setRegistros((res.data || []).map(normalizeRegistro));
    } catch (err) {
      if (err.code === 'ERR_CANCELED' || controller.signal.aborted) return;
      toast.error('No se pudo cargar la asistencia.');
    } finally {
      if (!controller.signal.aborted) setLoadingAsistencia(false);
    }
  }, [materia?.grado_seccion, fechaAsistencia]);

  useEffect(() => { if (tab === 'asistencia') fetchAsistencia(); }, [tab, fetchAsistencia]);

  const marcar = useCallback((alumnoId, estado) => {
    setDirtyAsistencia(true);
    setRegistros(prev => prev.map(r => {
      if (r.alumno_id !== alumnoId) return r;
      return {
        ...r,
        estado,
        presente: estado === ESTADO.PRESENTE || estado === ESTADO.RETARDADO,
        justificada: estado === ESTADO.JUSTIFICADO,
        observacion: estado === ESTADO.PRESENTE ? '' : r.observacion,
      };
    }));
  }, []);

  const actualizarObservacion = useCallback((alumnoId, valor) => {
    setDirtyAsistencia(true);
    setRegistros(prev => prev.map(r => (r.alumno_id !== alumnoId ? r : { ...r, observacion: valor })));
  }, []);

  const guardarAsistencia = async () => {
    setSavingAsistencia(true);
    try {
      const fechaStr = format(fechaAsistencia, 'yyyy-MM-dd');
      const payload = registros.map(r => ({
        alumno_id: r.alumno_id,
        estado: ESTADO_A_BACKEND[r.estado] || 'A',
        observacion: r.observacion || '',
      }));
      await saveAsistencia(materia.grado_seccion, fechaStr, payload);
      toast.success('Asistencia guardada correctamente.');
      setDirtyAsistencia(false);
    } catch (err) {
      const msg = err.response?.data?.error || err.response?.data?.detail || 'Error al guardar asistencia.';
      toast.error(msg);
    } finally {
      setSavingAsistencia(false);
    }
  };

  const conteos = useMemo(
    () => registros.reduce((acc, r) => {
      if (r.estado === ESTADO.PRESENTE) acc.presentes++;
      else if (r.estado === ESTADO.AUSENTE) acc.ausentes++;
      else if (r.estado === ESTADO.JUSTIFICADO) acc.justificados++;
      else if (r.estado === ESTADO.RETARDADO) acc.retardados++;
      return acc;
    }, { presentes: 0, ausentes: 0, justificados: 0, retardados: 0 }),
    [registros]
  );

  // ── Tab Material ──────────────────────────────────────────────────────
  const { materiales, loading: loadingMateriales, publicarMaterial, eliminarMaterial } = useDocenteMateriales(materiaId);
  const [modalMaterial, setModalMaterial] = useState(false);

  return (
    <div className="space-y-4 pb-20">
      <button
        onClick={() => navigate('/portal-docente/materias')}
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
              onClick={() => setTab(t.id)}
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
          <div>
            <label htmlFor="docente-fecha-asistencia" className="block text-xs font-medium text-gray-500 mb-1.5">Fecha</label>
            <DatePicker
              selected={fechaAsistencia}
              onChange={setFechaAsistencia}
              locale={es}
              dateFormat="dd/MM/yyyy"
              maxDate={new Date()}
              wrapperClassName="w-full"
              customInput={
                <input
                  id="docente-fecha-asistencia"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm cursor-pointer focus:outline-none focus:ring-2 focus:ring-[var(--docente-primary)]/30"
                />
              }
            />
          </div>

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

      {modalMaterial && (
        <ModalNuevoMaterial onClose={() => setModalMaterial(false)} onSubmit={publicarMaterial} />
      )}
    </div>
  );
};

export default DocenteMateriaDetalle;
