import { useState, useEffect, useCallback } from 'react';
import { toast } from 'react-toastify';
import { MessageCircle } from 'lucide-react';
import { getDashboard } from '../api/portal.service';
import { usePortalMensajes } from '../hooks/usePortalMensajes';
import EstudianteSelector from '../components/EstudianteSelector';
import ChatMensajes from '../../components/mensajes/ChatMensajes';

const PortalMensajes = () => {
  const [alumnos, setAlumnos] = useState([]);
  const [alumnoActivo, setAlumnoActivo] = useState(null);
  const [loadingAlumnos, setLoadingAlumnos] = useState(true);

  const cargarAlumnos = useCallback(async (signal) => {
    setLoadingAlumnos(true);
    try {
      const res = await getDashboard(signal);
      const lista = res.data?.alumnos || [];
      setAlumnos(lista);
      if (lista.length > 0) setAlumnoActivo(lista[0]);
    } catch (err) {
      if (err.name === 'CanceledError' || err.code === 'ERR_CANCELED') return;
      toast.error('No se pudo cargar la información.');
    } finally {
      setLoadingAlumnos(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    cargarAlumnos(controller.signal);
    return () => controller.abort();
  }, [cargarAlumnos]);

  const { mensajes, loading, enviando, enviar, marcarLeido } = usePortalMensajes(alumnoActivo?.id);

  useEffect(() => {
    mensajes.filter(m => !m.leido && !m.es_propio).forEach(m => marcarLeido(m.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mensajes.length, alumnoActivo?.id]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-bold text-gray-800 flex items-center gap-2">
          <MessageCircle size={20} className="text-[#0fa3b1]" />
          Mensajes
        </h1>
        <p className="text-xs text-gray-400 mt-0.5">Conversaciones con los docentes</p>
      </div>

      {loadingAlumnos ? (
        <div className="h-10 w-28 bg-gray-200 rounded-full animate-pulse" />
      ) : (
        <EstudianteSelector alumnos={alumnos} alumnoActivo={alumnoActivo} onSelect={setAlumnoActivo} />
      )}

      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden" style={{ height: '65vh' }}>
        {alumnoActivo ? (
          <ChatMensajes
            mensajes={mensajes}
            loading={loading}
            enviando={enviando}
            onEnviar={enviar}
            placeholder="Responder al docente..."
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center px-4 text-gray-400">
            <MessageCircle size={32} className="opacity-30 mb-2" />
            <p className="text-sm">No hay alumnos asociados a tu cuenta.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default PortalMensajes;
