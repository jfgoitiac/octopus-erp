import { useState, useEffect, useMemo, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { MessageCircle, ArrowLeft, Plus, X } from 'lucide-react';

import { useDocenteConversaciones } from '../hooks/useDocenteConversaciones';
import { useDocenteMensajes } from '../hooks/useDocenteMensajes';
import { useDocenteMisMaterias } from '../hooks/useDocenteMisMaterias';
import { useAlumnosSeccion } from '../hooks/useAlumnosSeccion';
import ChatMensajes from '../../components/mensajes/ChatMensajes';
import SkeletonCard from '../../portal/components/SkeletonCard';
import { useEscape } from '../../hooks/useEscape';
import { useFocusTrap } from '../../hooks/useFocusTrap';

const formatFechaCorta = (fechaStr) => {
  try {
    return format(new Date(fechaStr), 'd MMM, HH:mm', { locale: es });
  } catch {
    return fechaStr;
  }
};

const ModalNuevaConversacion = ({ onClose, onSeleccionar }) => {
  const { materias, loading: loadingMaterias } = useDocenteMisMaterias();
  const [materiaId, setMateriaId] = useState('');
  const materiaSeleccionada = materias.find(m => String(m.id) === String(materiaId));
  const { alumnos, loading: loadingAlumnos } = useAlumnosSeccion(materiaSeleccionada?.grado_seccion);
  const containerRef = useRef(null);

  useEscape(true, onClose);
  useFocusTrap(containerRef);

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="nueva-conversacion-titulo"
    >
      <div ref={containerRef} className="bg-white rounded-t-2xl sm:rounded-2xl p-5 w-full sm:max-w-md max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 id="nueva-conversacion-titulo" className="font-bold text-gray-800">Nueva conversación</h3>
          <button onClick={onClose} aria-label="Cerrar" className="p-1 text-gray-400">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label htmlFor="nueva-conversacion-materia" className="block text-xs font-medium text-gray-500 mb-1.5">Materia</label>
            <select
              id="nueva-conversacion-materia"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--docente-primary)]/30"
              value={materiaId}
              onChange={e => setMateriaId(e.target.value)}
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
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Alumno</label>
              {loadingAlumnos ? (
                <div className="space-y-2">
                  {[...Array(3)].map((_, i) => <SkeletonCard key={i} lines={0} />)}
                </div>
              ) : alumnos.length === 0 ? (
                <p className="text-sm text-gray-400">No hay alumnos registrados en esta sección.</p>
              ) : (
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {alumnos.map(a => (
                    <button
                      key={a.id}
                      onClick={() => onSeleccionar(a)}
                      className="w-full text-left px-3 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-700 hover:border-[var(--docente-primary)] min-h-[44px]"
                    >
                      {a.nombre}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const DocenteMensajes = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { conversaciones, loading: loadingConversaciones, refetch } = useDocenteConversaciones();
  const [alumnoActivo, setAlumnoActivo] = useState(null);
  const [modalNueva, setModalNueva] = useState(Boolean(location.state?.nuevo));

  useEffect(() => {
    if (location.state?.nuevo) navigate(location.pathname, { replace: true, state: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { mensajes, loading, enviando, enviar, marcarLeido } = useDocenteMensajes(alumnoActivo?.id);

  useEffect(() => {
    mensajes.filter(m => !m.leido && !m.es_propio).forEach(m => marcarLeido(m.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mensajes.length, alumnoActivo?.id]);

  const handleEnviar = async (cuerpo) => {
    const ok = await enviar(cuerpo);
    if (ok) refetch();
    return ok;
  };

  const handleSeleccionarNueva = (alumno) => {
    setAlumnoActivo({ id: alumno.id, alumno_nombre: alumno.nombre });
    setModalNueva(false);
  };

  const totalNoLeidos = useMemo(
    () => conversaciones.reduce((acc, c) => acc + c.noLeidos, 0),
    [conversaciones]
  );

  // Vista de chat (alumno seleccionado)
  if (alumnoActivo) {
    return (
      <div className="space-y-3">
        <button
          onClick={() => setAlumnoActivo(null)}
          className="flex items-center gap-1.5 text-sm text-gray-500 min-h-[44px]"
        >
          <ArrowLeft size={16} /> Conversaciones
        </button>
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden" style={{ height: '70vh' }}>
          <ChatMensajes
            mensajes={mensajes}
            loading={loading}
            enviando={enviando}
            onEnviar={handleEnviar}
            tituloConversacion={alumnoActivo.alumno_nombre}
            placeholder="Escribe al representante..."
          />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-gray-800 flex items-center gap-2">
            <MessageCircle size={20} className="text-[var(--docente-primary)]" />
            Mensajes
            {totalNoLeidos > 0 && (
              <span className="text-[10px] font-bold bg-red-500 text-white rounded-full px-1.5 py-0.5">
                {totalNoLeidos}
              </span>
            )}
          </h1>
          <p className="text-xs text-gray-400 mt-0.5">Conversaciones con representantes</p>
        </div>
        <button
          onClick={() => setModalNueva(true)}
          aria-label="Nueva conversación"
          className="w-10 h-10 rounded-full bg-[var(--docente-primary)] text-white flex items-center justify-center flex-shrink-0"
        >
          <Plus size={18} />
        </button>
      </div>

      {loadingConversaciones ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => <SkeletonCard key={i} lines={1} />)}
        </div>
      ) : conversaciones.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-10 text-center text-gray-400">
          <MessageCircle size={32} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">Todavía no tienes conversaciones.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {conversaciones.map(c => (
            <button
              key={c.alumno_id}
              onClick={() => setAlumnoActivo({ id: c.alumno_id, alumno_nombre: c.alumno_nombre })}
              className="w-full text-left bg-white rounded-2xl border border-gray-100 p-4 flex items-center justify-between gap-3 min-h-[44px]"
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-800 truncate">{c.alumno_nombre}</p>
                <p className="text-xs text-gray-400 truncate mt-0.5">{c.ultimoMensaje.cuerpo}</p>
              </div>
              <div className="flex flex-col items-end gap-1 flex-shrink-0">
                <span className="text-[10px] text-gray-400">{formatFechaCorta(c.ultimoMensaje.fecha)}</span>
                {c.noLeidos > 0 && (
                  <span className="text-[10px] font-bold bg-red-500 text-white rounded-full px-1.5 py-0.5">
                    {c.noLeidos}
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      )}

      {modalNueva && (
        <ModalNuevaConversacion onClose={() => setModalNueva(false)} onSeleccionar={handleSeleccionarNueva} />
      )}
    </div>
  );
};

export default DocenteMensajes;
