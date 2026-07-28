import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { MessageCircle } from 'lucide-react';

const formatFecha = (fechaStr) => {
  try {
    return format(new Date(fechaStr), "d MMM", { locale: es });
  } catch {
    return fechaStr;
  }
};

export default function ListaConversaciones({ conversaciones, loading, activaId, onSelect }) {
  if (loading) {
    return (
      <div className="space-y-2 p-2">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-14 rounded-xl animate-pulse" style={{ background: 'var(--border-md)' }} />
        ))}
      </div>
    );
  }

  if (conversaciones.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center px-4" style={{ color: 'var(--ash)' }}>
        <MessageCircle size={32} className="opacity-30 mb-2" />
        <p className="text-sm">No hay conversaciones todavía.</p>
      </div>
    );
  }

  return (
    <div className="overflow-y-auto">
      {conversaciones.map(c => {
        const activa = activaId === c.alumnoId;
        const noLeido = !c.ultimoMensaje.leido && !c.ultimoMensaje.es_propio;
        return (
          <button
            key={c.alumnoId}
            onClick={() => onSelect(c)}
            className="w-full text-left px-4 py-3 flex items-start gap-2 transition-colors"
            style={{
              background: activa ? 'var(--pb-light)' : 'transparent',
              borderBottom: '0.5px solid var(--border)',
            }}
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium truncate" style={{ color: 'var(--jet)' }}>{c.alumnoNombre}</p>
                <span className="text-[11px] flex-shrink-0" style={{ color: 'var(--ash)' }}>
                  {formatFecha(c.ultimoMensaje.fecha)}
                </span>
              </div>
              <p className="text-xs truncate mt-0.5" style={{ color: noLeido ? 'var(--jet)' : 'var(--ash)', fontWeight: noLeido ? 600 : 400 }}>
                {c.ultimoMensaje.cuerpo}
              </p>
            </div>
            {noLeido && <span className="w-2 h-2 rounded-full flex-shrink-0 mt-1.5" style={{ background: 'var(--pb)' }} />}
          </button>
        );
      })}
    </div>
  );
}
