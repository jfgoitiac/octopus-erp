import { useEffect, useRef, useState } from 'react';
import { Tag, VenetianMask, ChevronDown } from 'lucide-react';

/**
 * Dropdown/popover de la barra de herramientas para insertar placeholders
 * (agrupados por entidad) y el selector de género inline
 * ({{sexo:variante_a|variante_b}}).
 *
 * Props:
 * - grupos: [{ clave, etiqueta, placeholders: [{ token, etiqueta }] }]
 * - paresGenero: [{ a, b }]
 * - onInsertarPlaceholder(token, etiqueta)
 * - onInsertarGenero(a, b)
 */
const SelectorPlaceholders = ({ grupos = [], paresGenero = [], onInsertarPlaceholder, onInsertarGenero }) => {
  const [abierto, setAbierto] = useState(null); // 'placeholders' | 'genero' | null
  const ref = useRef(null);

  useEffect(() => {
    const handleClickFuera = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setAbierto(null);
    };
    document.addEventListener('mousedown', handleClickFuera);
    return () => document.removeEventListener('mousedown', handleClickFuera);
  }, []);

  return (
    <div className="flex items-center gap-1" ref={ref}>
      <div className="relative">
        <button
          type="button"
          onClick={() => setAbierto((v) => (v === 'placeholders' ? null : 'placeholders'))}
          title="Insertar placeholder"
          className="flex items-center gap-1 px-2 py-1.5 rounded-md text-xs font-medium"
          style={{
            color: abierto === 'placeholders' ? 'var(--pb)' : 'var(--ash)',
            background: abierto === 'placeholders' ? 'var(--pb-light)' : 'transparent',
          }}
        >
          <Tag size={14} />
          <span className="hidden sm:inline">Placeholder</span>
          <ChevronDown size={12} />
        </button>
        {abierto === 'placeholders' && (
          <div
            className="absolute left-0 top-full mt-1 z-20 w-64 max-w-[80vw] max-h-72 overflow-y-auto rounded-lg shadow-lg p-2"
            style={{ border: '0.5px solid var(--border-md)', background: '#fff' }}
          >
            {grupos.length === 0 && (
              <p className="text-xs px-2 py-1.5" style={{ color: 'var(--ash)' }}>
                No hay placeholders disponibles.
              </p>
            )}
            {grupos.map((grupo) => (
              <div key={grupo.clave} className="mb-1.5 last:mb-0">
                <p className="text-[10px] font-bold uppercase tracking-wider px-2 py-1" style={{ color: 'var(--ash)' }}>
                  {grupo.etiqueta}
                </p>
                {grupo.placeholders.map((ph) => (
                  <button
                    key={ph.token}
                    type="button"
                    onClick={() => {
                      onInsertarPlaceholder?.(ph.token, ph.etiqueta);
                      setAbierto(null);
                    }}
                    className="w-full text-left px-2 py-1.5 rounded-md text-xs"
                    style={{ color: 'var(--jet)' }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                  >
                    {ph.etiqueta}
                  </button>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="relative">
        <button
          type="button"
          onClick={() => setAbierto((v) => (v === 'genero' ? null : 'genero'))}
          title="Insertar selector de género"
          className="flex items-center gap-1 px-2 py-1.5 rounded-md text-xs font-medium"
          style={{
            color: abierto === 'genero' ? 'var(--pb)' : 'var(--ash)',
            background: abierto === 'genero' ? 'var(--pb-light)' : 'transparent',
          }}
        >
          <VenetianMask size={14} />
          <span className="hidden sm:inline">Género</span>
          <ChevronDown size={12} />
        </button>
        {abierto === 'genero' && (
          <div
            className="absolute left-0 top-full mt-1 z-20 w-56 max-w-[80vw] max-h-72 overflow-y-auto rounded-lg shadow-lg p-2"
            style={{ border: '0.5px solid var(--border-md)', background: '#fff' }}
          >
            {paresGenero.map(({ a, b }) => (
              <button
                key={`${a}-${b}`}
                type="button"
                onClick={() => {
                  onInsertarGenero?.(a, b);
                  setAbierto(null);
                }}
                className="w-full text-left px-2 py-1.5 rounded-md text-xs font-mono"
                style={{ color: 'var(--jet)' }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
              >
                {a}/{b}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default SelectorPlaceholders;
