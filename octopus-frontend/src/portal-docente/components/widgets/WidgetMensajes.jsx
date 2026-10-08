import { Link } from 'react-router-dom';
import { MessageCircle } from 'lucide-react';
import { Avatar, SectionCard, EmptyRow } from './shared';

const WidgetMensajes = ({ conversaciones, className = '' }) => (
  <SectionCard title="Mensajes recientes" to="/portal-docente/mensajes" className={className}>
    {conversaciones.length === 0 ? (
      <EmptyRow icon={MessageCircle} text="No tienes mensajes todavía." subtext="Los mensajes con representantes aparecerán aquí." />
    ) : (
      conversaciones.slice(0, 3).map(c => (
        <Link
          key={c.alumno_id}
          to="/portal-docente/mensajes"
          className="flex items-center gap-3 px-4 py-3 hover:bg-[var(--surface-sunken)] transition-colors"
        >
          <Avatar nombre={c.alumno_nombre} />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-[var(--jet)] truncate">{c.alumno_nombre}</p>
            <p className="text-xs text-[var(--ash)] truncate">{c.ultimoMensaje?.cuerpo || 'Sin mensajes'}</p>
          </div>
          {c.noLeidos > 0 && (
            <span className="min-w-5 h-5 px-1 rounded-full bg-[var(--docente-primary)] text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0">
              {c.noLeidos}
            </span>
          )}
        </Link>
      ))
    )}
  </SectionCard>
);

export default WidgetMensajes;
