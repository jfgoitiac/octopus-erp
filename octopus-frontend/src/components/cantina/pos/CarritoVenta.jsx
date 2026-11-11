import { useState } from 'react';
import {
  Minus, Plus, Trash2, ShoppingCart, Loader2, Banknote, CreditCard as CreditCardIcon,
  Landmark, Smartphone, Receipt, Globe, HandCoins, ChevronDown, ChevronUp, PackageOpen,
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

// Los de uso diario van a la vista; el resto queda tras "Más métodos" para no
// ocupar tres filas del carrito en cada venta.
const METODOS_FRECUENTES = ['efectivo', 'efectivo_ves', 'tarjeta_prepago', 'pago_movil'];

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
  embebido = false, // dentro de un Modal (celular): sin marco ni cabecera propios
  children,
}) {
  const [verTodosMetodos, setVerTodosMetodos] = useState(false);
  // Si el método activo no es de los frecuentes, se muestran todos para que se vea cuál está elegido.
  const mostrarTodos = verTodosMetodos || !METODOS_FRECUENTES.includes(metodoPago);
  const metodosVisibles = mostrarTodos ? METODOS : METODOS.filter(m => METODOS_FRECUENTES.includes(m.value));
  const unidades = items.reduce((total, item) => total + item.cantidad, 0);

  return (
    // Desde `lg` el POS tiene altura fija y la tarjeta scrollea por dentro;
    // debajo de `lg` la página scrollea. En ambos casos el pie con COBRAR es
    // sticky para que el botón de confirmar nunca quede fuera de alcance.
    <div
      className={embebido
        ? 'flex flex-col bg-[var(--surface)] overflow-hidden'
        : 'flex flex-col lg:h-full lg:overflow-y-auto rounded-2xl bg-[var(--surface)] overflow-hidden'}
      style={embebido ? undefined : { border: '0.5px solid var(--border-md)' }}
    >
      {!embebido && (
        <div className="flex items-center gap-3 px-4 py-3.5" style={{ borderBottom: '0.5px solid var(--border-md)' }}>
          <span className="flex h-9 w-9 items-center justify-center rounded-xl" style={{ background: 'var(--pb-light)', color: 'var(--pb)' }}>
            <ShoppingCart size={18} />
          </span>
          <div>
            <h2 className="font-semibold leading-tight" style={{ color: 'var(--jet)' }}>Carrito</h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--ash)' }}>
              {items.length === 0 ? 'Venta nueva' : `${unidades} unidad${unidades !== 1 ? 'es' : ''}`}
            </p>
          </div>
          <span className="ml-auto inline-flex min-w-8 h-8 items-center justify-center rounded-full px-2 text-xs font-semibold tabular-nums" style={{ background: 'var(--porcelain)', color: 'var(--pb-mid)' }} aria-label={`${items.length} líneas en el carrito`}>
            {items.length}
          </span>
        </div>
      )}

      <div className="flex-1 px-3 sm:px-4 py-3 space-y-2 min-h-[132px]" style={{ background: 'var(--surface-sunken)' }}>
        {items.length === 0 ? (
          <div className="min-h-[116px] flex flex-col items-center justify-center text-center px-4 py-6">
            <span className="w-11 h-11 rounded-full flex items-center justify-center mb-3" style={{ background: 'var(--surface)', color: 'var(--ash)', border: '0.5px solid var(--border-md)' }}>
              <PackageOpen size={20} />
            </span>
            <p className="text-sm font-medium" style={{ color: 'var(--jet)' }}>El carrito está vacío</p>
            <p className="text-xs mt-1 max-w-56" style={{ color: 'var(--ash)' }}>Escanea un producto o agrégalo desde el catálogo.</p>
          </div>
        ) : (
          items.map(({ producto, cantidad }) => (
            <article key={producto.id} className="rounded-xl p-3" style={{ border: '0.5px solid var(--border-md)', background: 'var(--surface)' }}>
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold leading-snug break-words" style={{ color: 'var(--jet)' }}>{producto.nombre}</p>
                  <p className="text-xs mt-1 tabular-nums" style={{ color: 'var(--ash)' }}>${Number(producto.precio).toFixed(2)} por unidad</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-base font-bold leading-tight tabular-nums" style={{ color: 'var(--jet)' }}>
                    ${(Number(producto.precio) * cantidad).toFixed(2)}
                  </p>
                  <p className="text-xs mt-1" style={{ color: 'var(--ash)' }}>Subtotal</p>
                </div>
                <button
                  type="button"
                  onClick={() => onQuitar(producto.id)}
                  className="shrink-0 w-11 h-11 -mt-1 -mr-1 flex items-center justify-center rounded-xl transition-colors hover:bg-[var(--red-light)]"
                  style={{ color: 'var(--red)' }}
                  aria-label={`Quitar ${producto.nombre} del carrito`}
                >
                  <Trash2 size={16} />
                </button>
              </div>

              <div className="mt-3 pt-3 flex items-center justify-between gap-3" style={{ borderTop: '0.5px solid var(--border)' }}>
                <span className="text-xs font-medium" style={{ color: 'var(--ash)' }}>Cantidad</span>
                <div className="flex items-center gap-1.5 shrink-0" role="group" aria-label={`Cantidad de ${producto.nombre}`}>
                <button
                  type="button"
                  onClick={() => onCambiarCantidad(producto.id, cantidad - 1)}
                  className="w-11 h-11 rounded-xl flex items-center justify-center transition-colors hover:bg-[var(--porcelain)]"
                  style={{ border: '0.5px solid var(--border-md)', color: 'var(--jet)' }}
                  aria-label={`Quitar una unidad de ${producto.nombre}`}
                >
                  <Minus size={15} />
                </button>
                <output className="min-w-10 text-center text-base font-semibold tabular-nums" aria-live="polite" style={{ color: 'var(--jet)' }}>{cantidad}</output>
                <button
                  type="button"
                  onClick={() => onCambiarCantidad(producto.id, cantidad + 1)}
                  className="w-11 h-11 rounded-xl flex items-center justify-center transition-colors hover:bg-[var(--pb-light)]"
                  style={{ border: '0.5px solid var(--border-md)', color: 'var(--pb-mid)' }}
                  aria-label={`Agregar una unidad de ${producto.nombre}`}
                >
                  <Plus size={15} />
                </button>
                </div>
              </div>
            </article>
          ))
        )}
      </div>

      <div className="px-3 sm:px-4 pt-3 space-y-4" style={{ borderTop: '0.5px solid var(--border-md)' }}>
        {descuento}

        <section className="rounded-xl p-3 space-y-2" style={{ background: 'var(--porcelain)' }} aria-label="Resumen de la venta">
          {descuentoUsd > 0 && (
            <div className="space-y-1 text-sm">
              <div className="flex justify-between" style={{ color: 'var(--ash)' }}>
                <span>Subtotal</span>
                <span className="tabular-nums">${subtotalUsd.toFixed(2)}</span>
              </div>
              <div className="flex justify-between" style={{ color: 'var(--red)' }}>
                <span>Descuento</span>
                <span className="tabular-nums">−${descuentoUsd.toFixed(2)}</span>
              </div>
            </div>
          )}

          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-sm font-semibold" style={{ color: 'var(--jet)' }}>{descuentoUsd > 0 ? 'Total a cobrar' : 'Total'}</p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--ash)' }}>{unidades} unidad{unidades !== 1 ? 'es' : ''}</p>
            </div>
            <div className="text-right">
              <p
                className="font-bold tabular-nums leading-none"
                style={{ fontSize: resaltarMoneda === 'usd' ? '1.5rem' : '1.05rem', color: resaltarMoneda === 'usd' ? 'var(--pb)' : 'var(--jet)' }}
              >
                ${totalUsd.toFixed(2)}
              </p>
              <p
                className="font-medium tabular-nums mt-1"
                style={{ fontSize: resaltarMoneda === 'ves' ? '1.2rem' : '0.85rem', color: resaltarMoneda === 'ves' ? 'var(--pb)' : 'var(--ash)' }}
              >
                Bs. {totalVes.toFixed(2)}
              </p>
            </div>
          </div>
        </section>

        <section aria-labelledby="metodo-pago-titulo">
          <h3 id="metodo-pago-titulo" className="text-sm font-semibold mb-2" style={{ color: 'var(--jet)' }}>Método de pago</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
            {metodosVisibles.map(m => {
              const Icon = m.icon;
              const activo = metodoPago === m.value;
              return (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => onCambiarMetodo(m.value)}
                  aria-pressed={activo}
                  className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-medium min-h-[48px] text-left transition-colors"
                  style={activo
                    ? { border: '1.5px solid var(--pb)', color: 'var(--pb)', background: 'var(--pb-light)' }
                    : { border: '0.5px solid var(--border-md)', color: 'var(--ash)', background: '#fff' }}
                >
                  <Icon size={16} className="shrink-0" />
                  <span className="leading-tight">{m.label}</span>
                </button>
              );
            })}
          </div>
          {METODOS_FRECUENTES.includes(metodoPago) && (
            <button
              type="button"
              onClick={() => setVerTodosMetodos(v => !v)}
              className="mt-1.5 w-full flex items-center justify-center gap-1 text-xs font-medium min-h-[44px]"
              style={{ color: 'var(--pb-mid)' }}
              aria-expanded={verTodosMetodos}
            >
              {verTodosMetodos ? <>Menos métodos <ChevronUp size={14} /></> : <>Más métodos <ChevronDown size={14} /></>}
            </button>
          )}
        </section>

        {children}
      </div>

      <div
        className={`sticky bottom-0 z-10 bg-[var(--surface)] px-3 sm:px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] space-y-2 ${embebido ? '' : 'rounded-b-2xl'}`}
        style={{ borderTop: '0.5px solid var(--border-md)', boxShadow: '0 -8px 24px color-mix(in srgb, var(--jet) 6%, transparent)' }}
      >
        {cobrarDisabled && cobrarDisabledMotivo && (
          <p className="text-xs text-center rounded-lg px-3 py-2" role="status" style={{ color: 'var(--ash)', background: 'var(--porcelain)' }}>{cobrarDisabledMotivo}</p>
        )}

        <button
          type="button"
          onClick={onCobrar}
          disabled={cobrarDisabled || cobrando}
          className="w-full text-white rounded-xl py-3 text-sm font-semibold flex items-center justify-center gap-2 min-h-[50px] transition-colors disabled:cursor-not-allowed"
          style={{ background: cobrarDisabled || cobrando ? 'var(--border-md)' : 'var(--pb)', color: cobrarDisabled || cobrando ? 'var(--ash)' : '#fff' }}
        >
          {cobrando ? <><Loader2 size={16} className="animate-spin" /> Procesando venta…</> : `Cobrar $${totalUsd.toFixed(2)}`}
        </button>
      </div>
    </div>
  );
}
