import { memo, useState } from 'react';
import { Paperclip, ShieldCheck, Users } from 'lucide-react';
import { fmtFecha } from '../../utils/format';
import CircularLecturasModal from './CircularLecturasModal';

const TarjetaCircular = memo(({ circular }) => {
  const [verLecturas, setVerLecturas] = useState(false);
  const { id, titulo, cuerpo, fecha_publicacion, adjunto, requiere_confirmacion, publicado_por_username, publicado_por_nombre, total_destinatarios, total_leidas } = circular;
  const publicadoPor = publicado_por_nombre || publicado_por_username;

  return (
    <div className="rounded-xl p-4" style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)' }}>
      <div className="flex items-start justify-between gap-3 mb-2">
        <p className="text-sm font-medium" style={{ color: 'var(--jet)' }}>{titulo}</p>
        {requiere_confirmacion && (
          <span
            className="text-xs font-medium px-2.5 py-1 rounded-full flex items-center gap-1 flex-shrink-0"
            style={{ color: 'var(--pb-mid)', background: 'var(--pb-light)' }}
          >
            <ShieldCheck size={12} /> Requiere confirmación
          </span>
        )}
      </div>

      <p className="text-sm mb-3 line-clamp-3" style={{ color: 'var(--jet)' }}>{cuerpo}</p>

      <div className="flex items-center justify-between text-xs flex-wrap gap-2" style={{ color: 'var(--ash)' }}>
        <span>{fmtFecha(fecha_publicacion)} {publicadoPor ? `— ${publicadoPor}` : ''}</span>
        <div className="flex items-center gap-3">
          {adjunto && (
            <a
              href={adjunto}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 font-medium"
              style={{ color: 'var(--pb)' }}
            >
              <Paperclip size={13} /> Ver adjunto
            </a>
          )}
          <button
            type="button"
            onClick={() => setVerLecturas(true)}
            className="flex items-center gap-1 font-medium"
            style={{ color: 'var(--pb)' }}
          >
            <Users size={13} /> {total_leidas}/{total_destinatarios} leyeron
          </button>
        </div>
      </div>

      {verLecturas && (
        <CircularLecturasModal circularId={id} onClose={() => setVerLecturas(false)} />
      )}
    </div>
  );
});

TarjetaCircular.displayName = 'TarjetaCircular';

export default TarjetaCircular;
