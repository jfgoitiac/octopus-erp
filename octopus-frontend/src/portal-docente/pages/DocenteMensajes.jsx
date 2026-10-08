import { useState, useEffect, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { MessageCircle, ArrowLeft, Plus } from 'lucide-react';

import { useDocenteConversaciones } from '../hooks/useDocenteConversaciones';
import { useDocenteMensajes } from '../hooks/useDocenteMensajes';
import { useDocenteMisMaterias } from '../hooks/useDocenteMisMaterias';
import { useAlumnosSeccion } from '../hooks/useAlumnosSeccion';
import ChatMensajes from '../../components/mensajes/ChatMensajes';
import SkeletonCard from '../../portal/components/SkeletonCard';
import { Modal } from '../../components/ui/Modal';

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
  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      titulo={"Nueva conversación"}
    >
        <div className="space-y-4">
          <div>
            <label htmlFor="nueva-conversacion-materia" className="block text-xs font-medium text-[var(--ash)] mb-1.5">Materia</label>
            <select
              id="nueva-conversacion-materia"
              className="w-full border border-[var(--border)] rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--docente-primary)]/30"
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
              <label className="block text-xs font-medium text-[var(--ash)] mb-1.5">Alumno</label>
              {loadingAlumnos ? (
                <div className="space-y-2">
                  {[...Array(3)].map((_, i) => <SkeletonCard key={i} lines={0} />)}
                </div>
              ) : alumnos.length === 0 ? (
                <p className="text-sm text-[var(--ash)]">No hay alumnos registrados en esta sección.</p>
              ) : (
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {alumnos.map(a => (
                    <button
                      key={a.id}
                      onClick={() => onSeleccionar(a)}
                      className="w-full text-left px-3 py-2.5 rounded-xl border border-[var(--border)] text-sm text-[var(--jet-mid)] hover:border-[var(--docente-primary)] min-h-[44px]"
                    >
                      {a.nombre}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
    </Modal>
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
          className="flex items-center gap-1.5 text-sm text-[var(--ash)] hover:text-[var(--jet-mid)] transition-colors min-h-[44px]"
        >
          <ArrowLeft size={16} /> Conversaciones
        </button>
        <div className="bg-[var(--surface)] rounded-2xl border border-[var(--border)] overflow-hidden" style={{ height: '70dvh' }}>
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
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-[var(--jet)] flex items-center gap-2">
            <MessageCircle size={20} className="text-[var(--docente-primary)]" />
            Mensajes
            {totalNoLeidos > 0 && (
              <span className="text-[10px] font-bold bg-[var(--docente-primary)] text-white rounded-full px-1.5 py-0.5 min-w-5 text-center">
                {totalNoLeidos}
              </span>
            )}
          </h1>
          <p className="text-xs text-[var(--ash)] mt-0.5">Conversaciones con representantes</p>
        </div>
        <button
          onClick={() => setModalNueva(true)}
          aria-label="Nueva conversación"
          className="w-11 h-11 rounded-full bg-[var(--docente-primary)] text-white flex items-center justify-center flex-shrink-0 hover:bg-[var(--docente-primary-dark)] transition-colors"
        >
          <Plus size={18} />
        </button>
      </div>

      {loadingConversaciones ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => <SkeletonCard key={i} lines={1} />)}
        </div>
      ) : conversaciones.length === 0 ? (
        <div className="bg-[var(--surface)] rounded-2xl border border-[var(--border)] p-10 text-center text-[var(--ash)]">
          <MessageCircle size={32} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">Todavía no tienes conversaciones.</p>
        </div>
      ) : (
        <div className="space-y-2 md:grid md:grid-cols-2 md:gap-3 md:space-y-0">
          {conversaciones.map(c => (
            <button
              key={c.alumno_id}
              onClick={() => setAlumnoActivo({ id: c.alumno_id, alumno_nombre: c.alumno_nombre })}
              className="w-full text-left bg-[var(--surface)] rounded-2xl border border-[var(--border)] p-4 flex items-center justify-between gap-3 min-h-[44px] hover:border-[var(--docente-primary)]/40 transition-colors"
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[var(--jet)] truncate">{c.alumno_nombre}</p>
                <p className="text-xs text-[var(--ash)] truncate mt-0.5">{c.ultimoMensaje?.cuerpo}</p>
              </div>
              <div className="flex flex-col items-end gap-1 flex-shrink-0">
                <span className="text-xs text-[var(--ash)]">{c.ultimoMensaje?.fecha ? formatFechaCorta(c.ultimoMensaje.fecha) : ''}</span>
                {c.noLeidos > 0 && (
                  <span className="text-[10px] font-bold bg-[var(--docente-primary)] text-white rounded-full px-1.5 py-0.5 min-w-5 text-center">
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
