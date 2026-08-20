import { Minus, Plus, Trash2, ShoppingCart, Loader2, Banknote, CreditCard as CreditCardIcon } from 'lucide-react';

const METODOS = [
  { value: 'efectivo', label: 'Efectivo USD', icon: Banknote },
  { value: 'efectivo_ves', label: 'Efectivo Bs.', icon: Banknote },
  { value: 'tarjeta_prepago', label: 'Tarjeta prepago', icon: CreditCardIcon },
];

/**
 * Carrito de venta del POS (§7.2 cantina.md): líneas editables, total en
 * USD + equivalente en VES (siempre visible), selector de método de pago y
 * botón "Cobrar". El bloque de identificación de tarjeta (cuando aplica) se
 * inyecta vía `children`, entre el selector de método y el botón de cobro
 * — CarritoVenta no conoce la lógica de tarjeta, solo el layout.
 */
export default function CarritoVenta({
  items,
  onCambiarCantidad,
  onQuitar,
  totalUsd,
  totalVes,
  resaltarMoneda, // 'usd' | 'ves'
  metodoPago,
  onCambiarMetodo,
  onCobrar,
  cobrando,
  cobrarDisabled,
  cobrarDisabledMotivo,
  children,
}) {
  return (
    <div className="flex flex-col h-full rounded-2xl bg-white" style={{ border: '0.5px solid var(--border-md)' }}>
      <div className="flex items-center gap-2 px-4 py-3" style={{ borderBottom: '0.5px solid var(--border-md)' }}>
        <ShoppingCart size={18} style={{ color: 'var(--pb, #0fa3b1)' }} />
        <h2 className="font-semibold" style={{ color: 'var(--jet)' }}>Carrito</h2>
        <span className="ml-auto text-xs" style={{ color: 'var(--ash)' }}>
          {items.length} línea{items.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2 min-h-[120px]">
        {items.length === 0 ? (
          <p className="text-sm text-center py-8" style={{ color: 'var(--ash)' }}>
            Escanea o busca un producto para empezar la venta.
          </p>
        ) : (
          items.map(({ producto, cantidad }) => (
            <div key={producto.id} className="flex items-center gap-2 rounded-lg px-2 py-2" style={{ border: '0.5px solid var(--border-md)' }}>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate" style={{ color: 'var(--jet)' }}>{producto.nombre}</p>
                <p className="text-xs" style={{ color: 'var(--ash)' }}>${Number(producto.precio).toFixed(2)} c/u</p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => onCambiarCantidad(producto.id, cantidad - 1)}
                  className="w-7 h-7 rounded-lg flex items-center justify-center"
                  style={{ border: '0.5px solid var(--border-md)', color: 'var(--ash)' }}
                  aria-label={`Quitar una unidad de ${producto.nombre}`}
                >
                  <Minus size={13} />
                </button>
                <span className="w-6 text-center text-sm font-medium" style={{ color: 'var(--jet)' }}>{cantidad}</span>
                <button
                  type="button"
                  onClick={() => onCambiarCantidad(producto.id, cantidad + 1)}
                  className="w-7 h-7 rounded-lg flex items-center justify-center"
                  style={{ border: '0.5px solid var(--border-md)', color: 'var(--ash)' }}
                  aria-label={`Agregar una unidad de ${producto.nombre}`}
                >
                  <Plus size={13} />
                </button>
              </div>
              <p className="w-16 text-right text-sm font-semibold shrink-0" style={{ color: 'var(--jet)' }}>
                ${(Number(producto.precio) * cantidad).toFixed(2)}
              </p>
              <button
                type="button"
                onClick={() => onQuitar(producto.id)}
                className="shrink-0 p-1.5 rounded-lg"
                style={{ color: 'var(--red, #dc2626)' }}
                aria-label={`Quitar ${producto.nombre} del carrito`}
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))
        )}
      </div>

      <div className="px-4 py-3 space-y-3" style={{ borderTop: '0.5px solid var(--border-md)' }}>
        <div className="flex items-baseline justify-between">
          <span className="text-sm font-medium" style={{ color: 'var(--ash)' }}>Total</span>
          <div className="text-right">
            <p
              className="font-bold"
              style={{ fontSize: resaltarMoneda === 'usd' ? '1.35rem' : '1.05rem', color: resaltarMoneda === 'usd' ? 'var(--pb, #0fa3b1)' : 'var(--jet)' }}
            >
              ${totalUsd.toFixed(2)}
            </p>
            <p
              className="font-medium"
              style={{ fontSize: resaltarMoneda === 'ves' ? '1.2rem' : '0.85rem', color: resaltarMoneda === 'ves' ? 'var(--pb, #0fa3b1)' : 'var(--ash)' }}
            >
              Bs. {totalVes.toFixed(2)}
            </p>
          </div>
        </div>

        <div>
          <p className="text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>Método de pago</p>
          <div className="grid grid-cols-3 gap-1.5">
            {METODOS.map(m => {
              const Icon = m.icon;
              const activo = metodoPago === m.value;
              return (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => onCambiarMetodo(m.value)}
                  className="flex flex-col items-center gap-1 py-2 rounded-xl text-xs font-medium min-h-[52px]"
                  style={activo
                    ? { border: '1.5px solid var(--pb)', color: 'var(--pb)', background: 'var(--pb-light, #e6f7f9)' }
                    : { border: '0.5px solid var(--border-md)', color: 'var(--ash)', background: '#fff' }}
                >
                  <Icon size={16} />
                  {m.label}
                </button>
              );
            })}
          </div>
        </div>

        {children}

        {cobrarDisabled && cobrarDisabledMotivo && (
          <p className="text-xs text-center" style={{ color: 'var(--ash)' }}>{cobrarDisabledMotivo}</p>
        )}

        <button
          type="button"
          onClick={onCobrar}
          disabled={cobrarDisabled || cobrando}
          className="w-full text-white rounded-xl py-3 text-sm font-semibold disabled:opacity-40 flex items-center justify-center gap-2 min-h-[48px]"
          style={{ background: 'var(--pb, #0fa3b1)' }}
        >
          {cobrando ? <><Loader2 size={16} className="animate-spin" /> Cobrando...</> : 'COBRAR'}
        </button>
      </div>
    </div>
  );
}
