import { memo } from 'react';
import { User, Paperclip } from 'lucide-react';
import { fmtFecha } from '../../utils/format';

const SEVERIDAD_CONFIG = {
  L: { label: 'Leve',     color: 'var(--pb-mid)', bg: 'var(--pb-light)' },
  M: { label: 'Moderado', color: '#b45309',       bg: '#fef3c7' },
  G: { label: 'Grave',    color: 'var(--red)',    bg: 'var(--red-light)' },
};

const TarjetaIncidente = memo(({ incidente }) => {
  const { alumno_nombre, fecha, descripcion, severidad, severidad_label, adjunto, registrado_por_username } = incidente;
  const cfg = SEVERIDAD_CONFIG[severidad] || SEVERIDAD_CONFIG.L;

  return (
    <div className="rounded-xl p-4" style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)' }}>
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <User size={16} style={{ color: 'var(--ash)' }} className="flex-shrink-0" />
          <p className="text-sm font-medium truncate" style={{ color: 'var(--jet)' }}>{alumno_nombre}</p>
        </div>
        <span
          className="text-xs font-medium px-2.5 py-1 rounded-full flex-shrink-0"
          style={{ color: cfg.color, background: cfg.bg }}
        >
          {severidad_label || cfg.label}
        </span>
      </div>

      <p className="text-sm mb-3" style={{ color: 'var(--jet)' }}>{descripcion}</p>

      <div className="flex items-center justify-between text-xs" style={{ color: 'var(--ash)' }}>
        <span>{fmtFecha(fecha)} {registrado_por_username ? `— ${registrado_por_username}` : ''}</span>
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
      </div>
    </div>
  );
});

TarjetaIncidente.displayName = 'TarjetaIncidente';

export default TarjetaIncidente;
