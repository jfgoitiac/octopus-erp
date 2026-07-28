import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { FileText, Link as LinkIcon, Trash2 } from 'lucide-react';

const formatFecha = (fechaStr) => {
  try {
    return format(new Date(fechaStr), "d 'de' MMM yyyy", { locale: es });
  } catch {
    return fechaStr;
  }
};

export default function TarjetaMaterial({ material, onEliminar, puedeEliminar }) {
  return (
    <div
      className="rounded-xl p-4 flex items-start gap-3"
      style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)' }}
    >
      <div
        className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
        style={{ background: 'var(--pb-light)', color: 'var(--pb-mid)' }}
      >
        {material.archivo ? <FileText size={17} /> : <LinkIcon size={17} />}
      </div>

      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium" style={{ color: 'var(--jet)' }}>{material.titulo}</p>
        {material.descripcion && (
          <p className="text-xs mt-1" style={{ color: 'var(--ash)' }}>{material.descripcion}</p>
        )}
        <div className="flex items-center gap-3 mt-2 flex-wrap">
          {material.archivo && (
            <a
              href={material.archivo}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-medium"
              style={{ color: 'var(--pb)' }}
            >
              Ver archivo
            </a>
          )}
          {material.enlace && (
            <a
              href={material.enlace}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-medium"
              style={{ color: 'var(--pb)' }}
            >
              Abrir enlace
            </a>
          )}
          <span className="text-xs" style={{ color: 'var(--ash)' }}>{formatFecha(material.fecha)}</span>
        </div>
      </div>

      {puedeEliminar && (
        <button
          onClick={() => onEliminar(material.id)}
          aria-label="Eliminar material"
          className="p-1.5 rounded-lg flex-shrink-0"
          style={{ color: 'var(--ash)' }}
        >
          <Trash2 size={15} />
        </button>
      )}
    </div>
  );
}
