import { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { toast } from 'react-toastify';
import { AlertTriangle, Plus, X, Loader2, Paperclip, ImageIcon } from 'lucide-react';

import { useDocenteIncidentes } from '../hooks/useDocenteIncidentes';
import { useDocenteMisMaterias } from '../hooks/useDocenteMisMaterias';
import { useAlumnosSeccion } from '../hooks/useAlumnosSeccion';
import SkeletonCard from '../../portal/components/SkeletonCard';
import { useEscape } from '../../hooks/useEscape';
import { useFocusTrap } from '../../hooks/useFocusTrap';

const TAMANO_MAX_MB = 5;

const SEVERIDADES = [
  { value: 'L', label: 'Leve', className: 'text-yellow-700 bg-yellow-50 border-yellow-200' },
  { value: 'M', label: 'Moderado', className: 'text-orange-700 bg-orange-50 border-orange-200' },
  { value: 'G', label: 'Grave', className: 'text-red-700 bg-red-50 border-red-200' },
];

const severidadCfg = (val) => SEVERIDADES.find(s => s.value === val) || SEVERIDADES[0];

const formatFecha = (fechaStr) => {
  try {
    return format(new Date(fechaStr), "d 'de' MMM yyyy", { locale: es });
  } catch {
    return fechaStr;
  }
};

const ModalNuevoIncidente = ({ onClose, onSubmit, creando }) => {
  const { materias, loading: loadingMaterias } = useDocenteMisMaterias();
  const [materiaId, setMateriaId] = useState('');
  const materiaSeleccionada = materias.find(m => String(m.id) === String(materiaId));
  const { alumnos, loading: loadingAlumnos } = useAlumnosSeccion(materiaSeleccionada?.grado_seccion);

  const [alumnoId, setAlumnoId] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [severidad, setSeveridad] = useState('L');
  const [adjunto, setAdjunto] = useState(null);
  const containerRef = useRef(null);

  useEscape(true, onClose);
  useFocusTrap(containerRef);

  const handleArchivo = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > TAMANO_MAX_MB * 1024 * 1024) {
      toast.error(`La imagen no puede superar ${TAMANO_MAX_MB}MB.`);
      e.target.value = '';
      return;
    }
    setAdjunto(file);
  };

  const handleGuardar = async () => {
    if (!alumnoId) { toast.warning('Selecciona un alumno.'); return; }
    if (!descripcion.trim()) { toast.warning('Describe el incidente.'); return; }
    const ok = await onSubmit({ alumno_id: alumnoId, descripcion: descripcion.trim(), severidad, adjunto });
    if (ok) onClose();
  };

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="nuevo-incidente-titulo"
    >
      <div ref={containerRef} className="bg-white rounded-t-2xl sm:rounded-2xl p-5 w-full sm:max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 id="nuevo-incidente-titulo" className="font-bold text-gray-800 flex items-center gap-2">
            <AlertTriangle size={18} className="text-[var(--docente-primary)]" />
            Nuevo incidente
          </h3>
          <button onClick={onClose} aria-label="Cerrar" className="p-1 text-gray-400">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label htmlFor="nuevo-incidente-materia" className="block text-xs font-medium text-gray-500 mb-1.5">Materia</label>
            <select
              id="nuevo-incidente-materia"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--docente-primary)]/30"
              value={materiaId}
              onChange={e => { setMateriaId(e.target.value); setAlumnoId(''); }}
              disabled={loadingMaterias}
            >
              <option value="">Seleccionar materia...</option>
              {materias.map(m => (
                <option key={m.id} value={m.id}>{m.nombre} — {m.grado_seccion}</option>
              ))}
            </select>
          </div>

          {materiaId && (
            <div>
              <label htmlFor="nuevo-incidente-alumno" className="block text-xs font-medium text-gray-500 mb-1.5">Alumno</label>
              <select
                id="nuevo-incidente-alumno"
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--docente-primary)]/30"
                value={alumnoId}
                onChange={e => setAlumnoId(e.target.value)}
                disabled={loadingAlumnos}
              >
                <option value="">{loadingAlumnos ? 'Cargando...' : 'Seleccionar alumno...'}</option>
                {alumnos.map(a => (
                  <option key={a.id} value={a.id}>{a.nombre}</option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Severidad</label>
            <div className="flex gap-2">
              {SEVERIDADES.map(s => (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => setSeveridad(s.value)}
                  className={`flex-1 py-2 rounded-xl text-xs font-medium border min-h-[44px] ${
                    severidad === s.value ? s.className : 'text-gray-400 bg-white border-gray-200'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label htmlFor="nuevo-incidente-descripcion" className="block text-xs font-medium text-gray-500 mb-1.5">Descripción</label>
            <textarea
              id="nuevo-incidente-descripcion"
              rows={3}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[var(--docente-primary)]/30"
              value={descripcion}
              onChange={e => setDescripcion(e.target.value)}
              placeholder="Describe lo ocurrido..."
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Foto (opcional, máx. {TAMANO_MAX_MB}MB)</label>
            {adjunto ? (
              <div className="flex items-center gap-3">
                <span className="text-sm truncate text-gray-700">{adjunto.name}</span>
                <button type="button" onClick={() => setAdjunto(null)} className="text-xs font-medium text-red-600">
                  Quitar
                </button>
              </div>
            ) : (
              <label className="flex items-center justify-center gap-2 w-full py-3 rounded-xl text-sm cursor-pointer min-h-[44px] border border-dashed border-gray-300 text-gray-400">
                <ImageIcon size={15} />
                Adjuntar foto
                <input type="file" accept="image/*" className="hidden" onChange={handleArchivo} />
              </label>
            )}
          </div>
        </div>

        <div className="flex gap-2 mt-6">
          <button
            onClick={onClose}
            className="flex-1 rounded-xl py-2.5 text-sm border border-gray-200 text-gray-500 min-h-[44px]"
          >
            Cancelar
          </button>
          <button
            onClick={handleGuardar}
            disabled={creando}
            className="flex-1 text-white rounded-xl py-2.5 text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2 min-h-[44px] bg-[var(--docente-primary)] hover:bg-[var(--docente-primary-dark)]"
          >
            {creando ? <><Loader2 size={14} className="animate-spin" /> Guardando...</> : 'Registrar'}
          </button>
        </div>
      </div>
    </div>
  );
};

const DocenteIncidentes = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [filtroSeveridad, setFiltroSeveridad] = useState('');
  const { incidentes, loading, creando, registrarIncidente } = useDocenteIncidentes(filtroSeveridad || null);
  const [modalAbierto, setModalAbierto] = useState(Boolean(location.state?.nuevo));

  useEffect(() => {
    if (location.state?.nuevo) navigate(location.pathname, { replace: true, state: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-gray-800 flex items-center gap-2">
            <AlertTriangle size={20} className="text-[var(--docente-primary)]" />
            Incidentes
          </h1>
          <p className="text-xs text-gray-400 mt-0.5">Registro disciplinario de tus alumnos</p>
        </div>
        <button
          onClick={() => setModalAbierto(true)}
          aria-label="Nuevo incidente"
          className="w-10 h-10 rounded-full bg-[var(--docente-primary)] text-white flex items-center justify-center flex-shrink-0"
        >
          <Plus size={18} />
        </button>
      </div>

      <div className="flex gap-2 overflow-x-auto">
        <button
          type="button"
          onClick={() => setFiltroSeveridad('')}
          className={`px-3 py-2 rounded-xl text-xs font-medium border min-h-[44px] flex-shrink-0 ${
            filtroSeveridad === '' ? 'text-gray-700 bg-gray-100 border-gray-200' : 'text-gray-400 bg-white border-gray-200'
          }`}
        >
          Todos
        </button>
        {SEVERIDADES.map(s => (
          <button
            key={s.value}
            type="button"
            onClick={() => setFiltroSeveridad(s.value)}
            className={`px-3 py-2 rounded-xl text-xs font-medium border min-h-[44px] flex-shrink-0 ${
              filtroSeveridad === s.value ? s.className : 'text-gray-400 bg-white border-gray-200'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => <SkeletonCard key={i} lines={2} />)}
        </div>
      ) : incidentes.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-10 text-center text-gray-400">
          <AlertTriangle size={32} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">No hay incidentes registrados.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {incidentes.map(inc => {
            const cfg = severidadCfg(inc.severidad);
            return (
              <div key={inc.id} className="bg-white rounded-2xl border border-gray-100 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-800">{inc.alumno_nombre}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{formatFecha(inc.fecha)}</p>
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-1 rounded-full border flex-shrink-0 ${cfg.className}`}>
                    {inc.severidad_label || cfg.label}
                  </span>
                </div>
                <p className="text-sm text-gray-600 mt-2 whitespace-pre-line">{inc.descripcion}</p>
                {inc.adjunto && (
                  <a
                    href={inc.adjunto}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-medium text-[var(--docente-primary)] mt-2"
                  >
                    <Paperclip size={12} /> Ver foto
                  </a>
                )}
              </div>
            );
          })}
        </div>
      )}

      {modalAbierto && (
        <ModalNuevoIncidente
          onClose={() => setModalAbierto(false)}
          onSubmit={registrarIncidente}
          creando={creando}
        />
      )}
    </div>
  );
};

export default DocenteIncidentes;
