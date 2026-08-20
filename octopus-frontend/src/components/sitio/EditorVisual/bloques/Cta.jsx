import { resolverImagenUrl } from './utils';

/**
 * Preview simplificada del bloque `cta`.
 */
const Cta = ({ contenido = {} }) => {
  const { titulo, texto, boton_texto, fondo } = contenido;
  const url = resolverImagenUrl(fondo);

  return (
    <div
      className="relative rounded-lg overflow-hidden flex flex-col items-center justify-center text-center px-6 py-8"
      style={{ background: url ? undefined : 'var(--pb)' }}
    >
      {url && <img src={url} className="absolute inset-0 w-full h-full object-cover" alt="" />}
      {url && <div className="absolute inset-0" style={{ background: 'rgba(43,48,58,0.5)' }} />}
      <div className="relative z-10">
        <h3 className="text-base font-bold text-white">{titulo || 'Título de la llamada a la acción'}</h3>
        {texto && <p className="text-xs mt-1.5 text-white/85">{texto}</p>}
        <span className="inline-block mt-3 px-4 py-2 rounded-lg text-xs font-semibold" style={{ background: '#fff', color: 'var(--pb)' }}>
          {boton_texto || 'Botón'}
        </span>
      </div>
    </div>
  );
};

export default Cta;
