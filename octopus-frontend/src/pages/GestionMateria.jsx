import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { ArrowLeft, Save, Loader2, BookOpen, FileText, Plus, AlertTriangle } from 'lucide-react';
import { getMateria, getNotasGrado, saveNotas } from '../api/academico.service';
import { useLapsos } from '../hooks/useLapsos';
import { useMateriales } from '../hooks/useMateriales';
import { calcDefinitiva } from '../utils/notas.utils';
import { TablaNotas } from '../components/notas/TablaNotas';
import TarjetaMaterial from '../components/materiales/TarjetaMaterial';
import ModalNuevoMaterial from '../components/materiales/ModalNuevoMaterial';

const INPUT_STYLE = { border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)', fontSize: '16px' };

const TABS = [
  { id: 'notas', label: 'Notas', icon: BookOpen },
  { id: 'material', label: 'Material de Estudio', icon: FileText },
];

const GestionMateria = () => {
  const { materiaId } = useParams();
  const navigate = useNavigate();
  const [tab, setTab] = useState('notas');
  const [materia, setMateria] = useState(null);

  useEffect(() => {
    getMateria(materiaId)
      .then(res => setMateria(res.data))
      .catch(() => toast.error('No se pudo cargar la materia.'));
  }, [materiaId]);

  // ── Tab Notas ──────────────────────────────────────────────────────────
  const { lapsos } = useLapsos();
  const [lapsoId, setLapsoId] = useState('');
  const [notas, setNotas] = useState([]);
  const [loadingNotas, setLoadingNotas] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!lapsoId) { setNotas([]); return; }
    setLoadingNotas(true);
    setDirty(false);
    getNotasGrado(materiaId, lapsoId)
      .then(res => setNotas(res.data || []))
      .catch(() => toast.error('No se pudieron cargar las notas.'))
      .finally(() => setLoadingNotas(false));
  }, [materiaId, lapsoId]);

  const lapsoSeleccionado = lapsos.find(l => String(l.id) === String(lapsoId));

  const handleNotaChange = useCallback((alumnoId, campo, valor) => {
    const num = parseFloat(valor);
    if (valor !== '' && (isNaN(num) || num < 0 || num > 20)) {
      toast.warning('La nota debe estar entre 0 y 20.');
      return;
    }
    setDirty(true);
    setNotas(prev => prev.map(n => {
      if (n.alumno_id !== alumnoId) return n;
      const updated = { ...n, [campo]: valor };
      updated.definitiva = calcDefinitiva(updated);
      updated.aprobado = updated.definitiva !== '' ? parseFloat(updated.definitiva) >= 10 : null;
      return updated;
    }));
  }, []);

  const handleGuardarNotas = async () => {
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

  // ── Tab Material ───────────────────────────────────────────────────────
  const { materiales, loading: loadingMateriales, publicarMaterial, eliminarMaterial } = useMateriales(materiaId);
  const [modalMaterial, setModalMaterial] = useState(false);

  return (
    <div className="animate-fadeIn">
      <button
        onClick={() => navigate('/mis-materias')}
        className="flex items-center gap-1.5 text-sm mb-4 min-h-[44px]"
        style={{ color: 'var(--ash)' }}
      >
        <ArrowLeft size={16} /> Mis Materias
      </button>

      <div className="mb-6">
        <h2 className="text-lg font-medium" style={{ color: 'var(--jet)' }}>
          {materia?.nombre || 'Cargando...'}
        </h2>
        {materia && (
          <p className="text-sm mt-1" style={{ color: 'var(--ash)' }}>{materia.grado_seccion}</p>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6" style={{ borderBottom: '0.5px solid var(--border-md)' }}>
        {TABS.map(t => {
          const Icon = t.icon;
          const activo = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium min-h-[44px]"
              style={{
                color: activo ? 'var(--pb)' : 'var(--ash)',
                borderBottom: activo ? '2px solid var(--pb)' : '2px solid transparent',
                marginBottom: '-1px',
              }}
            >
              <Icon size={15} /> {t.label}
            </button>
          );
        })}
      </div>

      {tab === 'notas' && (
        <div>
          <div className="mb-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div className="max-w-xs w-full">
              <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>
                Lapso
              </label>
              <select
                className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                style={INPUT_STYLE}
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
                <p className="text-[11px] mt-1 flex items-center gap-1" style={{ color: 'var(--red)' }}>
                  <AlertTriangle size={11} /> Este lapso está cerrado — las notas son de solo lectura
                </p>
              )}
            </div>
            <button
              onClick={handleGuardarNotas}
              disabled={saving || !dirty || !notas.length}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-all disabled:opacity-50 min-h-[44px]"
              style={{ background: 'var(--pb)' }}
            >
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              {saving ? 'Guardando...' : 'Guardar notas'}
            </button>
          </div>

          {!lapsoId ? (
            <div
              className="rounded-xl p-16 text-center"
              style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)', color: 'var(--ash)' }}
            >
              <BookOpen size={40} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">Selecciona un lapso para ver las notas.</p>
            </div>
          ) : (
            <TablaNotas
              notas={notas}
              loading={loadingNotas}
              lapsoActivo={!lapsoSeleccionado || lapsoSeleccionado.activo}
              onNotaChange={handleNotaChange}
            />
          )}
        </div>
      )}

      {tab === 'material' && (
        <div>
          <div className="mb-4 flex justify-end">
            <button
              onClick={() => setModalMaterial(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white min-h-[44px]"
              style={{ background: 'var(--pb)' }}
            >
              <Plus size={16} /> Agregar Material
            </button>
          </div>

          {loadingMateriales ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-16 rounded-xl animate-pulse" style={{ background: 'var(--border-md)' }} />
              ))}
            </div>
          ) : materiales.length === 0 ? (
            <div
              className="rounded-xl p-16 text-center"
              style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)', color: 'var(--ash)' }}
            >
              <FileText size={40} className="mx-auto mb-3 opacity-30" />
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
        <ModalNuevoMaterial
          onClose={() => setModalMaterial(false)}
          onSubmit={publicarMaterial}
        />
      )}
    </div>
  );
};

export default GestionMateria;
