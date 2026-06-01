import { useState, useRef, useEffect } from 'react';
import { Building2, ChevronDown, Check } from 'lucide-react';

/**
 * SedeSwitcher — selector de sede activa para el Sidebar.
 * Solo se muestra si sedes.length > 1.
 * Props: sedes (array), sedeActiva (object|null), onCambiar (fn)
 */
const SedeSwitcher = ({ sedes = [], sedeActiva, onCambiar }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  if (sedes.length <= 1) {
    if (sedes.length === 1) {
      return (
        <div
          className="mx-2.5 mb-2 px-3 py-2 rounded-xl flex items-center gap-2"
          style={{ background: 'var(--pb-light)', border: '0.5px solid var(--border-md)' }}
        >
          <Building2 size={13} style={{ color: 'var(--pb-mid)', flexShrink: 0 }} />
          <span className="text-xs font-medium truncate" style={{ color: 'var(--pb-mid)' }}>
            {sedes[0].nombre}
          </span>
        </div>
      );
    }
    return null;
  }

  const label = sedeActiva ? sedeActiva.nombre : 'Todas las sedes';

  return (
    <div className="mx-2.5 mb-2 relative" ref={ref}>
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full px-3 py-2 rounded-xl flex items-center gap-2 text-left"
        style={{
          background: 'var(--pb-light)',
          border: '0.5px solid var(--border-md)',
          transition: 'background 0.15s',
        }}
        onMouseEnter={e => e.currentTarget.style.background = 'var(--ash-light)'}
        onMouseLeave={e => e.currentTarget.style.background = 'var(--pb-light)'}
      >
        <Building2 size={13} style={{ color: 'var(--pb-mid)', flexShrink: 0 }} />
        <span className="text-xs font-medium truncate flex-1" style={{ color: 'var(--jet)' }}>
          {label}
        </span>
        <ChevronDown
          size={12}
          style={{
            color: 'var(--ash)',
            flexShrink: 0,
            transform: open ? 'rotate(180deg)' : 'rotate(0)',
            transition: 'transform 0.18s',
          }}
        />
      </button>

      {open && (
        <div
          className="absolute left-0 right-0 z-50 rounded-xl overflow-hidden shadow-lg"
          style={{
            top: 'calc(100% + 4px)',
            background: 'var(--porcelain)',
            border: '0.5px solid var(--border-md)',
          }}
        >
          {/* Opción "Todas" para directivo_red */}
          <button
            onClick={() => { onCambiar(null); setOpen(false); }}
            className="w-full px-3 py-2 flex items-center gap-2 text-left"
            style={{
              transition: 'background 0.15s',
              background: !sedeActiva ? 'var(--pb-light)' : 'transparent',
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--ash-light)'}
            onMouseLeave={e => e.currentTarget.style.background = !sedeActiva ? 'var(--pb-light)' : 'transparent'}
          >
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full" style={{ background: 'var(--pb)', color: '#fff' }}>
              Todas
            </span>
            <span className="text-xs flex-1" style={{ color: 'var(--jet)' }}>Todas las sedes</span>
            {!sedeActiva && <Check size={12} style={{ color: 'var(--pb)' }} />}
          </button>

          {sedes.map(sede => (
            <button
              key={sede.id}
              onClick={() => { onCambiar(sede); setOpen(false); }}
              className="w-full px-3 py-2 flex items-center gap-2 text-left"
              style={{
                transition: 'background 0.15s',
                background: sedeActiva?.id === sede.id ? 'var(--pb-light)' : 'transparent',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--ash-light)'}
              onMouseLeave={e => e.currentTarget.style.background = sedeActiva?.id === sede.id ? 'var(--pb-light)' : 'transparent'}
            >
              <Building2 size={12} style={{ color: 'var(--ash)', flexShrink: 0 }} />
              <span className="text-xs flex-1 truncate" style={{ color: 'var(--jet)' }}>
                {sede.nombre}
              </span>
              {!sede.activa && (
                <span className="text-[9px] px-1 rounded" style={{ background: 'var(--red-light)', color: 'var(--red)' }}>
                  Inactiva
                </span>
              )}
              {sedeActiva?.id === sede.id && <Check size={12} style={{ color: 'var(--pb)' }} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default SedeSwitcher;
