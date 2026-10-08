import { useState, useEffect, useCallback, useRef, useContext } from 'react';
import { toast } from 'react-toastify';
import { ShoppingCart, Package } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  getProductos, getTasaVigenteCantina, registrarVenta,
  getAperturaCajaActual, getBancosCantina,
} from '../../api/cantina.service';
import { AuthContext } from '../../context/AuthContext';
import { nombreUsuario } from '../../utils/nombreUsuario';
import { notificarAperturaCambiada, ETIQUETA_AREA } from '../aperturaEvento';
import MetodoPagoFields from '../../components/cantina/MetodoPagoFields';
import {
  esMetodoBancario, esMetodoVes, validarMetodoPago, valorInicialMetodo, camposMetodoVenta,
} from '../../components/cantina/metodoPagoUtils';
import CargoCuentaPanel from '../../components/cantina/pos/CargoCuentaPanel';
import { evaluarCredito } from '../../components/cantina/pos/evaluarCredito';
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

  // Datos del método bancario (banco, referencia, lote) — solo aplican si
  // `esMetodoBancario(metodoPago)`; el método en sí vive en `metodoPago`.
  const [datosPago, setDatosPago] = useState(() => valorInicialMetodo('efectivo'));
  const [bancos, setBancos] = useState([]);

  // "Cargar a cuenta" (CxC): representante elegido y alumno que consumió.
  const [representante, setRepresentante] = useState(null);
  const [alumnoId, setAlumnoId] = useState('');

  const [tarjeta, setTarjeta] = useState(null);
  const [identidadConfirmada, setIdentidadConfirmada] = useState(false);
  const [confirmarSaldoNegativo, setConfirmarSaldoNegativo] = useState(false);

  const [cobrando, setCobrando] = useState(false);
  const [ventaActual, setVentaActual] = useState(null);

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

  // El POS solo muestra productos del área de la apertura (D2): se espera a
  // conocerla antes de pedir el catálogo.
  const areaCaja = apertura?.area ?? null;
  useEffect(() => {
    if (!areaCaja) return undefined;
    const controller = new AbortController();
    (async () => {
      setLoadingProductos(true);
      try {
        const res = await getProductos({ activo: true, area: areaCaja }, controller.signal);
        setProductos(res.data?.results ?? res.data ?? []);
      } catch (err) {
        if (err.name === 'CanceledError' || err.code === 'ERR_CANCELED') return;
        toast.error('Error al cargar los productos del POS.');
      } finally {
        setLoadingProductos(false);
      }
    })();
    return () => controller.abort();
  }, [areaCaja]);

  useEffect(() => {
    const controller = new AbortController();
    getBancosCantina(controller.signal)
      .then(res => setBancos(res.data || []))
      .catch(err => {
        if (err.name === 'CanceledError' || err.code === 'ERR_CANCELED') return;
        toast.error('No se pudo cargar el catálogo de bancos.');
      });
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
    // Un producto escaneado de la otra caja se rechaza acá (el backend
    // también responde 400, pero mejor avisar antes de armar el carrito).
    if (producto.area && areaCaja && producto.area !== areaCaja) {
      toast.warning(`"${producto.nombre}" pertenece a ${ETIQUETA_AREA[producto.area] ?? producto.area}; tu caja abierta es ${ETIQUETA_AREA[areaCaja] ?? areaCaja}.`);
      return;
    }
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
  }, [areaCaja]);

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
    setDatosPago(valorInicialMetodo('efectivo'));
    setRepresentante(null);
    setAlumnoId('');
    setTarjeta(null);
    setIdentidadConfirmada(false);
    setConfirmarSaldoNegativo(false);
  }, []);

  const cambiarMetodo = (m) => {
    setMetodoPago(m);
    // Los datos bancarios no se arrastran entre métodos (cada uno tiene su
    // formato de referencia).
    setDatosPago(valorInicialMetodo(m));
    if (m !== 'credito_representante') {
      setRepresentante(null);
      setAlumnoId('');
    }
    if (m !== 'tarjeta_prepago') {
      setTarjeta(null);
      setIdentidadConfirmada(false);
      setConfirmarSaldoNegativo(false);
    }
  };

  const seleccionarRepresentante = (rep) => {
    setRepresentante(rep);
    // Con un solo hijo no hace falta que el cajero lo elija.
    setAlumnoId(rep?.alumnos?.length === 1 ? String(rep.alumnos[0].id) : '');
  };

  const cambiarRepresentante = () => {
    setRepresentante(null);
    setAlumnoId('');
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
  const resaltarMoneda = esMetodoVes(metodoPago) ? 'ves' : 'usd';
  const valorPago = { ...datosPago, metodo_pago: metodoPago };

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
  } else if (metodoPago === 'credito_representante') {
    const ev = evaluarCredito(representante, totalUsd);
    cobrarDisabled = !ev.ok;
    cobrarDisabledMotivo = ev.motivo;
  } else if (esMetodoBancario(metodoPago)) {
    if (Object.keys(validarMetodoPago(valorPago, { conMonto: false })).length > 0) {
      cobrarDisabled = true;
      cobrarDisabledMotivo = 'Completa banco y referencia del pago.';
    }
  }

  /* ── Cobrar ── */

  const handleCobrar = async () => {
    if (cobrarDisabled || cobrando) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    // El área NO se envía: la venta la hereda de la apertura (D2).
    const payload = {
      items: carrito.map(l => ({ producto_id: l.producto.id, cantidad: l.cantidad })),
      metodo_pago: metodoPago,
    };
    if (metodoPago === 'tarjeta_prepago') payload.tarjeta_codigo = tarjeta.codigo;
    if (esMetodoBancario(metodoPago)) Object.assign(payload, camposMetodoVenta(valorPago));
    if (metodoPago === 'credito_representante') {
      payload.representante_id = representante.id;
      if (alumnoId) payload.alumno_id = Number(alumnoId);
    }
    const repVenta = representante;
    const alumnoVenta = repVenta?.alumnos?.find(a => String(a.id) === alumnoId);

    setCobrando(true);
    try {
      const res = await registrarVenta(payload, controller.signal);
      toast.success(`Venta #${res.data.id} cobrada correctamente.`);
      // El ticket en pantalla muestra a quién se le cargó (el serializer de
      // la venta no necesariamente trae el nombre del representante).
      setVentaActual(metodoPago === 'credito_representante'
        ? {
          ...res.data,
          representante_nombre: res.data.representante_nombre
            ?? `${repVenta.nombre ?? ''} ${repVenta.apellido ?? ''}`.trim(),
          alumno_nombre: res.data.alumno_nombre
            ?? (alumnoVenta ? `${alumnoVenta.nombre} ${alumnoVenta.apellido}`.trim() : undefined),
        }
        : res.data);
      limpiarVenta();
      // El POS no abre ni ofrece el ticket PDF al cobrar (ninguna venta): el
      // recibo se descarga después desde el historial de ventas o, para ventas
      // a cuenta, desde Cuentas por cobrar.
    } catch (err) {
      if (err.name === 'CanceledError' || err.code === 'ERR_CANCELED') return;
      const msg = err.response?.data?.error || err.response?.data?.detail || 'No se pudo registrar la venta.';
      toast.error(msg);
    } finally {
      setCobrando(false);
    }
  };

  const cerrarTicket = () => setVentaActual(null);

  return (
    // Desde `lg` el POS ocupa la altura de la ventana (dvh) con dos columnas;
    // debajo de `lg` (tablet 768×1024, celular) la página scrollea y el botón
    // COBRAR queda fijo al pie del carrito (ver CarritoVenta).
    <div className="flex flex-col gap-4 lg:h-[calc(100dvh-64px-4rem)]">
      {!cargandoApertura && apertura === false && (
        <AperturaCajaModal
          onAbierta={data => { setApertura(data); notificarAperturaCambiada(); }}
        />
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2" style={{ color: 'var(--jet)' }}>
            <ShoppingCart size={20} style={{ color: 'var(--pb)' }} />
            Punto de venta
          </h1>
          <p className="text-sm" style={{ color: 'var(--ash)' }}>
            {areaCaja && <>Caja de {ETIQUETA_AREA[areaCaja] ?? areaCaja} · </>}
            Cajero: {nombreUsuario(user)} · {format(new Date(), "d 'de' MMMM, HH:mm", { locale: es })}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:flex-1 lg:min-h-0">
        {/* Columna izquierda: escaneo + grid de productos */}
        <div className="lg:col-span-2 flex flex-col gap-3 lg:min-h-0">
          <ScannerProducto onProductoEncontrado={agregarProducto} disabled={Boolean(ventaActual)} />
          <BuscadorProductoManual productos={productos} onSeleccionar={agregarProducto} />

          <div className="max-h-[45dvh] lg:max-h-none lg:flex-1 overflow-y-auto rounded-2xl p-3" style={{ border: '0.5px solid var(--border-md)', background: '#fff' }}>
            <p className="text-xs uppercase tracking-widest mb-2 flex items-center gap-1.5" style={{ color: 'var(--ash)' }}>
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
                    className="flex flex-col items-start gap-1 rounded-xl px-3 py-2.5 text-left disabled:opacity-60 disabled:cursor-not-allowed min-h-[64px]"
                    style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)' }}
                  >
                    <span className="text-sm font-medium truncate w-full" style={{ color: 'var(--jet)' }}>{p.nombre}</span>
                    <span className="text-sm font-semibold" style={{ color: 'var(--pb-mid)' }}>${Number(p.precio).toFixed(2)}</span>
                    {p.stock_actual <= 0 && (
                      <span className="text-xs font-semibold" style={{ color: 'var(--red)' }}>Sin stock</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Columna derecha: carrito */}
        <div className="lg:min-h-0">
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

            {esMetodoBancario(metodoPago) && (
              <MetodoPagoFields
                value={valorPago}
                onChange={setDatosPago}
                bancos={bancos}
                tasa={tasaVigente}
                metodosPermitidos={[metodoPago]}
                ocultarMonto
                ocultarSelector
                disabled={cobrando}
              />
            )}

            {metodoPago === 'credito_representante' && (
              <CargoCuentaPanel
                representante={representante}
                onSeleccionar={seleccionarRepresentante}
                onCambiar={cambiarRepresentante}
                alumnoId={alumnoId}
                onCambiarAlumno={setAlumnoId}
                totalUsd={totalUsd}
                disabled={cobrando}
              />
            )}
          </CarritoVenta>
        </div>
      </div>

      {ventaActual && (
        <TicketVenta
          venta={ventaActual}
          onCerrar={cerrarTicket}
        />
      )}
    </div>
  );
}
