import { ImageOff } from 'lucide-react';
import { resolverImagenUrl, resolverAltText } from './utils';

/**
 * Preview simplificada del bloque `texto_imagen`.
 */
const TextoImagen = ({ contenido = {} }) => {
  const { titulo, texto, imagen, posicion_imagen = 'derecha', cta_texto } = contenido;
  const url = resolverImagenUrl(imagen);
  const imagenPrimero = posicion_imagen === 'izquierda';

  const bloqueImagen = (
    <div className="rounded-lg overflow-hidden flex-1 min-h-[140px] flex items-center justify-center" style={{ background: 'var(--jet-light)' }}>
      {url ? (
        <img src={url} alt={resolverAltText(imagen)} className="w-full h-full object-cover" />
      ) : (
        <ImageOff size={20} className="opacity-30" style={{ color: 'var(--ash)' }} />
      )}
    </div>
  );

  const bloqueTexto = (
    <div className="flex-1 flex flex-col justify-center">
      <h3 className="text-sm font-bold" style={{ color: 'var(--jet)' }}>{titulo || 'Título'}</h3>
      <p className="text-xs mt-2 leading-relaxed" style={{ color: 'var(--jet-mid)' }}>
        {texto || 'Texto descriptivo del bloque.'}
      </p>
      {cta_texto && (
        <span className="inline-block mt-3 self-start px-3 py-1.5 rounded-lg text-[11px] font-semibold" style={{ background: 'var(--pb-light)', color: 'var(--pb)' }}>
          {cta_texto}
        </span>
      )}
    </div>
  );

  return (
    <div className="flex flex-col sm:flex-row gap-4 p-2">
      {imagenPrimero ? (<>{bloqueImagen}{bloqueTexto}</>) : (<>{bloqueTexto}{bloqueImagen}</>)}
    </div>
  );
};

export default TextoImagen;
