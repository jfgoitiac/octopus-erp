import { ImageOff } from 'lucide-react';
import { resolverImagenUrl, resolverAltText } from './utils';

const OVERLAY_STYLE = {
  oscuro: 'rgba(43,48,58,0.55)',
  claro: 'rgba(255,255,255,0.35)',
  ninguno: 'transparent',
};

/**
 * Preview simplificada del bloque `hero` (sin Framer Motion).
 */
const Hero = ({ contenido = {} }) => {
  const { titulo, subtitulo, imagen_fondo, cta_texto, overlay = 'oscuro' } = contenido;
  const url = resolverImagenUrl(imagen_fondo, 'lg');

  return (
    <div className="relative rounded-lg overflow-hidden flex items-center justify-center text-center min-h-[220px]" style={{ background: 'var(--jet-light)' }}>
      {url ? (
        <img src={url} alt={resolverAltText(imagen_fondo)} className="absolute inset-0 w-full h-full object-cover" />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center" style={{ color: 'var(--ash)' }}>
          <ImageOff size={22} className="opacity-30" />
        </div>
      )}
      <div className="absolute inset-0" style={{ background: OVERLAY_STYLE[overlay] || OVERLAY_STYLE.oscuro }} />
      <div className="relative z-10 px-6 py-8 max-w-md">
        <h2 className="text-lg font-bold" style={{ color: overlay === 'claro' ? 'var(--jet)' : '#fff' }}>
          {titulo || 'Título del hero'}
        </h2>
        {subtitulo && (
          <p className="text-sm mt-2" style={{ color: overlay === 'claro' ? 'var(--jet-mid)' : 'rgba(255,255,255,0.85)' }}>
            {subtitulo}
          </p>
        )}
        {cta_texto && (
          <span className="inline-block mt-4 px-4 py-2 rounded-lg text-xs font-semibold" style={{ background: 'var(--pb)', color: '#fff' }}>
            {cta_texto}
          </span>
        )}
      </div>
    </div>
  );
};

export default Hero;
