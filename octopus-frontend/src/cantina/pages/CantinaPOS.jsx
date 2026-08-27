import { useState, useEffect, useCallback, useRef, useContext } from 'react';
import { toast } from 'react-toastify';
import { ShoppingCart, Package } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  getProductos, getTasaVigenteCantina, registrarVenta, descargarReciboVenta,
  getAperturaCajaActual,
} from '../../api/cantina.service';
import { AuthContext } from '../../context/AuthContext';
import CarritoVenta from '../../components/cantina/pos/CarritoVenta';
import ScannerProducto from '../../components/cantina/pos/ScannerProducto';
import ScannerTarjeta from '../../components/cantina/pos/ScannerTarjeta';
import BuscadorProductoManual from '../../components/cantina/pos/BuscadorProductoManual';
import BuscadorAlumnoManual from '../../components/cantina/pos/BuscadorAlumnoManual';
import ResumenCobro from '../../components/cantina/pos/ResumenCobro';
import TicketVenta from '../../components/cantina/pos/TicketVenta';
import AperturaCajaModal from '../../components/cantina/pos/AperturaCajaModal';

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3" aria-busy="true" aria-label="Cargando productos">
      {Array.from({ length: 9 }).map((_, i) => (
        <div key={i} className="h-20 rounded-xl animate-pulse" style={{ background: 'var(--border-md)' }} />
      ))}
    </div>
  );
}

// Extrae un nombre de archivo del header Content-Disposition si el backend
// lo manda — mismo helper que usa GenerarLoteModal para descargas de blob.
function nombreArchivoDesdeHeader(headers, fallback) {
  const disposition = headers?.['content-disposition'];
  if (!disposition) return fallback;
  const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition);
  return match?.[1] ? decodeURIComponent(match[1]) : fallback;
}

async function mensajeErrorBlob(err, fallback) {
  if (err.response?.data instanceof Blob) {
    try {
      const texto = await err.response.data.text();
      const data = JSON.parse(texto);
      return data?.error || data?.detail || fallback;
    } catch {
      return fallback;
    }
  }
  return err.response?.data?.error || err.response?.data?.detail || fallback;
}

export default function CantinaPOS() {
  const { user } = useContext(AuthContext);

  const [productos, setProductos] = useState([]);
  const [loadingProductos, setLoadingProductos] = useState(true);
  const [tasaVigente, setTasaVigente] = useState(0);

  // Apertura de caja del cajero (§ apertura por cajero, no global): hasta 3
  // cajeros pueden tener caja abierta a la vez, cada uno con su propia
  // sesión — antes de la primera venta del turno se exige declarar el
  // monto inicial. `null` = todavía no se sabe (cargando), `false` = sin
  // apertura (se muestra el modal bloqueante), objeto = apertura activa.
  const [apertura, setApertura] = useState(null);
  const [cargandoApertura, setCargandoApertura] = useState(true);

  const [carrito, setCarrito] = useState([]); // [{ producto, cantidad }]
  const [metodoPago, setMetodoPago] = useState('efectivo');

  const [tarjeta, setTarjeta] = useState(null);
  const [identidadConfirmada, setIdentidadConfirmada] = useState(false);
  const [confirmarSaldoNegativo, setConfirmarSaldoNegativo] = useState(false);

  const [cobrando, setCobrando] = useState(false);
  const [ventaActual, setVentaActual] = useState(null);
  const [descargandoRecibo, setDescargandoRecibo] = useState(false);

  const abortRef = useRef(null);

  useEffect(() => {
    const controller = new AbortController();
    getAperturaCajaActual(controller.signal)
      .then(res => setApertura(res.data?.apertura ?? false))
      .catch(err => {
        if (err.name === 'CanceledError' || err.code === 'ERR_CANCELED') return;
        toast.error('No se pudo verificar tu apertura de caja.');
        setApertura(false);
      })
      .finally(() => setCargandoApertura(false));
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        const res = await getProductos({ activo: true }, controller.signal);
        setProductos(res.data?.results ?? res.data ?? []);
      } catch (err) {
        if (err.name === 'CanceledError' || err.code === 'ERR_CANCELED') return;
        toast.error('Error al cargar los productos del POS.');
      } finally {
        setLoadingProductos(false);
      }
    })();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    getTasaVigenteCantina(controller.signal)
      .then(res => setTasaVigente(Number(res.data?.valor_bs) || 0))
      .catch(err => {
        if (err.name === 'CanceledError' || err.code === 'ERR_CANCELED') return;
        // Sin tasa, el equivalente en VES queda en 0 — no bloquea el cobro en
        // efectivo USD ni tarjeta; el backend igual congela su propia tasa.
      });
    return () => controller.abort();
  }, []);

  /* ── Carrito ── */

  const agregarProducto = useCallback((producto) => {
    setCarrito(prev => {
      const existente = prev.find(l => l.producto.id === producto.id);
      const cantidadDeseada = (existente?.cantidad ?? 0) + 1;
      if (producto.stock_actual != null && cantidadDeseada > producto.stock_actual) {
        toast.warning(`Stock insuficiente de "${producto.nombre}" (disponible: ${producto.stock_actual}).`);
        return prev;
      }
      if (existente) {
        return prev.map(l => l.producto.id === producto.id ? { ...l, cantidad: cantidadDeseada } : l);
      }
      return [...prev, { producto, cantidad: 1 }];
    });
  }, []);

  const cambiarCantidad = useCallback((productoId, nuevaCantidad) => {
    setCarrito(prev => {
      if (nuevaCantidad <= 0) return prev.filter(l => l.producto.id !== productoId);
      return prev.map(l => {
        if (l.producto.id !== productoId) return l;
        const tope = l.producto.stock_actual;
        if (tope != null && nuevaCantidad > tope) {
          toast.warning(`Stock insuficiente de "${l.producto.nombre}" (disponible: ${tope}).`);
          return l;
        }
        return { ...l, cantidad: nuevaCantidad };
      });
    });
  }, []);

  const quitarProducto = useCallback((productoId) => {
    setCarrito(prev => prev.filter(l => l.producto.id !== productoId));
  }, []);

  const limpiarVenta = useCallback(() => {
    setCarrito([]);
    setMetodoPago('efectivo');
    setTarjeta(null);
    setIdentidadConfirmada(false);
    setConfirmarSaldoNegativo(false);
  }, []);

  const cambiarMetodo = (m) => {
    setMetodoPago(m);
    if (m !== 'tarjeta_prepago') {
      setTarjeta(null);
      setIdentidadConfirmada(false);
      setConfirmarSaldoNegativo(false);
    }
  };

  const resolverTarjeta = (data) => {
    setTarjeta(data);
    setIdentidadConfirmada(false);
    setConfirmarSaldoNegativo(false);
  };

  const cambiarTarjeta = () => {
    setTarjeta(null);
    setIdentidadConfirmada(false);
    setConfirmarSaldoNegativo(false);
  };

  /* ── Totales (estimado en pantalla — la tasa que cuenta es la que
     congela el backend en la respuesta de la venta, ver §7.2 cantina.md) ── */
  const totalUsd = carrito.reduce((acc, l) => acc + Number(l.producto.precio) * l.cantidad, 0);
  const totalVes = totalUsd * tasaVigente;
  const resaltarMoneda = metodoPago === 'efectivo_ves' ? 'ves' : 'usd';

  /* ── Reglas de habilitación de "Cobrar" (§7.2 cantina.md) ── */
  let cobrarDisabled = false;
  let cobrarDisabledMotivo = '';
  if (carrito.length === 0) {
    cobrarDisabled = true;
    cobrarDisabledMotivo = 'Agrega al menos un producto al carrito.';
  } else if (metodoPago === 'tarjeta_prepago') {
    if (!tarjeta) {
      cobrarDisabled = true;
      cobrarDisabledMotivo = 'Escanea o busca la tarjeta del alumno.';
    } else {
      const saldoActual = Number(tarjeta.saldo ?? 0);
      const limiteCredito = Number(tarjeta.limite_credito ?? 0);
      const saldoDespues = saldoActual - totalUsd;
      const excedeLimite = saldoDespues < -limiteCredito;
      const quedaNegativo = saldoDespues < 0 && !excedeLimite;
      if (excedeLimite) {
        cobrarDisabled = true;
        cobrarDisabledMotivo = 'Saldo insuficiente para esta venta con tarjeta.';
      } else if (!identidadConfirmada) {
        cobrarDisabled = true;
        cobrarDisabledMotivo = 'Confirma la identidad del alumno antes de cobrar.';
      } else if (quedaNegativo && !confirmarSaldoNegativo) {
        cobrarDisabled = true;
        cobrarDisabledMotivo = 'Confirma que el saldo quedará en negativo.';
      }
    }
  }

  /* ── Cobrar ── */

  const handleCobrar = async () => {
    if (cobrarDisabled || cobrando) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const payload = {
      items: carrito.map(l => ({ producto_id: l.producto.id, cantidad: l.cantidad })),
      metodo_pago: metodoPago,
    };
    if (metodoPago === 'tarjeta_prepago') payload.tarjeta_codigo = tarjeta.codigo;

    setCobrando(true);
    try {
      const res = await registrarVenta(payload, controller.signal);
      toast.success(`Venta #${res.data.id} cobrada correctamente.`);
      setVentaActual(res.data);
      limpiarVenta();
      // Descarga/apertura automática del ticket al cobrar (§7.2 checklist).
      handleDescargarRecibo(res.data.id);
    } catch (err) {
      if (err.name === 'CanceledError' || err.code === 'ERR_CANCELED') return;
      const msg = err.response?.data?.error || err.response?.data?.detail || 'No se pudo registrar la venta.';
      toast.error(msg);
    } finally {
      setCobrando(false);
    }
  };

  const handleDescargarRecibo = async (ventaId) => {
    setDescargandoRecibo(true);
    try {
      const res = await descargarReciboVenta(ventaId);
      const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      const nombre = nombreArchivoDesdeHeader(res.headers, `Ticket_${ventaId}.pdf`);
      const ventana = window.open(url, '_blank');
      if (!ventana) {
        // Popup bloqueado por el navegador — fallback a descarga directa.
        const a = Object.assign(document.createElement('a'), { href: url, download: nombre });
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
      window.setTimeout(() => URL.revokeObjectURL(url), 30000);
    } catch (err) {
      if (err.name === 'CanceledError' || err.code === 'ERR_CANCELED') return;
      const msg = await mensajeErrorBlob(err, 'No se pudo abrir el ticket PDF.');
      toast.error(msg);
    } finally {
      setDescargandoRecibo(false);
    }
  };

  const cerrarTicket = () => setVentaActual(null);

  return (
    <div className="flex flex-col gap-4 h-[calc(100vh-64px-4rem)]">
      {!cargandoApertura && apertura === false && (
        <AperturaCajaModal onAbierta={data => setApertura(data)} />
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2" style={{ color: 'var(--jet)' }}>
            <ShoppingCart size={20} style={{ color: 'var(--pb)' }} />
            Punto de venta
          </h1>
          <p className="text-sm" style={{ color: 'var(--ash)' }}>
            Cajero: {user?.nombre || user?.username} · {format(new Date(), "d 'de' MMMM, HH:mm", { locale: es })}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 flex-1 min-h-0">
        {/* Columna izquierda: escaneo + grid de productos */}
        <div className="lg:col-span-2 flex flex-col gap-3 min-h-0">
          <ScannerProducto onProductoEncontrado={agregarProducto} disabled={Boolean(ventaActual)} />
          <BuscadorProductoManual productos={productos} onSeleccionar={agregarProducto} />

          <div className="flex-1 overflow-y-auto rounded-2xl p-3" style={{ border: '0.5px solid var(--border-md)', background: '#fff' }}>
            <p className="text-[11px] uppercase tracking-widest mb-2 flex items-center gap-1.5" style={{ color: 'var(--ash)' }}>
              <Package size={13} /> Productos
            </p>
            {loadingProductos ? (
              <SkeletonGrid />
            ) : productos.length === 0 ? (
              <p className="text-sm py-8 text-center" style={{ color: 'var(--ash)' }}>No hay productos activos cargados en inventario.</p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {productos.map(p => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => agregarProducto(p)}
                    disabled={p.stock_actual <= 0}
                    className="flex flex-col items-start gap-1 rounded-xl px-3 py-2.5 text-left disabled:opacity-40 min-h-[64px]"
                    style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain, #f5f5f4)' }}
                  >
                    <span className="text-sm font-medium truncate w-full" style={{ color: 'var(--jet)' }}>{p.nombre}</span>
                    <span className="text-sm font-semibold" style={{ color: 'var(--pb-mid, #0c7a86)' }}>${Number(p.precio).toFixed(2)}</span>
                    {p.stock_actual <= 0 && (
                      <span className="text-[10px]" style={{ color: 'var(--red, #dc2626)' }}>Sin stock</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Columna derecha: carrito */}
        <div className="min-h-0">
          <CarritoVenta
            items={carrito}
            onCambiarCantidad={cambiarCantidad}
            onQuitar={quitarProducto}
            totalUsd={totalUsd}
            totalVes={totalVes}
            resaltarMoneda={resaltarMoneda}
            metodoPago={metodoPago}
            onCambiarMetodo={cambiarMetodo}
            onCobrar={handleCobrar}
            cobrando={cobrando}
            cobrarDisabled={cobrarDisabled}
            cobrarDisabledMotivo={cobrarDisabledMotivo}
          >
            {metodoPago === 'tarjeta_prepago' && (
              <div className="space-y-3">
                {!tarjeta ? (
                  <>
                    <ScannerTarjeta onTarjetaResuelta={resolverTarjeta} />
                    <BuscadorAlumnoManual onTarjetaResuelta={resolverTarjeta} />
                  </>
                ) : (
                  <ResumenCobro
                    tarjeta={tarjeta}
                    totalUsd={totalUsd}
                    onCambiarTarjeta={cambiarTarjeta}
                    identidadConfirmada={identidadConfirmada}
                    onCambiarIdentidadConfirmada={setIdentidadConfirmada}
                    confirmarSaldoNegativo={confirmarSaldoNegativo}
                    onCambiarConfirmarSaldoNegativo={setConfirmarSaldoNegativo}
                  />
                )}
              </div>
            )}
          </CarritoVenta>
        </div>
      </div>

      {ventaActual && (
        <TicketVenta
          venta={ventaActual}
          onCerrar={cerrarTicket}
          onDescargarPdf={() => handleDescargarRecibo(ventaActual.id)}
          descargando={descargandoRecibo}
        />
      )}
    </div>
  );
}
