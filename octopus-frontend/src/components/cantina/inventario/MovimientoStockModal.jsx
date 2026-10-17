import { useState } from 'react';
import { toast } from 'react-toastify';
import { Loader2, SlidersHorizontal, ArrowDownCircle, ArrowUpCircle, Wrench, PackageX } from 'lucide-react';
import { Modal } from '../../ui/Modal';

const FIELD_STYLE = { border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)', fontSize: '16px' };
const LABEL_STYLE = { color: 'var(--ash)' };
const IDLE_STYLE  = { border: '0.5px solid var(--border-md)', color: 'var(--ash)', background: 'var(--porcelain)' };

const TIPOS = [
  { value: 'entrada', label: 'Entrada', icon: ArrowDownCircle, activeStyle: { background: 'var(--pb-light)', color: 'var(--pb-mid)', border: '1.5px solid var(--pb)' } },
  { value: 'salida',  label: 'Salida',  icon: ArrowUpCircle,   activeStyle: { background: 'var(--red-light)', color: 'var(--red)', border: '1.5px solid var(--red)' } },
  { value: 'ajuste',  label: 'Ajuste',  icon: Wrench,          activeStyle: { background: 'var(--yellow-light)', color: 'var(--amber-ink)', border: '1.5px solid var(--yellow)' } },
  // D3: la merma (vencido, dañado, consumo interno) va separada del ajuste.
  { value: 'merma',   label: 'Merma',   icon: PackageX,        activeStyle: { background: 'var(--red-light)', color: 'var(--red)', border: '1.5px solid var(--red)' } },
];

// El backend exige motivo para estos tipos (CONTRATO_AUDITORIA_CANTINA.md §8).
const TIPOS_CON_MOTIVO = ['ajuste', 'merma'];

const AYUDA_MOTIVO = {
  ajuste: 'Ej. Diferencia en conteo físico...',
  merma: 'Ej. Producto vencido, empaque dañado, consumo interno...',
};

export default function MovimientoStockModal({ producto, onClose, onSubmit }) {
  const [tipo, setTipo]           = useState('entrada');
  const [cantidad, setCantidad]   = useState('');
  const [motivo, setMotivo]       = useState('');
  const [guardando, setGuardando] = useState(false);

  const motivoObligatorio = TIPOS_CON_MOTIVO.includes(tipo);

  const validar = () => {
    const cantidadNum = Number(cantidad);
    if (cantidad === '' || Number.isNaN(cantidadNum) || cantidadNum <= 0 || !Number.isInteger(cantidadNum)) {
      toast.warning('La cantidad debe ser un entero mayor a 0.');
      return false;
    }
    if (motivoObligatorio && !motivo.trim()) {
      toast.warning(`El motivo es obligatorio para registrar ${tipo === 'merma' ? 'una merma' : 'un ajuste'}.`);
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
        className="w-full sm:w-auto px-4 rounded-xl py-2.5 text-sm min-h-[44px]"
        style={{ border: '0.5px solid var(--border-md)', color: 'var(--ash)' }}
      >
        Cancelar
      </button>
      <button
        onClick={handleGuardar}
        disabled={guardando}
        className="w-full sm:w-auto px-4 text-white rounded-xl py-2.5 text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2 min-h-[44px]"
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
      <p className="text-sm mb-4 break-words" style={{ color: 'var(--ash)' }}>
        {producto.nombre} — stock actual: <strong style={{ color: 'var(--jet)' }}>{producto.stock_actual}</strong>
      </p>

      <div className="space-y-4">
        <div>
          <span id="movimiento-tipo" className="block text-xs uppercase tracking-widest mb-1.5" style={LABEL_STYLE}>Tipo de movimiento</span>
          <div role="group" aria-labelledby="movimiento-tipo" className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {TIPOS.map(t => {
              const Icon = t.icon;
              return (
                <button
                  key={t.value}
                  type="button"
                  aria-pressed={tipo === t.value}
                  onClick={() => setTipo(t.value)}
                  className="flex flex-col items-center gap-1 py-2.5 rounded-xl text-xs font-medium transition-all min-h-[44px]"
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
          <label htmlFor="movimientostockmodal-cantidad" className="block text-xs uppercase tracking-widest mb-1.5" style={LABEL_STYLE}>Cantidad</label>
          <input id="movimientostockmodal-cantidad"
            type="number"
            min="1"
            step="1"
            className="w-full px-3 py-2 rounded-xl text-sm outline-none focus-visible:outline-2 focus-visible:outline-offset-1 min-h-[44px]"
            style={FIELD_STYLE}
            value={cantidad}
            onChange={e => setCantidad(e.target.value)}
            placeholder="0"
          />
          {(tipo === 'salida' || tipo === 'merma') && (
            <p className="text-xs mt-1" style={{ color: 'var(--ash)' }}>
              Se descontará del stock actual. Si dejaría el stock en negativo, el servidor rechazará el movimiento.
            </p>
          )}
        </div>

        <div>
          <label htmlFor="movimientostockmodal-motivo" className="block text-xs uppercase tracking-widest mb-1.5" style={LABEL_STYLE}>
            {motivoObligatorio ? <>Motivo <span style={{ color: 'var(--red)' }}>*</span></> : 'Motivo (opcional)'}
          </label>
          <textarea id="movimientostockmodal-motivo"
            rows={2}
            maxLength={200}
            aria-required={motivoObligatorio}
            className="w-full px-3 py-2 rounded-xl text-sm outline-none focus-visible:outline-2 focus-visible:outline-offset-1 resize-none"
            style={FIELD_STYLE}
            value={motivo}
            onChange={e => setMotivo(e.target.value)}
            placeholder={AYUDA_MOTIVO[tipo] ?? 'Ej. Compra a proveedor, devolución...'}
          />
        </div>
      </div>
    </Modal>
  );
}
