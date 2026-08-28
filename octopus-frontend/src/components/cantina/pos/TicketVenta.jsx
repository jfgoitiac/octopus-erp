import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { Printer, Loader2, CheckCircle2 } from 'lucide-react';
import { Modal } from '../../ui/Modal';

/**
 * Vista previa en pantalla del ticket recién cobrado (§6 cantina.md,
 * TicketVenta.jsx). El PDF real lo genera el backend (ReciboVentaPDFView) —
 * este componente solo resume la venta y ofrece volver a descargarlo.
 * Campos consumidos: exactamente los que devuelve VentaCantinaSerializer
 * (ver cantina.service.js::registrarVenta para el contrato completo).
 */
export default function TicketVenta({ venta, onCerrar, onDescargarPdf, descargando }) {
  if (!venta) return null;

  const fecha = venta.creado_en ? format(parseISO(venta.creado_en), "d 'de' MMMM yyyy, HH:mm", { locale: es }) : '';

  const footer = (
    <>
      <button
        onClick={onCerrar}
        className="w-full sm:w-auto rounded-xl py-2.5 text-sm min-h-[44px]"
        style={{ border: '0.5px solid var(--border-md)', color: 'var(--ash)' }}
      >
        Nueva venta
      </button>
      <button
        onClick={onDescargarPdf}
        disabled={descargando}
        className="w-full sm:w-auto text-white rounded-xl py-2.5 text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2 min-h-[44px]"
        style={{ background: 'var(--pb)' }}
      >
        {descargando ? <Loader2 size={14} className="animate-spin" /> : <Printer size={14} />}
        Ticket PDF
      </button>
    </>
  );

  return (
    <Modal
      open
      onClose={onCerrar}
      titulo={(
        <>
          <CheckCircle2 size={17} />
          Venta #{venta.id} cobrada
        </>
      )}
      footer={footer}
      size="sm"
    >
      <p className="text-xs mb-4" style={{ color: 'var(--ash)' }}>{fecha}</p>

      <div className="space-y-1.5 mb-4">
        {(venta.detalles || []).map(d => (
          <div key={d.id} className="flex justify-between text-sm">
            <span style={{ color: 'var(--jet)' }}>{d.cantidad}x {d.producto?.nombre}</span>
            <span style={{ color: 'var(--jet)' }}>${Number(d.subtotal).toFixed(2)}</span>
          </div>
        ))}
      </div>

      <div className="rounded-xl px-3 py-3 mb-4 space-y-1" style={{ background: 'var(--pb-light, #e6f7f9)' }}>
        <div className="flex justify-between font-semibold" style={{ color: 'var(--jet)' }}>
          <span>Total</span>
          <span>${Number(venta.total_usd).toFixed(2)}</span>
        </div>
        <div className="flex justify-between text-sm" style={{ color: 'var(--ash)' }}>
          <span>Equivalente</span>
          <span>Bs. {Number(venta.total_ves).toFixed(2)}</span>
        </div>
        <div className="flex justify-between text-xs pt-1" style={{ color: 'var(--ash)', borderTop: '0.5px solid var(--border-md)' }}>
          <span>Método</span>
          <span className="capitalize">{(venta.metodo_pago || '').replace(/_/g, ' ')}</span>
        </div>
        {venta.tarjeta_serial && (
          <div className="flex justify-between text-xs" style={{ color: 'var(--ash)' }}>
            <span>Tarjeta / Alumno</span>
            <span>{venta.tarjeta_serial} — {venta.alumno_nombre || 'N/D'}</span>
          </div>
        )}
        {venta.saldo_tarjeta_despues != null && (
          <div className="flex justify-between text-xs" style={{ color: 'var(--ash)' }}>
            <span>Saldo tarjeta después</span>
            <span>${Number(venta.saldo_tarjeta_despues).toFixed(2)}</span>
          </div>
        )}
      </div>
    </Modal>
  );
}
