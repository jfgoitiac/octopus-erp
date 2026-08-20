import * as LucideIcons from 'lucide-react';
import { LayoutGrid, ImageOff } from 'lucide-react';
import { resolverImagenUrl, resolverAltText } from './utils';

const IconoDinamico = ({ nombre }) => {
  const Cmp = nombre && LucideIcons[nombre];
  if (!Cmp) return <LayoutGrid size={16} style={{ color: 'var(--pb)' }} />;
  return <Cmp size={16} style={{ color: 'var(--pb)' }} />;
};

/**
 * Preview simplificada del bloque `cards`.
 */
const Cards = ({ contenido = {} }) => {
  const { titulo, items = [], columnas = 3 } = contenido;

  return (
    <div className="p-2">
      {titulo && <h3 className="text-sm font-bold mb-3" style={{ color: 'var(--jet)' }}>{titulo}</h3>}
      {items.length === 0 ? (
        <div className="flex flex-col items-center py-8 text-center" style={{ color: 'var(--ash)' }}>
          <LayoutGrid size={18} className="opacity-30 mb-1" />
          <p className="text-xs">Sin cards agregadas.</p>
        </div>
      ) : (
        <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(columnas || 3, 4)}, minmax(0, 1fr))` }}>
          {items.map((it, i) => {
            const url = resolverImagenUrl(it.imagen);
            return (
              <div key={i} className="rounded-lg p-3" style={{ border: '0.5px solid var(--border-md)', background: '#fff' }}>
                {url ? (
                  <img src={url} alt={resolverAltText(it.imagen)} className="w-full aspect-video object-cover rounded-md mb-2" />
                ) : it.icono ? (
                  <div className="mb-2"><IconoDinamico nombre={it.icono} /></div>
                ) : (
                  <div className="flex items-center justify-center aspect-video rounded-md mb-2" style={{ background: 'var(--jet-light)' }}>
                    <ImageOff size={12} className="opacity-30" style={{ color: 'var(--ash)' }} />
                  </div>
                )}
                <p className="text-xs font-semibold" style={{ color: 'var(--jet)' }}>{it.titulo || 'Título'}</p>
                <p className="text-[11px] mt-1" style={{ color: 'var(--ash)' }}>{it.texto || 'Texto breve.'}</p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default Cards;
