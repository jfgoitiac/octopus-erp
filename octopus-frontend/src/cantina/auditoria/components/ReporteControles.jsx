import { ChevronLeft, ChevronRight, FileSpreadsheet, FileText, Loader2 } from 'lucide-react';
import { ESTILO_TARJETA } from './CierreFormato';

// Controles compartidos de las pestañas de reportes.

// Selector segmentado (agrupación o tipo). Desplazable en 360px.
export function ReporteSelector({ etiqueta, opciones, valor, onCambio }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-2">
      <span className="text-xs uppercase tracking-widest shrink-0" style={{ color: 'var(--ash)' }}>{etiqueta}</span>
      <div
        role="group"
        aria-label={etiqueta}
        className="flex gap-1 overflow-x-auto rounded-xl p-1 max-w-full"
        style={{ background: 'var(--jet-light)' }}
      >
        {opciones.map((o) => {
          const activo = o.valor === valor;
          return (
            <button
              key={o.valor}
              type="button"
              aria-pressed={activo}
              onClick={() => onCambio(o.valor)}
              className="shrink-0 min-h-[36px] px-3 rounded-lg text-xs sm:text-sm font-medium whitespace-nowrap transition-colors"
              style={activo
                ? { background: '#fff', color: 'var(--pb-mid)', boxShadow: '0 1px 3px rgba(43,48,58,.12)' }
                : { color: 'var(--jet-mid)' }}
            >
              {o.etiqueta}
            </button>
          );
        })}
      </div>
    </div>
  );
}

const ESTILO_BOTON = { background: '#fff', border: '0.5px solid var(--border-md)', color: 'var(--jet)' };

// Botones PDF / Excel. Dos botones cortos: caben lado a lado en 360px.
export function ReporteExportar({ onPdf, onExcel, exportando, deshabilitado }) {
  const inactivo = deshabilitado || Boolean(exportando);
  return (
    <div className="grid grid-cols-2 gap-2 w-full sm:w-auto shrink-0">
      <button
        type="button"
        onClick={onPdf}
        disabled={inactivo}
        className="inline-flex items-center justify-center gap-1.5 min-h-[44px] px-3 rounded-xl text-sm font-medium hover:bg-[var(--red-light)] disabled:opacity-40 transition-colors"
        style={ESTILO_BOTON}
      >
        {exportando === 'pdf'
          ? <Loader2 size={16} className="animate-spin" aria-hidden="true" />
          : <FileText size={16} aria-hidden="true" style={{ color: 'var(--red)' }} />}
        PDF
      </button>
      <button
        type="button"
        onClick={onExcel}
        disabled={inactivo}
        className="inline-flex items-center justify-center gap-1.5 min-h-[44px] px-3 rounded-xl text-sm font-medium hover:bg-[var(--green-light)] disabled:opacity-40 transition-colors"
        style={ESTILO_BOTON}
      >
        {exportando === 'excel'
          ? <Loader2 size={16} className="animate-spin" aria-hidden="true" />
          : <FileSpreadsheet size={16} aria-hidden="true" style={{ color: 'var(--green)' }} />}
        Excel
      </button>
    </div>
  );
}

// Fila superior de cada pestaña: selector a la izquierda, exportar a la derecha.
export function ReporteBarra({ children, exportar }) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
      <div className="min-w-0">{children}</div>
      {exportar}
    </div>
  );
}

// Tarjetas de resumen: 2 columnas en móvil, 4 desde lg.
export function ReporteResumen({ items }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
      {items.map((it) => (
        <div key={it.etiqueta} className="flex min-w-0 flex-col gap-1 rounded-2xl p-3 sm:p-4" style={{ ...ESTILO_TARJETA, ...(it.fondo ? { background: it.fondo } : {}) }}>
          <span className="flex items-center gap-1.5 text-[11px] sm:text-xs uppercase tracking-wider truncate" style={{ color: 'var(--ash)' }}>
            {it.icono && <it.icono size={14} aria-hidden="true" className="shrink-0" />}
            {it.etiqueta}
          </span>
          <span className="text-lg sm:text-xl font-semibold font-mono tabular-nums truncate" style={{ color: it.color ?? 'var(--jet)' }}>
            {it.valor}
          </span>
          {it.nota && <span className="text-xs truncate" style={{ color: 'var(--ash)' }}>{it.nota}</span>}
        </div>
      ))}
    </div>
  );
}

// Paginación de listados paginados (StandardResultsPagination).
export function ReportePaginacion({ pagina, total, tamano, onCambio, etiqueta }) {
  const totalPaginas = Math.max(1, Math.ceil(total / tamano));
  if (total <= tamano) return null;
  return (
    <nav className="flex items-center justify-between gap-2" aria-label={etiqueta}>
      <button
        type="button"
        onClick={() => onCambio(Math.max(1, pagina - 1))}
        disabled={pagina <= 1}
        className="inline-flex items-center gap-1 min-h-[44px] px-3 rounded-xl text-sm font-medium disabled:opacity-40"
        style={ESTILO_BOTON}
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
        className="inline-flex items-center gap-1 min-h-[44px] px-3 rounded-xl text-sm font-medium disabled:opacity-40"
        style={ESTILO_BOTON}
      >
        Siguiente
        <ChevronRight size={16} aria-hidden="true" />
      </button>
    </nav>
  );
}
