import { memo } from 'react';
import { ChevronLeft, ChevronRight, ArrowRight, Clock } from 'lucide-react';
import { ESTADO, CONFIGS_ESTADO } from '../../constants/asistencia';
import AvatarAlumno from './AvatarAlumno';

const SOMBRA_TARJETA = '0 1px 2px rgba(43,48,58,0.06), 0 12px 32px -8px rgba(43,48,58,0.18)';

/**
 * Cara de la tarjeta de un alumno. Es la única parte que se desliza (swipe y
 * transiciones del mazo); los botones de estado viven fuera (BotonesEstado)
 * para que queden quietos en la zona del pulgar.
 */
const TarjetaAlumno = memo(function TarjetaAlumno({
  registro,
  numero,
  expandido = false,
  destello = null,
  onObservacion,
  onSiguiente,
  cardRef,
  className = '',
  style,
  ...rest
}) {
  const { alumno_id, alumno_nombre, estado, observacion } = registro;
  const cfg = estado ? CONFIGS_ESTADO[estado] : null;
  const inputId = `pl-obs-${alumno_id}`;

  return (
    <article
      ref={cardRef}
      className={`absolute inset-0 flex flex-col rounded-2xl bg-white overflow-hidden select-none ${className}`}
      style={{ boxShadow: SOMBRA_TARJETA, border: '0.5px solid var(--border-md)', ...style }}
      {...rest}
    >
      {/* Halo superior: color de marca, o del estado cuando ya está marcado */}
      <div
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-28 pointer-events-none"
        style={{ background: `linear-gradient(180deg, ${cfg ? cfg.activeStyle.background : 'var(--pb-light)'} 0%, transparent 100%)` }}
      />

      {/* Destello del color del estado al marcar: confirma el toque también donde
          no hay vibración (iOS). Se re-monta con cada marcado (key). */}
      {destello && (
        <span
          key={destello.seq}
          aria-hidden="true"
          className="pl-destello pointer-events-none absolute inset-0 z-10 rounded-2xl"
          style={{ boxShadow: `inset 0 0 0 3px ${CONFIGS_ESTADO[destello.estado]?.activeStyle.color}` }}
        />
      )}

      {expandido ? (
        // Con la observación abierta, la cabecera se compacta en una fila para
        // que input y "Siguiente" quepan en 360×640 sin scroll.
        <div className="relative flex items-center gap-3 px-4 pt-4 sm:px-5 sm:pt-5">
          <AvatarAlumno nombre={alumno_nombre} foto={registro.alumno_foto} className="h-11 w-11 rounded-xl text-sm" />
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-base font-semibold leading-tight tracking-tight sm:text-lg" style={{ color: 'var(--jet)' }}>
              {alumno_nombre || 'Alumno sin nombre'}
            </h2>
            <p className="mt-1 flex items-center gap-1.5 text-[11px]">
              <span className="font-semibold tabular-nums" style={{ color: 'var(--jet-mid)' }}>N.º {registro.numero_lista ?? numero}</span>
              {cfg && (
                <span className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-semibold" style={{ background: cfg.activeStyle.color, color: '#fff' }}>
                  <cfg.Icon size={11} aria-hidden="true" /> {cfg.label}
                </span>
              )}
            </p>
          </div>
        </div>
      ) : (
        <>
          <div className="relative flex items-center justify-between gap-2 px-4 pt-4 sm:px-5 sm:pt-5">
            <span
              className="inline-flex items-center rounded-lg px-2 py-1 text-[11px] font-semibold tabular-nums"
              style={{ background: 'rgba(255,255,255,0.7)', color: 'var(--jet-mid)', border: '0.5px solid var(--border-md)' }}
            >
              N.º {registro.numero_lista ?? numero}
            </span>
            {cfg && (
              <span
                className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold"
                style={{ background: cfg.activeStyle.color, color: '#fff' }}
              >
                <cfg.Icon size={12} aria-hidden="true" /> {cfg.label}
              </span>
            )}
          </div>

          <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-5 text-center sm:gap-4 sm:px-6">
            <AvatarAlumno
              nombre={alumno_nombre}
              foto={registro.alumno_foto}
              className="h-20 w-20 rounded-2xl text-2xl sm:h-24 sm:w-24 sm:text-3xl"
            />
            <h2 className="line-clamp-2 break-words text-xl font-semibold leading-tight tracking-tight sm:text-2xl" style={{ color: 'var(--jet)' }}>
              {alumno_nombre || 'Alumno sin nombre'}
            </h2>
          </div>
        </>
      )}

      {expandido && (
        <div className="relative mt-auto space-y-2 px-4 pb-4 pt-3 sm:px-5 sm:pb-5 anim-fade-up">
          <label htmlFor={inputId} className="sr-only">Observación (opcional)</label>
          <input
            id={inputId}
            type="text"
            enterKeyHint="next"
            autoComplete="off"
            placeholder="Observación (opcional)"
            className="w-full select-text rounded-xl px-3 py-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--pb)]/40"
            style={{ border: '0.5px solid var(--border-md)', background: 'var(--ash-light)', color: 'var(--jet)' }}
            value={observacion || ''}
            onChange={e => onObservacion(alumno_id, e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); onSiguiente(); } }}
          />
          <button
            type="button"
            onClick={onSiguiente}
            className="flex w-full min-h-[44px] items-center justify-center gap-1.5 rounded-xl text-sm font-semibold text-white transition-transform active:scale-[0.97] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pb)]/40 focus-visible:ring-offset-2"
            style={{ background: 'var(--docente-primary)' }}
          >
            Siguiente <ArrowRight size={16} aria-hidden="true" />
          </button>
        </div>
      )}
    </article>
  );
});

export default TarjetaAlumno;

const BotonEstado = ({ estado, activo, confirmando, onMarcar, tecla, botonRef, className = '' }) => {
  const cfg = CONFIGS_ESTADO[estado];
  const { background, color } = cfg.activeStyle;
  return (
    <button
      ref={botonRef}
      type="button"
      aria-pressed={activo}
      aria-keyshortcuts={tecla}
      onClick={() => onMarcar(estado)}
      className={`relative flex min-h-14 items-center justify-center gap-2 rounded-xl px-3 text-base font-semibold transition-[transform,background-color,color,box-shadow] duration-150 ease-out active:scale-[0.97] focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--pb)]/50 ${
        confirmando ? 'scale-[0.98]' : ''
      } ${className}`}
      style={activo
        ? { background: color, color: '#fff', boxShadow: `0 6px 16px -6px ${color}` }
        : { background, color, boxShadow: 'inset 0 0 0 1px rgba(43,48,58,0.06)' }}
    >
      <cfg.Icon size={20} aria-hidden="true" />
      {cfg.label}
      <kbd
        aria-hidden="true"
        className="absolute right-3 hidden rounded-md px-1.5 py-0.5 text-[10px] font-semibold lg:inline"
        style={{ background: activo ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.75)', color: activo ? '#fff' : color }}
      >
        {tecla}
      </kbd>
    </button>
  );
};

/** Botonera fija bajo el mazo: 3 estados grandes + navegación y "Llegó tarde". */
export const BotonesEstado = memo(function BotonesEstado({
  estado,
  confirmando,
  onMarcar,
  onAnterior,
  onSiguiente,
  puedeAnterior,
  primerBotonRef,
}) {
  const tarde = estado === ESTADO.RETARDADO;
  const cfgTarde = CONFIGS_ESTADO[ESTADO.RETARDADO].activeStyle;
  const navClases = 'flex min-h-[44px] items-center gap-1 rounded-xl px-2.5 text-sm font-medium transition-[transform,background-color] active:scale-[0.97] disabled:opacity-35 disabled:active:scale-100 hover:bg-[var(--ash-light)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pb)]/40';

  return (
    <div className="space-y-2">
      <BotonEstado
        estado={ESTADO.PRESENTE}
        tecla="P"
        activo={estado === ESTADO.PRESENTE}
        confirmando={confirmando === ESTADO.PRESENTE}
        onMarcar={onMarcar}
        botonRef={primerBotonRef}
        className="w-full"
      />
      {/* Excepción declarada del estándar: grupo de 2 botones cortos, cabe en 360px */}
      <div className="grid grid-cols-2 gap-2">
        <BotonEstado
          estado={ESTADO.AUSENTE}
          tecla="A"
          activo={estado === ESTADO.AUSENTE}
          confirmando={confirmando === ESTADO.AUSENTE}
          onMarcar={onMarcar}
        />
        <BotonEstado
          estado={ESTADO.JUSTIFICADO}
          tecla="J"
          activo={estado === ESTADO.JUSTIFICADO}
          confirmando={confirmando === ESTADO.JUSTIFICADO}
          onMarcar={onMarcar}
        />
      </div>

      <div className="flex items-center justify-between gap-1 pt-0.5">
        <button type="button" onClick={onAnterior} disabled={!puedeAnterior} className={navClases} style={{ color: 'var(--jet-mid)' }} aria-keyshortcuts="ArrowLeft">
          <ChevronLeft size={18} aria-hidden="true" /> <span>Anterior</span>
        </button>

        <button
          type="button"
          aria-pressed={tarde}
          aria-keyshortcuts="T"
          onClick={() => onMarcar(ESTADO.RETARDADO)}
          className="flex min-h-[44px] items-center gap-1.5 rounded-xl px-3 text-xs font-semibold transition-[transform,background-color,color] active:scale-[0.97] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pb)]/40"
          style={tarde
            ? { background: cfgTarde.color, color: '#fff' }
            : { background: 'transparent', color: cfgTarde.color, boxShadow: `inset 0 0 0 1px ${cfgTarde.background}` }}
        >
          <Clock size={14} aria-hidden="true" /> Llegó tarde
        </button>

        <button type="button" onClick={onSiguiente} className={navClases} style={{ color: 'var(--jet-mid)' }} aria-keyshortcuts="ArrowRight">
          <span>Siguiente</span> <ChevronRight size={18} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
});
