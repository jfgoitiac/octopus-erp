import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';

// Contenedor de cada bloque del panel ejecutivo: encabezado con ícono, título,
// contador opcional y enlace "Ver todo" que pasa a ancho completo en móvil.
const PanelTarjeta = ({ icono: Icono, titulo, subtitulo, contador, enlace, children, className = '' }) => (
  <section
    className={`flex min-w-0 flex-col gap-3 rounded-[var(--radius-card)] p-[var(--pad-card)] sm:p-[var(--pad-card-lg)] ${className}`}
    style={{ background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)' }}
  >
    <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-center gap-2.5">
        {Icono && (
          <span
            className="flex size-8 shrink-0 items-center justify-center rounded-lg"
            style={{ background: 'var(--pb-light)', color: 'var(--pb-mid)' }}
            aria-hidden="true"
          >
            <Icono size={16} />
          </span>
        )}
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-sm sm:text-base" style={{ color: 'var(--jet)', fontWeight: 'var(--fw-semibold)' }}>
            <span className="truncate">{titulo}</span>
            {contador != null && (
              <span
                className="shrink-0 rounded-full px-2 py-0.5 text-xs"
                style={{ background: 'var(--jet-light)', color: 'var(--jet-mid)', fontWeight: 'var(--fw-medium)' }}
              >
                {contador}
              </span>
            )}
          </h2>
          {subtitulo && <p className="text-xs" style={{ color: 'var(--ash)' }}>{subtitulo}</p>}
        </div>
      </div>
      {enlace && (
        <Link
          to={enlace.to}
          className="inline-flex min-h-[40px] w-full items-center justify-center gap-1 rounded-lg px-3 text-sm transition-colors hover:bg-[var(--pb-light)] sm:min-h-0 sm:w-auto sm:py-1.5"
          style={{ color: 'var(--pb-mid)', fontWeight: 'var(--fw-medium)' }}
        >
          {enlace.texto}
          <ChevronRight size={14} aria-hidden="true" />
        </Link>
      )}
    </header>
    {children}
  </section>
);

// Estado vacío compacto dentro de una tarjeta.
export const PanelVacio = ({ icono: Icono, texto }) => (
  <div
    className="flex flex-col items-center gap-1.5 rounded-lg px-3 py-6 text-center text-sm"
    style={{ background: 'var(--surface-sunken)', color: 'var(--ash)' }}
  >
    {Icono && <Icono size={20} aria-hidden="true" />}
    <p>{texto}</p>
  </div>
);

export default PanelTarjeta;
