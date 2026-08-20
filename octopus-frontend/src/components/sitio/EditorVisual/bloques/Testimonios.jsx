import { Quote, User } from 'lucide-react';
import { resolverImagenUrl, resolverAltText } from './utils';

/**
 * Preview simplificada del bloque `testimonios`.
 */
const Testimonios = ({ contenido = {} }) => {
  const { titulo, items = [] } = contenido;

  return (
    <div className="p-2">
      {titulo && <h3 className="text-sm font-bold mb-3" style={{ color: 'var(--jet)' }}>{titulo}</h3>}
      {items.length === 0 ? (
        <div className="flex flex-col items-center py-8 text-center" style={{ color: 'var(--ash)' }}>
          <Quote size={18} className="opacity-30 mb-1" />
          <p className="text-xs">Sin testimonios agregados.</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-2">
          {items.map((it, i) => {
            const url = resolverImagenUrl(it.foto);
            return (
              <div key={i} className="rounded-lg p-3" style={{ border: '0.5px solid var(--border-md)', background: '#fff' }}>
                <Quote size={14} className="mb-1.5 opacity-40" style={{ color: 'var(--pb)' }} />
                <p className="text-[11px] italic" style={{ color: 'var(--jet-mid)' }}>{it.texto || 'Texto del testimonio.'}</p>
                <div className="flex items-center gap-2 mt-2.5">
                  <div className="w-6 h-6 rounded-full overflow-hidden flex items-center justify-center flex-shrink-0" style={{ background: 'var(--jet-light)' }}>
                    {url ? <img src={url} alt={resolverAltText(it.foto)} className="w-full h-full object-cover" /> : <User size={11} style={{ color: 'var(--ash)' }} />}
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold" style={{ color: 'var(--jet)' }}>{it.nombre || 'Nombre'}</p>
                    {it.cargo && <p className="text-[10px]" style={{ color: 'var(--ash)' }}>{it.cargo}</p>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default Testimonios;
