import {
  Minus, Plus, Trash2, ShoppingCart, Loader2, Banknote, CreditCard as CreditCardIcon,
  Landmark, Smartphone, Receipt, Globe, HandCoins,
} from 'lucide-react';

// Métodos de la VENTA (una venta = un método): tarjeta prepago, los 6 de
// cobranza (cobranza.Pago.METODOS) y "Cargar a cuenta" (CxC del representante).
const METODOS = [
  { value: 'efectivo', label: 'Efectivo USD', icon: Banknote },
  { value: 'efectivo_ves', label: 'Efectivo Bs.', icon: Banknote },
  { value: 'tarjeta_prepago', label: 'Tarjeta prepago', icon: CreditCardIcon },
  { value: 'transferencia', label: 'Transferencia', icon: Landmark },
  { value: 'pago_movil', label: 'Pago móvil', icon: Smartphone },
  { value: 'punto_de_venta', label: 'Punto de venta', icon: Receipt },
  { value: 'zelle', label: 'Zelle', icon: Globe },
  { value: 'credito_representante', label: 'Cargar a cuenta', icon: HandCoins },
];

const METODOS_PRINCIPALES = ['efectivo', 'efectivo_ves', 'tarjeta_prepago'];

function BotonMetodo({ metodo, activo, compacto = false, onClick }) {
  const Icon = metodo.icon;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activo}
      className={compacto
        ? 'flex items-center gap-1.5 px-3 rounded-xl text-xs font-medium min-h-[44px]'
        : 'flex flex-col items-center justify-center gap-1 py-2 rounded-xl text-xs font-medium min-h-[52px]'}
      style={activo
        ? { border: '1.5px solid var(--pb)', color: 'var(--pb)', background: 'var(--pb-light)' }
        : { border: '0.5px solid var(--border-md)', color: 'var(--ash)', background: '#fff' }}
    >
      <Icon size={16} />
      {metodo.label}
    </button>
  );
}

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
  subtotalUsd = 0,
  descuentoUsd = 0,
  descuento, // bloque <DescuentoVenta> (lo arma CantinaPOS)
  totalUsd, // neto: subtotal − descuento
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
    // Desde `lg` el POS tiene altura fija y la tarjeta scrollea por dentro;
    // debajo de `lg` la página scrollea. En ambos casos el pie con COBRAR es
    // sticky para que el botón de confirmar nunca quede fuera de alcance.
    <div className="flex flex-col lg:h-full lg:overflow-y-auto rounded-2xl bg-[var(--surface)]" style={{ border: '0.5px solid var(--border-md)' }}>
      <div className="flex items-center gap-2 px-4 py-3" style={{ borderBottom: '0.5px solid var(--border-md)' }}>
        <ShoppingCart size={18} style={{ color: 'var(--pb)' }} />
        <h2 className="font-semibold" style={{ color: 'var(--jet)' }}>Carrito</h2>
        <span className="ml-auto text-xs" style={{ color: 'var(--ash)' }}>
          {items.length} línea{items.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div className="flex-1 shrink-0 px-4 py-3 space-y-2 min-h-[120px]">
        {items.length === 0 ? (
          <p className="text-sm text-center py-8" style={{ color: 'var(--ash)' }}>
            Escanea o busca un producto para empezar la venta.
          </p>
        ) : (
          items.map(({ producto, cantidad }) => (
            <div key={producto.id} className="flex flex-wrap sm:flex-nowrap lg:flex-wrap items-center gap-x-2 gap-y-1 rounded-lg px-2 py-2" style={{ border: '0.5px solid var(--border-md)' }}>
              <div className="basis-full sm:basis-0 lg:basis-full sm:min-w-[4.5rem] flex-1 min-w-0">
                <p className="text-sm font-medium truncate" style={{ color: 'var(--jet)' }}>{producto.nombre}</p>
                <p className="text-xs whitespace-nowrap" style={{ color: 'var(--ash)' }}>${Number(producto.precio).toFixed(2)} c/u</p>
              </div>
              <div className="flex items-center gap-1 shrink-0 mr-auto sm:mr-0 lg:mr-auto">
                <button
                  type="button"
                  onClick={() => onCambiarCantidad(producto.id, cantidad - 1)}
                  className="w-11 h-11 rounded-lg flex items-center justify-center"
                  style={{ border: '0.5px solid var(--border-md)', color: 'var(--ash)' }}
                  aria-label={`Quitar una unidad de ${producto.nombre}`}
                >
                  <Minus size={15} />
                </button>
                <span className="w-5 text-center text-sm font-medium" style={{ color: 'var(--jet)' }}>{cantidad}</span>
                <button
                  type="button"
                  onClick={() => onCambiarCantidad(producto.id, cantidad + 1)}
                  className="w-11 h-11 rounded-lg flex items-center justify-center"
                  style={{ border: '0.5px solid var(--border-md)', color: 'var(--ash)' }}
                  aria-label={`Agregar una unidad de ${producto.nombre}`}
                >
                  <Plus size={15} />
                </button>
              </div>
              <p className="w-14 text-right text-sm font-semibold shrink-0" style={{ color: 'var(--jet)' }}>
                ${(Number(producto.precio) * cantidad).toFixed(2)}
              </p>
              <button
                type="button"
                onClick={() => onQuitar(producto.id)}
                className="shrink-0 w-11 h-11 flex items-center justify-center rounded-lg"
                style={{ color: 'var(--red)' }}
                aria-label={`Quitar ${producto.nombre} del carrito`}
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))
        )}
      </div>

      <div className="px-4 pt-3 space-y-3" style={{ borderTop: '0.5px solid var(--border-md)' }}>
        {descuento}

        {descuentoUsd > 0 && (
          <div className="space-y-0.5 text-sm">
            <div className="flex justify-between" style={{ color: 'var(--ash)' }}>
              <span>Subtotal</span>
              <span>${subtotalUsd.toFixed(2)}</span>
            </div>
            <div className="flex justify-between" style={{ color: 'var(--red)' }}>
              <span>Descuento</span>
              <span>−${descuentoUsd.toFixed(2)}</span>
            </div>
          </div>
        )}

        <div className="flex items-baseline justify-between">
          <span className="text-sm font-medium" style={{ color: 'var(--ash)' }}>{descuentoUsd > 0 ? 'Total neto' : 'Total'}</span>
          <div className="text-right">
            <p
              className="font-bold"
              style={{ fontSize: resaltarMoneda === 'usd' ? '1.35rem' : '1.05rem', color: resaltarMoneda === 'usd' ? 'var(--pb)' : 'var(--jet)' }}
            >
              ${totalUsd.toFixed(2)}
            </p>
            <p
              className="font-medium"
              style={{ fontSize: resaltarMoneda === 'ves' ? '1.2rem' : '0.85rem', color: resaltarMoneda === 'ves' ? 'var(--pb)' : 'var(--ash)' }}
            >
              Bs. {totalVes.toFixed(2)}
            </p>
          </div>
        </div>

        <div>
          <p className="text-xs uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>Método de pago</p>
          {/* Los 3 métodos del día a día van grandes; el resto, como chips
              compactos debajo (ahorra alto en la columna del carrito). */}
          <div className="grid grid-cols-3 gap-1.5">
            {METODOS.filter(m => METODOS_PRINCIPALES.includes(m.value)).map(m => (
              <BotonMetodo key={m.value} metodo={m} activo={metodoPago === m.value} onClick={() => onCambiarMetodo(m.value)} />
            ))}
          </div>
          <p className="text-xs uppercase tracking-widest mt-2 mb-1.5" style={{ color: 'var(--ash)' }}>Otros métodos</p>
          <div className="flex flex-wrap gap-1.5">
            {METODOS.filter(m => !METODOS_PRINCIPALES.includes(m.value)).map(m => (
              <BotonMetodo key={m.value} metodo={m} activo={metodoPago === m.value} compacto onClick={() => onCambiarMetodo(m.value)} />
            ))}
          </div>
        </div>

        {children}
      </div>

      <div
        className="sticky bottom-0 z-10 bg-[var(--surface)] rounded-b-2xl px-4 py-3 space-y-2"
        style={{ borderTop: '0.5px solid var(--border-md)' }}
      >
        {/* Debajo de `lg` la página scrollea y esta barra tapa el total del
            carrito: se repite aquí para ver cuánto se cobra sin scrollear. */}
        <div className="flex items-baseline justify-between gap-2 lg:hidden">
          <span className="text-sm font-medium" style={{ color: 'var(--ash)' }}>{descuentoUsd > 0 ? 'Total neto' : 'Total'}</span>
          <span className="text-right">
            <span className="font-bold text-lg" style={{ color: 'var(--pb)' }}>${totalUsd.toFixed(2)}</span>
            <span className="ml-2 text-xs font-medium" style={{ color: 'var(--ash)' }}>Bs. {totalVes.toFixed(2)}</span>
          </span>
        </div>

        {cobrarDisabled && cobrarDisabledMotivo && (
          <p className="text-xs text-center" style={{ color: 'var(--ash)' }}>{cobrarDisabledMotivo}</p>
        )}

        <button
          type="button"
          onClick={onCobrar}
          disabled={cobrarDisabled || cobrando}
          className="w-full text-white rounded-xl py-3 text-sm font-semibold disabled:opacity-40 flex items-center justify-center gap-2 min-h-[48px]"
          style={{ background: 'var(--pb)' }}
        >
          {cobrando ? <><Loader2 size={16} className="animate-spin" /> Cobrando...</> : 'COBRAR'}
        </button>
      </div>
    </div>
  );
}
