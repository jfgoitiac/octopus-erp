import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow, parseISO, isValid } from 'date-fns';
import { es } from 'date-fns/locale';
import { Bell, BellOff, CheckCircle2, XCircle, CheckCheck, RefreshCw, ChevronRight } from 'lucide-react';
import { Modal } from '../../components/ui/Modal';
import { SkeletonLine } from './SkeletonCard';
import { useAvisosPortal } from '../hooks/useAvisosPortal';

const ESTILO_TIPO = {
  comprobante_rechazado: { icon: XCircle, color: 'var(--red)', fondo: 'var(--red-light)' },
  comprobante_aprobado: { icon: CheckCircle2, color: 'var(--green)', fondo: 'var(--green-light)' },
};
const ESTILO_DEFECTO = { icon: Bell, color: 'var(--portal-primary)', fondo: 'var(--portal-tint)' };

const haceCuanto = (valor) => {
  if (!valor) return '';
  const fecha = parseISO(valor);
  return isValid(fecha) ? formatDistanceToNow(fecha, { addSuffix: true, locale: es }) : '';
};

// Solo se navega a rutas del propio portal; cualquier otra URL se ignora.
const rutaInterna = (url) => (typeof url === 'string' && /^\/portal(\/|$|\?|#)/.test(url) ? url : null);

const AvisoSkeleton = () => (
  <ul className="divide-y divide-[var(--portal-line)]" aria-busy="true" aria-label="Cargando avisos">
    {[0, 1, 2].map((i) => (
      <li key={i} className="flex gap-3 px-4 py-4 sm:px-5">
        <div className="portal-skeleton animate-pulse h-10 w-10 shrink-0 rounded-xl" />
        <div className="flex-1 space-y-2">
          <SkeletonLine width="w-3/5" height="h-4" />
          <SkeletonLine width="w-full" height="h-3" />
          <SkeletonLine width="w-1/4" height="h-3" />
        </div>
      </li>
    ))}
  </ul>
);

/**
 * Campana del encabezado del portal con el contador de avisos no leídos y la
 * bandeja (Modal compartido; en celular ocupa casi toda la pantalla).
 * Tocar un aviso lo marca leído y, si su `url` es del portal, navega a ella.
 */
const BandejaAvisos = () => {
  const navigate = useNavigate();
  const { avisos, noLeidos, loading, error, recargar, marcarLeido, marcarTodos } = useAvisosPortal();
  const [abierta, setAbierta] = useState(false);

  const abrir = () => { setAbierta(true); recargar(); };
  const cerrar = useCallback(() => setAbierta(false), []);

  const abrirAviso = (aviso) => {
    marcarLeido(aviso);
    const destino = rutaInterna(aviso.url);
    if (destino) {
      setAbierta(false);
      navigate(destino);
    }
  };

  const contador = noLeidos > 9 ? '9+' : String(noLeidos);
  const etiqueta = noLeidos > 0
    ? `Notificaciones: ${noLeidos} sin leer`
    : 'Notificaciones';

  let contenido;
  if (loading && avisos.length === 0) {
    contenido = <AvisoSkeleton />;
  } else if (error && avisos.length === 0) {
    contenido = (
      <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
        <BellOff size={32} className="text-[var(--portal-muted)]" aria-hidden="true" />
        <p className="text-sm text-[var(--portal-muted)]">No pudimos cargar tus avisos.</p>
        <button
          type="button"
          onClick={recargar}
          className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-[var(--portal-line)] px-4 text-sm font-semibold text-[var(--portal-ink)] hover:bg-[var(--portal-canvas)]"
        >
          <RefreshCw size={16} aria-hidden="true" /> Reintentar
        </button>
      </div>
    );
  } else if (avisos.length === 0) {
    contenido = (
      <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--portal-tint)]">
          <Bell size={26} style={{ color: 'var(--portal-primary)' }} aria-hidden="true" />
        </span>
        <p className="text-sm font-semibold text-[var(--portal-ink)]">Estás al día</p>
        <p className="max-w-xs text-sm text-[var(--portal-muted)]">Aquí verás cuando el colegio revise tus comprobantes de pago y otros avisos importantes.</p>
      </div>
    );
  } else {
    contenido = (
      <ul className="divide-y divide-[var(--portal-line)]">
        {avisos.map((aviso) => {
          const { icon: Icon, color, fondo } = ESTILO_TIPO[aviso.tipo] || ESTILO_DEFECTO;
          const navegable = Boolean(rutaInterna(aviso.url));
          return (
            <li key={aviso.id}>
              <button
                type="button"
                onClick={() => abrirAviso(aviso)}
                className={`flex w-full items-start gap-3 px-4 py-4 text-left transition-colors hover:bg-[var(--portal-canvas)] sm:px-5 ${aviso.leido ? '' : 'bg-[var(--portal-tint)]/40'}`}
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ backgroundColor: fondo }}>
                  <Icon size={20} style={{ color }} aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-start gap-2">
                    <span className={`min-w-0 flex-1 break-words text-sm text-[var(--portal-ink)] ${aviso.leido ? 'font-medium' : 'font-semibold'}`}>{aviso.titulo}</span>
                    {!aviso.leido && (
                      <>
                        <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-[var(--portal-primary)]" aria-hidden="true" />
                        <span className="sr-only">(sin leer)</span>
                      </>
                    )}
                  </span>
                  {aviso.cuerpo && (
                    <span className="mt-1 block whitespace-pre-line break-words text-sm text-[var(--portal-muted)]">{aviso.cuerpo}</span>
                  )}
                  <span className="mt-1.5 flex items-center justify-between gap-2 text-xs text-[var(--portal-muted)]">
                    <span>{haceCuanto(aviso.creado_en)}</span>
                    {navegable && <ChevronRight size={16} className="shrink-0" aria-hidden="true" />}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    );
  }

  const footer = noLeidos > 0 ? (
    <button
      type="button"
      onClick={marcarTodos}
      className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-[var(--portal-line)] bg-[var(--portal-surface)] px-4 text-sm font-semibold text-[var(--portal-ink)] hover:bg-[var(--portal-canvas)] sm:w-auto"
    >
      <CheckCheck size={16} aria-hidden="true" /> Marcar todo como leído
    </button>
  ) : null;

  return (
    <>
      <button
        type="button"
        onClick={abrir}
        className="relative flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full text-[var(--portal-muted)] transition-colors hover:bg-[var(--portal-canvas)] hover:text-[var(--portal-ink)]"
        aria-label={etiqueta}
        aria-haspopup="dialog"
      >
        <Bell size={20} aria-hidden="true" />
        {noLeidos > 0 && (
          <span
            className="absolute right-1 top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[var(--red)] px-1 text-[0.625rem] font-bold leading-none text-white ring-2 ring-[var(--portal-surface)]"
            aria-hidden="true"
          >
            {contador}
          </span>
        )}
      </button>

      <Modal
        open={abierta}
        onClose={cerrar}
        titulo="Notificaciones"
        size="sm"
        footer={footer}
        bodyClassName="p-0 min-h-[70dvh] sm:min-h-0"
      >
        {contenido}
      </Modal>
    </>
  );
};

export default BandejaAvisos;
