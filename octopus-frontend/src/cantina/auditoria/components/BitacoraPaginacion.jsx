import { ChevronLeft, ChevronRight } from 'lucide-react';
import { ESTILO_BOTON_SECUNDARIO } from './BitacoraFormato';

// Paginación Anterior / Siguiente de los listados de bitácora y alertas
// (mismo aspecto que la de AuditoriaCierres). No se muestra con una sola página.
export default function BitacoraPaginacion({ pagina, total, tamano, onCambio, etiqueta }) {
  const totalPaginas = Math.max(1, Math.ceil(total / tamano));
  if (total <= tamano) return null;

  const boton = 'inline-flex items-center gap-1 min-h-[44px] px-3 rounded-xl text-sm font-medium disabled:opacity-40';
  return (
    <nav className="flex items-center justify-between gap-2" aria-label={etiqueta}>
      <button
        type="button"
        onClick={() => onCambio(Math.max(1, pagina - 1))}
        disabled={pagina <= 1}
        className={boton}
        style={ESTILO_BOTON_SECUNDARIO}
      >
        <ChevronLeft size={16} aria-hidden="true" />
        Anterior
      </button>
      <span className="text-sm text-center" style={{ color: 'var(--jet-mid)' }}>
        Página {pagina} de {totalPaginas}
      </span>
      <button
        type="button"
        onClick={() => onCambio(Math.min(totalPaginas, pagina + 1))}
        disabled={pagina >= totalPaginas}
        className={boton}
        style={ESTILO_BOTON_SECUNDARIO}
      >
        Siguiente
        <ChevronRight size={16} aria-hidden="true" />
      </button>
    </nav>
  );
}
