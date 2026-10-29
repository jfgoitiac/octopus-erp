import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Eye, FileCheck2 } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Bone } from '../shared/Skeleton';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import VisorComprobante from './VisorComprobante';
import { formatearFechaHora } from './comprobantesUtils';
import { RUTA_CONCILIADOR, RUTA_REVISION } from './cajaComprobante';

/**
 * Marco de la caja cuando procesa un comprobante del portal: aviso arriba y
 * visor del archivo al lado (lg+) o en un Modal (móvil y tablet). En móvil el
 * visor no ocupa espacio en la página, así que nunca tapa los botones de
 * confirmar del resumen.
 */
export default function CajaComprobanteLayout({ comprobanteId, comprobante, error, volverConciliacion, children }) {
  const esLg = useMediaQuery('(min-width: 1024px)');
  const [visorAbierto, setVisorAbierto] = useState(false);
  const cargando = !comprobante && !error;

  const visor = comprobante ? (
    <VisorComprobante key={comprobante.archivo_url || 'sin-archivo'} archivoUrl={comprobante.archivo_url} archivoTipo={comprobante.archivo_tipo} />
  ) : (
    <Bone className="h-[55dvh] min-h-[320px] w-full rounded-2xl lg:h-[calc(100dvh-11rem)]" />
  );

  return (
    <div className="space-y-4">
      <div
        role="status"
        className="flex flex-col gap-3 rounded-2xl p-3 sm:flex-row sm:items-center sm:p-4"
        style={{ background: 'var(--pb-light)', border: '0.5px solid var(--pb)' }}
      >
        <span className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-xl sm:inline-flex" style={{ background: '#fff', color: 'var(--pb)' }}>
          <FileCheck2 size={18} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold" style={{ color: 'var(--pb)' }}>
            Estás procesando el comprobante #{comprobanteId} del portal
          </p>
          <p className="text-xs" style={{ color: 'var(--jet-mid)' }}>
            {error
              ? 'No se pudo cargar el detalle del comprobante; aún puedes registrar el pago.'
              : cargando
                ? 'Cargando el comprobante…'
                : `${comprobante.representante || 'Representante'} · ${comprobante.alumno || 'Alumno'} · ${comprobante.mensualidad || 'Mensualidad'} · enviado ${formatearFechaHora(comprobante.fecha_subida)}`}
          </p>
          <p className="text-xs" style={{ color: 'var(--ash)' }}>
            Al registrar el pago el comprobante queda aprobado y se usa su archivo como respaldo.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          {!esLg && (
            <button
              type="button"
              onClick={() => setVisorAbierto(true)}
              disabled={!comprobante}
              className="inline-flex w-full min-h-[44px] items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold text-white disabled:opacity-60 sm:w-auto"
              style={{ background: 'var(--pb)' }}
            >
              <Eye size={16} aria-hidden="true" /> Ver comprobante
            </button>
          )}
          <Link
            to={volverConciliacion ? RUTA_CONCILIADOR : `${RUTA_REVISION}/${comprobanteId}`}
            className="inline-flex w-full min-h-[44px] items-center justify-center gap-2 rounded-xl px-4 text-sm font-medium sm:w-auto"
            style={{ border: '0.5px solid var(--border-md)', color: 'var(--jet)', background: 'var(--surface)' }}
          >
            <ArrowLeft size={16} aria-hidden="true" /> {volverConciliacion ? 'Volver al conciliador' : 'Volver a la revisión'}
          </Link>
        </div>
      </div>

      {esLg ? (
        <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-5">
          <div className="min-w-0 lg:col-span-3">{children}</div>
          <aside className="min-w-0 lg:sticky lg:top-4 lg:col-span-2" aria-label={`Comprobante #${comprobanteId}`}>
            {visor}
          </aside>
        </div>
      ) : (
        <div className="min-w-0">{children}</div>
      )}

      {!esLg && visorAbierto && (
        <Modal
          open
          onClose={() => setVisorAbierto(false)}
          titulo={`Comprobante #${comprobanteId}`}
          size="xl"
          bodyClassName="p-3 sm:p-4"
        >
          {visor}
        </Modal>
      )}
    </div>
  );
}
