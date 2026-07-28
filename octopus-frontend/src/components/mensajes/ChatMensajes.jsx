import { useEffect, useRef, useState } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Send, Loader2, MessageCircle } from 'lucide-react';

const formatHora = (fechaStr) => {
  try {
    return format(new Date(fechaStr), "d MMM, HH:mm", { locale: es });
  } catch {
    return fechaStr;
  }
};

/**
 * Chat de burbujas reutilizable entre panel admin (docente) y portal
 * (representante). El backend ya resuelve `es_propio` por remitente según
 * quién esté autenticado, así que este componente no necesita saber si
 * corre en el panel o en el portal.
 */
export default function ChatMensajes({ mensajes, loading, enviando, onEnviar, tituloConversacion, placeholder = 'Escribe un mensaje...' }) {
  const [texto, setTexto] = useState('');
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [mensajes.length]);

  const handleEnviar = async () => {
    const cuerpo = texto.trim();
    if (!cuerpo) return;
    const ok = await onEnviar(cuerpo);
    if (ok) setTexto('');
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleEnviar();
    }
  };

  return (
    <div className="flex flex-col h-full">
      {tituloConversacion && (
        <div className="px-4 py-3" style={{ borderBottom: '0.5px solid var(--border-md)' }}>
          <p className="text-sm font-medium" style={{ color: 'var(--jet)' }}>{tituloConversacion}</p>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 min-h-[240px]">
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 size={20} className="animate-spin" style={{ color: 'var(--pb)' }} />
          </div>
        ) : mensajes.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center" style={{ color: 'var(--ash)' }}>
            <MessageCircle size={32} className="opacity-30 mb-2" />
            <p className="text-sm">Todavía no hay mensajes en esta conversación.</p>
          </div>
        ) : (
          mensajes.map(m => (
            <div key={m.id} className={`flex ${m.es_propio ? 'justify-end' : 'justify-start'}`}>
              <div
                className="max-w-[75%] rounded-2xl px-3.5 py-2.5"
                style={m.es_propio
                  ? { background: 'var(--pb)', color: '#fff' }
                  : { background: 'var(--porcelain)', color: 'var(--jet)', border: '0.5px solid var(--border-md)' }}
              >
                {!m.es_propio && (
                  <p className="text-[11px] font-medium mb-0.5 opacity-70">{m.remitente_nombre}</p>
                )}
                <p className="text-sm whitespace-pre-line">{m.cuerpo}</p>
                <p className={`text-[10px] mt-1 ${m.es_propio ? 'text-white/70' : ''}`} style={!m.es_propio ? { color: 'var(--ash)' } : undefined}>
                  {formatHora(m.fecha)}
                </p>
              </div>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      <div className="flex items-center gap-2 px-3 py-3" style={{ borderTop: '0.5px solid var(--border-md)' }}>
        <input
          type="text"
          placeholder={placeholder}
          className="flex-1 px-3 py-2.5 rounded-full text-sm outline-none min-h-[44px]"
          style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)', fontSize: '16px' }}
          value={texto}
          onChange={e => setTexto(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={enviando}
        />
        <button
          onClick={handleEnviar}
          disabled={enviando || !texto.trim()}
          aria-label="Enviar mensaje"
          className="flex-shrink-0 w-11 h-11 rounded-full flex items-center justify-center text-white disabled:opacity-50"
          style={{ background: 'var(--pb)' }}
        >
          {enviando ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
        </button>
      </div>
    </div>
  );
}
