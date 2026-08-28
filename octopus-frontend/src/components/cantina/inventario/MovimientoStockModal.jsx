import { useState } from 'react';
import { toast } from 'react-toastify';
import { Loader2, SlidersHorizontal, ArrowDownCircle, ArrowUpCircle, Wrench } from 'lucide-react';
import { Modal } from '../../ui/Modal';

const FIELD_STYLE = { border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)', fontSize: '16px' };
const LABEL_STYLE = { color: 'var(--ash)' };
const IDLE_STYLE  = { border: '0.5px solid var(--border-md)', color: 'var(--ash)', background: 'var(--porcelain)' };

const TIPOS = [
  { value: 'entrada', label: 'Entrada', icon: ArrowDownCircle, activeStyle: { background: 'var(--pb-light)', color: 'var(--pb-mid)', border: '1.5px solid var(--pb)' } },
  { value: 'salida',  label: 'Salida',  icon: ArrowUpCircle,   activeStyle: { background: 'var(--red-light)', color: 'var(--red)', border: '1.5px solid var(--red)' } },
  { value: 'ajuste',  label: 'Ajuste',  icon: Wrench,          activeStyle: { background: '#fef3c7', color: '#b45309', border: '1.5px solid #f59e0b' } },
];

export default function MovimientoStockModal({ producto, onClose, onSubmit }) {
  const [tipo, setTipo]           = useState('entrada');
  const [cantidad, setCantidad]   = useState('');
  const [motivo, setMotivo]       = useState('');
  const [guardando, setGuardando] = useState(false);

  const validar = () => {
    const cantidadNum = Number(cantidad);
    if (cantidad === '' || Number.isNaN(cantidadNum) || cantidadNum <= 0 || !Number.isInteger(cantidadNum)) {
      toast.warning('La cantidad debe ser un entero mayor a 0.');
      return false;
    }
    return true;
  };

  const handleGuardar = async () => {
    if (!validar()) return;

    setGuardando(true);
    const ok = await onSubmit({
      producto: producto.id,
      tipo,
      cantidad: Number(cantidad),
      motivo: motivo.trim(),
    });
    setGuardando(false);
    if (ok) onClose();
  };

  const footer = (
    <>
      <button
        onClick={onClose}
        className="w-full sm:w-auto rounded-xl py-2.5 text-sm min-h-[44px]"
        style={{ border: '0.5px solid var(--border-md)', color: 'var(--ash)' }}
      >
        Cancelar
      </button>
      <button
        onClick={handleGuardar}
        disabled={guardando}
        className="w-full sm:w-auto text-white rounded-xl py-2.5 text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2 min-h-[44px]"
        style={{ background: 'var(--pb)' }}
      >
        {guardando ? <><Loader2 size={14} className="animate-spin" /> Guardando...</> : 'Registrar movimiento'}
      </button>
    </>
  );

  return (
    <Modal
      open
      onClose={onClose}
      titulo={(
        <>
          <SlidersHorizontal size={17} />
          Ajustar stock
        </>
      )}
      footer={footer}
      size="sm"
    >
      <p className="text-sm mb-4" style={{ color: 'var(--ash)' }}>
        {producto.nombre} — stock actual: <strong style={{ color: 'var(--jet)' }}>{producto.stock_actual}</strong>
      </p>

      <div className="space-y-4">
        <div>
          <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={LABEL_STYLE}>Tipo de movimiento</label>
          <div className="flex gap-2">
            {TIPOS.map(t => {
              const Icon = t.icon;
              return (
                <button
                  key={t.value}
                  type="button"
                  aria-pressed={tipo === t.value}
                  onClick={() => setTipo(t.value)}
                  className="flex-1 flex flex-col items-center gap-1 py-2.5 rounded-lg text-xs font-medium transition-all min-h-[44px]"
                  style={tipo === t.value ? t.activeStyle : IDLE_STYLE}
                >
                  <Icon size={16} />
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={LABEL_STYLE}>Cantidad</label>
          <input
            type="number"
            min="1"
            step="1"
            className="w-full px-3 py-2 rounded-lg text-sm outline-none min-h-[44px]"
            style={FIELD_STYLE}
            value={cantidad}
            onChange={e => setCantidad(e.target.value)}
            placeholder="0"
          />
          {tipo === 'salida' && (
            <p className="text-xs mt-1" style={{ color: 'var(--ash)' }}>
              Se descontará del stock actual. Si dejaría el stock en negativo, el servidor rechazará el movimiento.
            </p>
          )}
        </div>

        <div>
          <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={LABEL_STYLE}>Motivo (opcional)</label>
          <textarea
            rows={2}
            className="w-full px-3 py-2 rounded-lg text-sm outline-none resize-none"
            style={FIELD_STYLE}
            value={motivo}
            onChange={e => setMotivo(e.target.value)}
            placeholder="Ej. Compra a proveedor, merma, conteo físico..."
          />
        </div>
      </div>
    </Modal>
  );
}
