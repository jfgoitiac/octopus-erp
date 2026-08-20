import { ImageOff, GalleryHorizontal } from 'lucide-react';
import { resolverImagenUrl, resolverAltText } from './utils';

/**
 * Preview simplificada del bloque `carrusel` (sin Embla — solo el primer
 * slide, con indicador de cuántos hay).
 */
const Carrusel = ({ contenido = {} }) => {
  const { slides = [], autoplay } = contenido;
  const primero = slides[0];
  const url = primero ? resolverImagenUrl(primero.imagen, 'lg') : null;

  if (slides.length === 0) {
    return (
      <div className="flex flex-col items-center py-10 text-center" style={{ color: 'var(--ash)' }}>
        <GalleryHorizontal size={18} className="opacity-30 mb-1" />
        <p className="text-xs">Sin slides en el carrusel.</p>
      </div>
    );
  }

  return (
    <div className="relative rounded-lg overflow-hidden min-h-[160px] flex items-center justify-center" style={{ background: 'var(--jet-light)' }}>
      {url ? (
        <img src={url} alt={resolverAltText(primero.imagen)} className="absolute inset-0 w-full h-full object-cover" />
      ) : (
        <ImageOff size={20} className="opacity-30" style={{ color: 'var(--ash)' }} />
      )}
      {(primero?.titulo || primero?.texto) && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-4" style={{ background: 'rgba(43,48,58,0.45)' }}>
          {primero.titulo && <p className="text-sm font-bold text-white">{primero.titulo}</p>}
          {primero.texto && <p className="text-xs text-white/85 mt-1">{primero.texto}</p>}
        </div>
      )}
      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-1">
        {slides.map((_, i) => (
          <span key={i} className="w-1.5 h-1.5 rounded-full" style={{ background: i === 0 ? '#fff' : 'rgba(255,255,255,0.5)' }} />
        ))}
      </div>
      <span className="absolute top-2 right-2 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase" style={{ background: 'rgba(0,0,0,0.4)', color: '#fff' }}>
        {slides.length} slide{slides.length !== 1 ? 's' : ''}{autoplay ? ' · autoplay' : ''}
      </span>
    </div>
  );
};

export default Carrusel;
