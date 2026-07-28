import { useState, useEffect } from 'react';
import { MessageCircle, Plus } from 'lucide-react';
import { useMensajes } from '../hooks/useMensajes';
import ListaConversaciones from '../components/mensajes/ListaConversaciones';
import ChatMensajes from '../components/mensajes/ChatMensajes';
import ModalNuevaConversacion from '../components/mensajes/ModalNuevaConversacion';

const Mensajes = () => {
  const {
    conversaciones, mensajesConversacionActiva, alumnoActivo, setAlumnoActivo,
    loading, enviando, enviar, iniciarConversacion, marcarLeido,
  } = useMensajes();
  const [modalAbierto, setModalAbierto] = useState(false);
  const [vistaMobile, setVistaMobile] = useState('lista'); // 'lista' | 'chat'

  useEffect(() => {
    if (!alumnoActivo) return;
    mensajesConversacionActiva
      .filter(m => !m.leido && !m.es_propio)
      .forEach(m => marcarLeido(m.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alumnoActivo, mensajesConversacionActiva.length]);

  const handleSelect = (conversacion) => {
    setAlumnoActivo({ id: conversacion.alumnoId, nombre: conversacion.alumnoNombre });
    setVistaMobile('chat');
  };

  const handleIniciar = async (alumno, cuerpo) => {
    const ok = await iniciarConversacion(alumno, cuerpo);
    if (ok) setVistaMobile('chat');
    return ok;
  };

  return (
    <div className="animate-fadeIn">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-medium flex items-center gap-2" style={{ color: 'var(--jet)' }}>
            <MessageCircle size={20} style={{ color: 'var(--pb)' }} />
            Mensajes
          </h2>
          <p className="text-sm mt-1" style={{ color: 'var(--ash)' }}>
            Conversaciones con representantes sobre tus alumnos
          </p>
        </div>
        <button
          onClick={() => setModalAbierto(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white min-h-[44px]"
          style={{ background: 'var(--pb)' }}
        >
          <Plus size={16} /> Nueva
        </button>
      </div>

      <div
        className="rounded-xl overflow-hidden grid grid-cols-1 md:grid-cols-[300px_1fr]"
        style={{ border: '0.5px solid var(--border-md)', background: '#fff', height: '65vh' }}
      >
        {/* Lista de conversaciones */}
        <div
          className={`overflow-y-auto ${vistaMobile === 'chat' ? 'hidden md:block' : ''}`}
          style={{ borderRight: '0.5px solid var(--border-md)' }}
        >
          <ListaConversaciones
            conversaciones={conversaciones}
            loading={loading}
            activaId={alumnoActivo?.id}
            onSelect={handleSelect}
          />
        </div>

        {/* Chat */}
        <div className={`${vistaMobile === 'lista' ? 'hidden md:flex' : 'flex'} flex-col`}>
          {alumnoActivo ? (
            <>
              <button
                onClick={() => setVistaMobile('lista')}
                className="md:hidden text-left px-4 py-2 text-xs"
                style={{ color: 'var(--pb)', borderBottom: '0.5px solid var(--border-md)' }}
              >
                ← Conversaciones
              </button>
              <ChatMensajes
                mensajes={mensajesConversacionActiva}
                loading={false}
                enviando={enviando}
                onEnviar={enviar}
                tituloConversacion={alumnoActivo.nombre}
              />
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center px-4" style={{ color: 'var(--ash)' }}>
              <MessageCircle size={40} className="opacity-30 mb-3" />
              <p className="text-sm">Selecciona una conversación o inicia una nueva.</p>
            </div>
          )}
        </div>
      </div>

      {modalAbierto && (
        <ModalNuevaConversacion
          onClose={() => setModalAbierto(false)}
          onSubmit={handleIniciar}
        />
      )}
    </div>
  );
};

export default Mensajes;
