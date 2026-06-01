import { useState, useEffect, useCallback } from 'react';
import {
  BookOpen, Save, CheckCircle, XCircle, GraduationCap,
  Loader2, Plus, Pencil, X, AlertTriangle,
} from 'lucide-react';
import { toast } from 'react-toastify';
import {
  getMaterias, getLapsos, getNotasGrado, saveNotas,
  createLapso, updateLapso, deleteLapso,
} from '../api/academico.service';
import { jwtDecode } from 'jwt-decode';

const GRADOS = [
  '1er Grado', '2do Grado', '3er Grado', '4to Grado', '5to Grado', '6to Grado',
  '1er Año', '2do Año', '3er Año', '4to Año', '5to Año',
];

const NOMBRES_LAPSO = ['1er Lapso', '2do Lapso', '3er Lapso'];

// Determina si el usuario actual puede gestionar lapsos (director o sistemas)
const puedeGestionarLapsos = () => {
  try {
    const token = localStorage.getItem('access_token') || localStorage.getItem('token');
    if (!token) return false;
    const decoded = jwtDecode(token);
    const rol = decoded.rol || decoded.perfil?.rol || '';
    return ['director', 'sistemas'].includes(rol);
  } catch {
    return false;
  }
};

const LAPSO_VACIO = {
  nombre: '1er Lapso',
  periodo_escolar: '',
  fecha_inicio: '',
  fecha_fin: '',
  activo: true,
};

const calcDefinitiva = (nota) => {
  const vals = [nota.evaluacion_1, nota.evaluacion_2, nota.evaluacion_3, nota.evaluacion_4]
    .map(v => parseFloat(v))
    .filter(v => !isNaN(v) && v !== null && v !== '');
  if (!vals.length) return '';
  return (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2);
};

const SkeletonRow = () => (
  <tr>
    {[...Array(7)].map((_, i) => (
      <td key={i} className="px-4 py-3">
        <div className="h-4 rounded animate-pulse" style={{ background: 'var(--border-md)' }} />
      </td>
    ))}
  </tr>
);

const Notas = () => {
  const [grado, setGrado] = useState('');
  const [materias, setMaterias] = useState([]);
  const [lapsos, setLapsos] = useState([]);
  const [materiaId, setMateriaId] = useState('');
  const [lapsoId, setLapsoId] = useState('');
  const [notas, setNotas] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingCombos, setLoadingCombos] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  // Lapso modal state
  const [modalLapso, setModalLapso] = useState(false);
  const [lapsoEditando, setLapsoEditando] = useState(null); // null = crear, obj = editar
  const [formLapso, setFormLapso] = useState(LAPSO_VACIO);
  const [guardandoLapso, setGuardandoLapso] = useState(false);
  const [confirmCerrar, setConfirmCerrar] = useState(false); // confirmación inline

  const esAdmin = puedeGestionarLapsos();

  const recargarLapsos = useCallback(() => {
    return getLapsos()
      .then(res => setLapsos(res.data || []))
      .catch(() => toast.error('No se pudieron cargar los lapsos.'));
  }, []);

  // Cargar lapsos al montar
  useEffect(() => { recargarLapsos(); }, [recargarLapsos]);

  // Cargar materias cuando cambia el grado
  useEffect(() => {
    if (!grado) { setMaterias([]); setMateriaId(''); return; }
    setLoadingCombos(true);
    getMaterias(grado)
      .then(res => { setMaterias(res.data || []); setMateriaId(''); })
      .catch(() => toast.error('No se pudieron cargar las materias.'))
      .finally(() => setLoadingCombos(false));
  }, [grado]);

  // Cargar notas cuando cambia materia o lapso
  const fetchNotas = useCallback(async () => {
    if (!materiaId || !lapsoId) { setNotas([]); return; }
    setLoading(true);
    setDirty(false);
    try {
      const res = await getNotasGrado(materiaId, lapsoId);
      setNotas(res.data || []);
    } catch {
      toast.error('No se pudieron cargar las notas.');
    } finally {
      setLoading(false);
    }
  }, [materiaId, lapsoId]);

  useEffect(() => { fetchNotas(); }, [fetchNotas]);

  const handleNotaChange = (alumnoId, campo, valor) => {
    setDirty(true);
    setNotas(prev => prev.map(n => {
      if (n.alumno_id !== alumnoId) return n;
      const updated = { ...n, [campo]: valor };
      updated.definitiva = calcDefinitiva(updated);
      updated.aprobado = updated.definitiva !== '' ? parseFloat(updated.definitiva) >= 10 : null;
      return updated;
    }));
  };

  const handleSave = async () => {
    if (!materiaId || !lapsoId) { toast.warning('Selecciona materia y lapso.'); return; }
    setSaving(true);
    try {
      await saveNotas(materiaId, lapsoId, notas);
      toast.success('Notas guardadas correctamente.');
      setDirty(false);
    } catch (err) {
      const msg = err.response?.data?.error || err.response?.data?.detail || 'Error al guardar notas.';
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  // ─── Handlers de lapso ───────────────────────────────────────────────────
  const abrirModalCrear = () => {
    setLapsoEditando(null);
    setFormLapso(LAPSO_VACIO);
    setConfirmCerrar(false);
    setModalLapso(true);
  };

  const abrirModalEditar = () => {
    const lapso = lapsos.find(l => String(l.id) === String(lapsoId));
    if (!lapso) { toast.warning('Selecciona un lapso para editar.'); return; }
    setLapsoEditando(lapso);
    setFormLapso({
      nombre: lapso.nombre,
      periodo_escolar: lapso.periodo_escolar,
      fecha_inicio: lapso.fecha_inicio || '',
      fecha_fin: lapso.fecha_fin || '',
      activo: lapso.activo ?? true,
    });
    setConfirmCerrar(false);
    setModalLapso(true);
  };

  const guardarLapso = async () => {
    if (!formLapso.nombre || !formLapso.periodo_escolar) {
      toast.warning('Completa nombre y período escolar.');
      return;
    }
    setGuardandoLapso(true);
    try {
      if (lapsoEditando) {
        await updateLapso(lapsoEditando.id, formLapso);
        toast.success('Lapso actualizado correctamente.');
      } else {
        await createLapso(formLapso);
        toast.success('Lapso creado correctamente.');
      }
      setModalLapso(false);
      await recargarLapsos();
    } catch (err) {
      const msg = err.response?.data?.error || err.response?.data?.detail || 'Error al guardar lapso.';
      toast.error(msg);
    } finally {
      setGuardandoLapso(false);
    }
  };

  const cerrarLapso = async () => {
    if (!lapsoId) return;
    const lapso = lapsos.find(l => String(l.id) === String(lapsoId));
    if (!lapso) return;
    setGuardandoLapso(true);
    try {
      const res = await deleteLapso(lapso.id);
      toast.success(res.data?.mensaje || `Lapso "${lapso.nombre}" cerrado.`);
      setConfirmCerrar(false);
      setModalLapso(false);
      setLapsoId('');
      await recargarLapsos();
    } catch (err) {
      const msg = err.response?.data?.error || 'Error al cerrar el lapso.';
      toast.error(msg);
    } finally {
      setGuardandoLapso(false);
    }
  };

  const inputStyle = {
    border: '0.5px solid var(--border-md)',
    background: '#fff',
    color: 'var(--jet)',
  };

  const lapsoSeleccionado = lapsos.find(l => String(l.id) === String(lapsoId));

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
          onClick={handleSave}
          disabled={saving || !dirty || !notas.length}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-all disabled:opacity-50"
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
          <select
            className="w-full px-3 py-2 rounded-lg text-sm outline-none"
            style={inputStyle}
            value={grado}
            onChange={e => setGrado(e.target.value)}
          >
            <option value="">Seleccionar grado...</option>
            <optgroup label="Primaria">
              {GRADOS.slice(0, 6).map(g => <option key={g} value={g}>{g}</option>)}
            </optgroup>
            <optgroup label="Media General">
              {GRADOS.slice(6).map(g => <option key={g} value={g}>{g}</option>)}
            </optgroup>
          </select>
        </div>

        {/* Materia */}
        <div>
          <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>
            Materia
          </label>
          <select
            className="w-full px-3 py-2 rounded-lg text-sm outline-none"
            style={inputStyle}
            value={materiaId}
            onChange={e => setMateriaId(e.target.value)}
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
              style={inputStyle}
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

            {/* Botón crear lapso — solo admins */}
            {esAdmin && (
              <button
                onClick={abrirModalCrear}
                title="Crear nuevo lapso"
                className="flex-shrink-0 p-2 rounded-lg text-white transition-all"
                style={{ background: 'var(--pb)' }}
              >
                <Plus size={16} />
              </button>
            )}

            {/* Botón editar lapso — solo admins y cuando hay uno seleccionado */}
            {esAdmin && lapsoId && (
              <button
                onClick={abrirModalEditar}
                title="Editar lapso seleccionado"
                className="flex-shrink-0 p-2 rounded-lg transition-all"
                style={{ border: '0.5px solid var(--border-md)', color: 'var(--ash)', background: '#fff' }}
              >
                <Pencil size={15} />
              </button>
            )}
          </div>

          {/* Etiqueta de estado del lapso seleccionado */}
          {lapsoSeleccionado && !lapsoSeleccionado.activo && (
            <p className="text-[11px] mt-1 flex items-center gap-1" style={{ color: 'var(--red)' }}>
              <AlertTriangle size={11} /> Este lapso está cerrado — las notas son de solo lectura
            </p>
          )}
        </div>
      </div>

      {/* Tabla */}
      {(!materiaId || !lapsoId) ? (
        <div className="rounded-xl p-16 text-center" style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)', color: 'var(--ash)' }}>
          <GraduationCap size={40} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">Selecciona grado, materia y lapso para ver las notas.</p>
        </div>
      ) : (
        <div className="rounded-xl overflow-hidden" style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)' }}>
          {!loading && notas.length > 0 && (
            <div className="px-4 py-2 flex items-center gap-4 text-xs" style={{ borderBottom: '0.5px solid var(--border)', color: 'var(--ash)' }}>
              <span>{notas.length} alumnos</span>
              <span className="text-green-600 font-medium">
                {notas.filter(n => n.aprobado === true).length} aprobados
              </span>
              <span className="text-red-500 font-medium">
                {notas.filter(n => n.aprobado === false).length} reprobados
              </span>
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr>
                  {['Alumno', 'Eval 1', 'Eval 2', 'Eval 3', 'Eval 4', 'Definitiva', 'Aprobado'].map(h => (
                    <th
                      key={h}
                      className="px-4 py-3 text-[11px] uppercase tracking-widest"
                      style={{ color: 'var(--ash)', background: 'var(--porcelain)', borderBottom: '0.5px solid var(--border-md)' }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading
                  ? [...Array(6)].map((_, i) => <SkeletonRow key={i} />)
                  : notas.length === 0
                    ? (
                      <tr>
                        <td colSpan={7} className="px-4 py-16 text-center text-sm" style={{ color: 'var(--ash)' }}>
                          No hay alumnos en este grado para el lapso seleccionado.
                        </td>
                      </tr>
                    )
                    : notas.map(nota => (
                      <tr key={nota.alumno_id} style={{ borderBottom: '0.5px solid var(--border)', background: 'var(--porcelain)' }}>
                        <td className="px-4 py-3">
                          <p className="text-sm font-medium" style={{ color: 'var(--jet)' }}>{nota.alumno_nombre}</p>
                        </td>
                        {['evaluacion_1', 'evaluacion_2', 'evaluacion_3', 'evaluacion_4'].map(campo => (
                          <td key={campo} className="px-4 py-2">
                            <input
                              type="number"
                              min="0"
                              max="20"
                              step="0.01"
                              placeholder="—"
                              className="w-16 px-2 py-1 rounded-lg text-sm outline-none text-center"
                              style={inputStyle}
                              value={nota[campo] ?? ''}
                              onChange={e => handleNotaChange(nota.alumno_id, campo, e.target.value)}
                              disabled={lapsoSeleccionado && !lapsoSeleccionado.activo}
                            />
                          </td>
                        ))}
                        <td className="px-4 py-3">
                          <span className="text-sm font-bold" style={{ color: nota.definitiva !== '' && nota.definitiva !== undefined ? (parseFloat(nota.definitiva) >= 10 ? '#16a34a' : 'var(--red)') : 'var(--ash)' }}>
                            {nota.definitiva !== '' && nota.definitiva !== undefined ? nota.definitiva : '—'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {nota.aprobado === true && (
                            <span className="flex items-center gap-1 text-xs font-bold text-green-600">
                              <CheckCircle size={15} /> Aprobado
                            </span>
                          )}
                          {nota.aprobado === false && (
                            <span className="flex items-center gap-1 text-xs font-bold" style={{ color: 'var(--red)' }}>
                              <XCircle size={15} /> Reprobado
                            </span>
                          )}
                          {(nota.aprobado === null || nota.aprobado === undefined) && (
                            <span className="text-xs" style={{ color: 'var(--ash)' }}>—</span>
                          )}
                        </td>
                      </tr>
                    ))
                }
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Modal crear / editar lapso ─────────────────────────────────────── */}
      {modalLapso && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl">
            {/* Header modal */}
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-gray-800">
                {lapsoEditando ? 'Editar lapso' : 'Nuevo lapso'}
              </h3>
              <button
                onClick={() => { setModalLapso(false); setConfirmCerrar(false); }}
                className="p-1 rounded-lg text-gray-400 hover:text-gray-600"
              >
                <X size={18} />
              </button>
            </div>

            {/* Campos */}
            <div className="space-y-4">
              {/* Nombre */}
              <div>
                <label className="block text-[11px] uppercase tracking-widest mb-1" style={{ color: 'var(--ash)' }}>
                  Nombre del lapso
                </label>
                <select
                  className="w-full px-3 py-2 rounded-xl text-sm outline-none border"
                  style={{ borderColor: 'var(--border-md)', color: 'var(--jet)' }}
                  value={formLapso.nombre}
                  onChange={e => setFormLapso(p => ({ ...p, nombre: e.target.value }))}
                >
                  {NOMBRES_LAPSO.map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>

              {/* Período escolar */}
              <div>
                <label className="block text-[11px] uppercase tracking-widest mb-1" style={{ color: 'var(--ash)' }}>
                  Período escolar
                </label>
                <input
                  type="text"
                  placeholder="ej. 2024-2025"
                  className="w-full px-3 py-2 rounded-xl text-sm outline-none border"
                  style={{ borderColor: 'var(--border-md)', color: 'var(--jet)' }}
                  value={formLapso.periodo_escolar}
                  onChange={e => setFormLapso(p => ({ ...p, periodo_escolar: e.target.value }))}
                />
              </div>

              {/* Fechas */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] uppercase tracking-widest mb-1" style={{ color: 'var(--ash)' }}>
                    Fecha inicio
                  </label>
                  <input
                    type="date"
                    className="w-full px-3 py-2 rounded-xl text-sm outline-none border"
                    style={{ borderColor: 'var(--border-md)', color: 'var(--jet)' }}
                    value={formLapso.fecha_inicio}
                    onChange={e => setFormLapso(p => ({ ...p, fecha_inicio: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-[11px] uppercase tracking-widest mb-1" style={{ color: 'var(--ash)' }}>
                    Fecha fin
                  </label>
                  <input
                    type="date"
                    className="w-full px-3 py-2 rounded-xl text-sm outline-none border"
                    style={{ borderColor: 'var(--border-md)', color: 'var(--jet)' }}
                    value={formLapso.fecha_fin}
                    onChange={e => setFormLapso(p => ({ ...p, fecha_fin: e.target.value }))}
                  />
                </div>
              </div>

              {/* Activo */}
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="lapso-activo"
                  checked={formLapso.activo}
                  onChange={e => setFormLapso(p => ({ ...p, activo: e.target.checked }))}
                  className="w-4 h-4 rounded"
                />
                <label htmlFor="lapso-activo" className="text-sm" style={{ color: 'var(--jet)' }}>
                  Lapso activo (permite registro de notas)
                </label>
              </div>
            </div>

            {/* Zona de cierre de lapso — solo al editar uno activo */}
            {lapsoEditando && lapsoEditando.activo && (
              <div className="mt-5 p-3 rounded-xl" style={{ background: '#fff7ed', border: '0.5px solid #fed7aa' }}>
                {!confirmCerrar ? (
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs text-orange-700 flex items-center gap-1">
                      <AlertTriangle size={13} />
                      Cerrar el lapso impedirá nuevas notas
                    </p>
                    <button
                      onClick={() => setConfirmCerrar(true)}
                      className="text-xs font-medium text-orange-700 underline underline-offset-2"
                    >
                      Cerrar lapso
                    </button>
                  </div>
                ) : (
                  <div>
                    <p className="text-xs font-medium text-orange-800 mb-2">
                      ¿Confirmas cerrar "{lapsoEditando.nombre}"? Las notas existentes se conservan.
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setConfirmCerrar(false)}
                        className="flex-1 text-xs py-1.5 rounded-lg border border-gray-200 text-gray-600"
                      >
                        Cancelar
                      </button>
                      <button
                        onClick={cerrarLapso}
                        disabled={guardandoLapso}
                        className="flex-1 text-xs py-1.5 rounded-lg font-medium text-white bg-orange-500 disabled:opacity-50"
                      >
                        {guardandoLapso ? 'Cerrando...' : 'Sí, cerrar'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Botones */}
            <div className="flex gap-2 mt-6">
              <button
                onClick={() => { setModalLapso(false); setConfirmCerrar(false); }}
                className="flex-1 border rounded-xl py-2 text-sm text-gray-600"
                style={{ borderColor: 'var(--border-md)' }}
              >
                Cancelar
              </button>
              <button
                onClick={guardarLapso}
                disabled={guardandoLapso}
                className="flex-1 text-white rounded-xl py-2 text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2"
                style={{ background: 'var(--pb)' }}
              >
                {guardandoLapso
                  ? <><Loader2 size={14} className="animate-spin" /> Guardando...</>
                  : 'Guardar'
                }
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Notas;
