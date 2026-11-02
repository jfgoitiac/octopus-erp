import { Receipt } from 'lucide-react';
import { Modal } from '../../components/ui/Modal';
import { fmtFecha } from '../utils/fechas';
import { fmtMonto } from '../utils/montos';

const usd = (valor) => `REF. ${fmtMonto(valor)}`;

const Fila = ({ etiqueta, children, className = 'text-[var(--jet)]' }) => (
  <div className="flex items-start justify-between gap-3 text-sm">
    <dt className="text-[var(--ash)]">{etiqueta}</dt>
    <dd className={`text-right font-medium ${className}`}>{children}</dd>
  </div>
);

/**
 * DetalleConsumoModal — qué se compró en una venta de cantina/librería.
 * Props:
 *   consumo: elemento de GET cantina/consumos/ (o `cargo.consumo` de la cuenta) | null
 *   onClose: () => void
 */
const DetalleConsumoModal = ({ consumo, onClose }) => {
  if (!consumo) return null;

  const anulada = consumo.estado === 'anulada';
  const items = consumo.items || [];
  const hayDescuento = Number(consumo.descuento_usd) > 0;

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      bodyClassName="p-4 sm:p-6"
      titulo={<span className="flex items-center gap-1.5"><Receipt size={16} aria-hidden="true" /> Detalle de la compra</span>}
    >
      <div className="space-y-4">
        <div>
          {consumo.alumno_nombre && (
            <p className="text-sm font-semibold text-[var(--jet)]">{consumo.alumno_nombre}</p>
          )}
          <p className="text-sm text-[var(--ash)]">
            {fmtFecha(consumo.creado_en, "d 'de' MMM yyyy, h:mm a")} · {consumo.area_display}
          </p>
        </div>

        {anulada && (
          <p className="rounded-xl bg-[var(--red-light)] px-3 py-2 text-sm font-medium text-[var(--red)]">
            Esta compra fue anulada: no se te cobra.
          </p>
        )}

        <ul className="divide-y divide-[var(--border)] rounded-xl border border-[var(--border)] bg-[var(--surface)]">
          {items.map((item) => (
            <li key={item.id} className="flex items-start justify-between gap-3 px-3 py-2.5">
              <div className="min-w-0">
                <p className="break-words text-sm font-medium text-[var(--jet)]">{item.producto_nombre}</p>
                <p className="text-xs text-[var(--ash)]">{item.cantidad} × {usd(item.precio_unitario)}</p>
              </div>
              <p className="flex-shrink-0 text-sm font-semibold text-[var(--jet)]">{usd(item.subtotal)}</p>
            </li>
          ))}
          {items.length === 0 && (
            <li className="px-3 py-2.5 text-sm text-[var(--ash)]">Sin productos registrados.</li>
          )}
        </ul>

        <dl className="space-y-1.5">
          {hayDescuento && (
            <>
              <Fila etiqueta="Subtotal">{usd(consumo.subtotal_usd)}</Fila>
              <Fila etiqueta="Descuento" className="text-[var(--green)]">- {usd(consumo.descuento_usd)}</Fila>
            </>
          )}
          <Fila etiqueta="Total" className={`font-bold ${anulada ? 'text-[var(--ash)] line-through' : 'text-[var(--jet)]'}`}>
            {usd(consumo.total_usd)}
          </Fila>
          <Fila etiqueta="Forma de pago">{consumo.metodo_pago_display}</Fila>
          {consumo.saldo_tarjeta_despues != null && !anulada && (
            <Fila etiqueta="Saldo de la tarjeta después">{usd(consumo.saldo_tarjeta_despues)}</Fila>
          )}
          {consumo.saldo_pendiente_usd != null && (
            <Fila etiqueta="Pendiente por pagar" className="font-semibold text-[var(--red)]">
              {usd(consumo.saldo_pendiente_usd)}
            </Fila>
          )}
        </dl>
      </div>
    </Modal>
  );
};

export default DetalleConsumoModal;
