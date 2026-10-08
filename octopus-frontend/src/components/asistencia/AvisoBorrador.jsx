import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { History } from 'lucide-react';

/** Ofrece recuperar un pase de lista que quedó sin guardar en este dispositivo. */
const AvisoBorrador = ({ borrador, onRecuperar, onDescartar }) => {
  const marcados = borrador.registros.filter(r => r.estado).length;
  const hace = formatDistanceToNow(new Date(borrador.guardadoEn), { locale: es, addSuffix: true });

  return (
    <div
      role="status"
      className="flex flex-col gap-3 rounded-2xl p-4 anim-fade-up sm:flex-row sm:items-center sm:gap-4"
      style={{ background: 'var(--pb-light)', boxShadow: 'inset 0 0 0 1px rgba(15,163,177,0.25)' }}
    >
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white" style={{ color: 'var(--pb-mid)' }}>
          <History size={18} aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold" style={{ color: 'var(--jet)' }}>Tienes un pase sin guardar</p>
          <p className="text-xs" style={{ color: 'var(--jet-mid)' }}>
            {marcados} alumno{marcados === 1 ? '' : 's'} marcado{marcados === 1 ? '' : 's'} {hace} en este dispositivo.
          </p>
        </div>
      </div>
      <div className="flex flex-col-reverse gap-2 sm:flex-row">
        <button
          type="button"
          onClick={onDescartar}
          className="min-h-[44px] rounded-xl px-4 text-sm font-medium transition-colors hover:bg-white/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pb)]/40"
          style={{ color: 'var(--jet-mid)' }}
        >
          Descartar
        </button>
        <button
          type="button"
          onClick={onRecuperar}
          className="min-h-[44px] w-full rounded-xl px-4 text-sm font-semibold text-white transition-transform active:scale-[0.97] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pb)]/50 focus-visible:ring-offset-2 sm:w-auto"
          style={{ background: 'var(--docente-primary)' }}
        >
          Recuperar
        </button>
      </div>
    </div>
  );
};

export default AvisoBorrador;
