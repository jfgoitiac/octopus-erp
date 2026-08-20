import { ImageOff } from 'lucide-react';
import { resolverImagenUrl, resolverAltText } from './utils';

/**
 * Preview simplificada del bloque `galeria`.
 */
const Galeria = ({ contenido = {} }) => {
  const { titulo, imagenes = [], columnas = 3 } = contenido;

  return (
    <div className="p-2">
      {titulo && <h3 className="text-sm font-bold mb-3" style={{ color: 'var(--jet)' }}>{titulo}</h3>}
      {imagenes.length === 0 ? (
        <div className="flex flex-col items-center py-8 text-center" style={{ color: 'var(--ash)' }}>
          <ImageOff size={18} className="opacity-30 mb-1" />
          <p className="text-xs">Sin imágenes en la galería.</p>
        </div>
      ) : (
        <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(columnas || 3, 4)}, minmax(0, 1fr))` }}>
          {imagenes.map((img, i) => {
            const url = resolverImagenUrl(img.media_id);
            return (
              <div key={i} className="aspect-square rounded-md overflow-hidden flex items-center justify-center" style={{ background: 'var(--jet-light)' }}>
                {url ? (
                  <img src={url} alt={resolverAltText(img.media_id, img.caption)} className="w-full h-full object-cover" />
                ) : (
                  <ImageOff size={14} className="opacity-30" style={{ color: 'var(--ash)' }} />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default Galeria;
