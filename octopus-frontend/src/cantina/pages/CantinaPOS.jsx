import { useState, useEffect, useCallback, useRef, useContext, useMemo } from 'react';
import { toast } from 'react-toastify';
import { ShoppingCart, Package, Wallet, Printer, ScanLine, Loader2 } from 'lucide-react';
import { precalentarRecibo, imprimirReciboCantina, getImprimirAuto, getAnchoPapel } from '../../utils/imprimirReciboCantina';
import GrillaProductos from '../../components/cantina/pos/GrillaProductos';
import ConfigImpresoraModal from '../../components/cantina/pos/ConfigImpresoraModal';
import ConsultarSaldoModal from '../../components/cantina/tarjetas/ConsultarSaldoModal';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  getProductos, getTasaVigenteCantina, registrarVenta,
  getAperturaCajaActual, getBancosCantina, getPlantillasVenta,
} from '../../api/cantina.service';
import PlantillasVentaBar from '../../components/cantina/pos/PlantillasVentaBar';
import GestionPlantillasModal from '../../components/cantina/pos/GestionPlantillasModal';
import { AuthContext } from '../../context/AuthContext';
import { nombreUsuario } from '../../utils/nombreUsuario';
import { notificarAperturaCambiada, ETIQUETA_AREA } from '../aperturaEvento';
import MetodoPagoFields from '../../components/cantina/MetodoPagoFields';
import {
  esMetodoBancario, esMetodoVes, validarMetodoPago, valorInicialMetodo, camposMetodoVenta, etiquetaMetodo,
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
import DescuentoVenta from '../../components/cantina/pos/DescuentoVenta';
import { Modal } from '../../components/ui/Modal';
import { useMediaQuery } from '../../hooks/useMediaQuery';

// Origen de la venta (D2, CONTRATO_AUDITORIA_CANTINA.md §8): cada línea del
// carrito recuerda por dónde entró ('escaner' = ScannerProducto; 'manual' =
// buscador o grilla de productos). El backend marca `es_manual` con esto.
function origenProductos(carrito) {
  const origenes = new Set(carrito.flatMap(l => l.origenes));
  if (origenes.size > 1) return 'mixto';
  return origenes.has('escaner') ? 'escaner' : 'manual';
}

// "Más vendidos" por dispositivo y área: el POS ordena la grilla por unidades
// vendidas desde este equipo (sin endpoint nuevo; se acumula en localStorage).
const CLAVE_USOS = 'cantina_pos_usos';
const leerUsos = (area) => {
  try { return JSON.parse(localStorage.getItem(`${CLAVE_USOS}_${area}`) || '{}') || {}; } catch { return {}; }
};
const guardarUsos = (area, usos) => {
  try { localStorage.setItem(`${CLAVE_USOS}_${area}`, JSON.stringify(usos)); } catch { /* sin persistencia */ }
};

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

  const [catalogo, setCatalogo] = useState([]);
  const [loadingProductos, setLoadingProductos] = useState(true);
  const [usosPorArea, setUsosPorArea] = useState({});
  // Móvil: el lector (input + cámara) vive plegado para que la grilla quede a la vista.
  const [escanerAbierto, setEscanerAbierto] = useState(false);
  // Se incrementa tras cada venta para devolver el foco al lector físico (escritorio).
  const [enfocarScanner, setEnfocarScanner] = useState(0);
  const [tasaVigente, setTasaVigente] = useState(0);

  // Apertura de caja del cajero (§ apertura por cajero, no global): hasta 3
  // cajeros pueden tener caja abierta a la vez, cada uno con su propia
  // sesión — antes de la primera venta del turno se exige declarar el
  // monto inicial. `null` = todavía no se sabe (cargando), `false` = sin
  // apertura (se muestra el modal bloqueante), objeto = apertura activa.
  const [apertura, setApertura] = useState(null);
  const [cargandoApertura, setCargandoApertura] = useState(true);

  const [carrito, setCarrito] = useState([]); // [{ producto, cantidad, origenes: ['escaner'|'manual'] }]
  const [metodoPago, setMetodoPago] = useState('efectivo');

  // Descuento por venta (D1): monto USD como string decimal ('' = sin descuento).
  const [descuento, setDescuento] = useState('');
  const [motivoDescuento, setMotivoDescuento] = useState('');

  // Datos del método bancario (banco, referencia, lote) — solo aplican si
  // `esMetodoBancario(metodoPago)`; el método en sí vive en `metodoPago`.
  const [datosPago, setDatosPago] = useState(() => valorInicialMetodo('efectivo'));
  const [bancos, setBancos] = useState([]);

  // "Cargar a cuenta" (CxC): representante elegido y alumno que consumió.
  const [representante, setRepresentante] = useState(null);
  const [alumnoId, setAlumnoId] = useState('');

  const [tarjeta, setTarjeta] = useState(null);
  const [consultandoSaldo, setConsultandoSaldo] = useState(false);
  const [configurandoImpresora, setConfigurandoImpresora] = useState(false);
  const [plantillas, setPlantillas] = useState([]);
  const [gestionandoPlantillas, setGestionandoPlantillas] = useState(false);
  const [recargaPlantillas, setRecargaPlantillas] = useState(0);
  // Cómo se identificó al alumno de la tarjeta: 'escaner' | 'manual'.
  const [origenTarjeta, setOrigenTarjeta] = useState(null);
  const [identidadConfirmada, setIdentidadConfirmada] = useState(false);
  const [confirmarSaldoNegativo, setConfirmarSaldoNegativo] = useState(false);

  const [cobrando, setCobrando] = useState(false);
  const [ventaActual, setVentaActual] = useState(null);

  // Desde `lg` el carrito es una columna fija; debajo (celular, tablet) vive en
  // un Modal que se abre desde la barra inferior, así COBRAR nunca queda lejos.
  const esLg = useMediaQuery('(min-width: 1024px)');
  const [carritoAbierto, setCarritoAbierto] = useState(false);

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

  // El POS solo muestra productos del área de la apertura (D2). El catálogo se
  // pide en paralelo con la apertura (antes esperaba a conocerla) y se filtra
  // por área acá mismo.
  const areaCaja = apertura?.area ?? null;
  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        const res = await getProductos({ activo: true }, controller.signal);
        setCatalogo(res.data?.results ?? res.data ?? []);
      } catch (err) {
        if (err.name === 'CanceledError' || err.code === 'ERR_CANCELED') return;
        toast.error('Error al cargar los productos del POS.');
      } finally {
        setLoadingProductos(false);
      }
    })();
    return () => controller.abort();
  }, []);

  // Deja listo el logo del recibo para que el primer ticket no espere.
  useEffect(() => { precalentarRecibo(); }, []);

  // Conteo local de unidades vendidas: lo guardado en este equipo + lo vendido en esta sesión.
  const usos = useMemo(
    () => (areaCaja ? (usosPorArea[areaCaja] ?? leerUsos(areaCaja)) : {}),
    [usosPorArea, areaCaja],
  );

  // Productos del área, los más vendidos desde este equipo primero (sort estable).
  const productos = useMemo(() => {
    if (!areaCaja) return [];
    return catalogo
      .filter(p => !p.area || p.area === areaCaja)
      .sort((a, b) => (usos[b.id] || 0) - (usos[a.id] || 0));
  }, [catalogo, areaCaja, usos]);

  // Escaneo sin viaje al servidor cuando el código está en el catálogo cargado.
  const productoPorCodigo = useMemo(() => {
    const mapa = new Map();
    productos.forEach(p => {
      const codigo = String(p.codigo_barras ?? '').trim();
      if (codigo) mapa.set(codigo, p);
    });
    return mapa;
  }, [productos]);
  const buscarLocal = useCallback(codigo => productoPorCodigo.get(codigo), [productoPorCodigo]);

  // Los bancos solo hacen falta con un método bancario: se piden la primera vez que se elige.
  const necesitaBancos = esMetodoBancario(metodoPago);
  useEffect(() => {
    if (!necesitaBancos || bancos.length > 0) return undefined;
    const controller = new AbortController();
    getBancosCantina(controller.signal)
      .then(res => setBancos(res.data || []))
      .catch(err => {
        if (err.name === 'CanceledError' || err.code === 'ERR_CANCELED') return;
        toast.error('No se pudo cargar el catálogo de bancos.');
      });
    return () => controller.abort();
  }, [necesitaBancos, bancos.length]);

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

  const agregarProducto = useCallback((producto, origen = 'manual') => {
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
        return prev.map(l => (l.producto.id === producto.id
          ? { ...l, cantidad: cantidadDeseada, origenes: l.origenes.includes(origen) ? l.origenes : [...l.origenes, origen] }
          : l));
      }
      return [...prev, { producto, cantidad: 1, origenes: [origen] }];
    });
  }, [areaCaja]);

  // Estable (no cambia con el carrito) para que la grilla memoizada no se repinte.
  const agregarManual = useCallback(p => agregarProducto(p, 'manual'), [agregarProducto]);

  useEffect(() => {
    if (!areaCaja) return undefined;
    const controller = new AbortController();
    (async () => {
      try {
        const res = await getPlantillasVenta({ activo: true, area: areaCaja }, controller.signal);
        setPlantillas(res.data?.results ?? res.data ?? []);
      } catch (err) {
        if (err.name === 'CanceledError' || err.code === 'ERR_CANCELED') return;
        toast.error('No se pudieron cargar las plantillas de cobro.');
      }
    })();
    return () => controller.abort();
  }, [areaCaja, recargaPlantillas]);

  // Suma al carrito los productos de la plantilla (con el catálogo y precios
  // vigentes). Lo que no tiene stock suficiente se omite y se avisa.
  const aplicarPlantilla = (plantilla) => {
    const omitidos = [];
    let nuevo = [...carrito];
    plantilla.items.forEach(({ producto: id, cantidad }) => {
      const producto = productos.find(p => p.id === id);
      if (!producto) { omitidos.push(`${id}`); return; }
      const idx = nuevo.findIndex(l => l.producto.id === id);
      const deseada = (idx >= 0 ? nuevo[idx].cantidad : 0) + cantidad;
      if (producto.stock_actual != null && deseada > producto.stock_actual) {
        omitidos.push(`${producto.nombre} (stock: ${producto.stock_actual})`);
        return;
      }
      if (idx >= 0) {
        nuevo[idx] = {
          ...nuevo[idx],
          cantidad: deseada,
          origenes: nuevo[idx].origenes.includes('manual') ? nuevo[idx].origenes : [...nuevo[idx].origenes, 'manual'],
        };
      } else {
        nuevo = [...nuevo, { producto, cantidad, origenes: ['manual'] }];
      }
    });
    setCarrito(nuevo);
    if (omitidos.length) toast.warning(`No se agregó por falta de stock o catálogo: ${omitidos.join(', ')}.`);
    else toast.success(`"${plantilla.nombre}" agregada al carrito.`);
  };

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
    // El método de pago se conserva entre ventas (quien cobra con tarjeta o
    // pago móvil seguido no lo reelige); solo se limpian sus datos.
    setDatosPago(valorInicialMetodo(metodoPago));
    setDescuento('');
    setMotivoDescuento('');
    setRepresentante(null);
    setAlumnoId('');
    setTarjeta(null);
    setOrigenTarjeta(null);
    setIdentidadConfirmada(false);
    setConfirmarSaldoNegativo(false);
  }, [metodoPago]);

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
      setOrigenTarjeta(null);
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

  const resolverTarjeta = (data, origen) => {
    setTarjeta(data);
    setOrigenTarjeta(origen);
    setIdentidadConfirmada(false);
    setConfirmarSaldoNegativo(false);
  };

  const cambiarTarjeta = () => {
    setTarjeta(null);
    setOrigenTarjeta(null);
    setIdentidadConfirmada(false);
    setConfirmarSaldoNegativo(false);
  };

  /* ── Totales (estimado en pantalla — la tasa que cuenta es la que
     congela el backend en la respuesta de la venta, ver §7.2 cantina.md) ── */
  const subtotalUsd = carrito.reduce((acc, l) => acc + Number(l.producto.precio) * l.cantidad, 0);
  const descuentoUsd = Number(descuento) || 0;
  const descuentoExcede = descuentoUsd > subtotalUsd + 0.005;
  // Total neto (lo que se cobra y lo que se valida contra tarjeta / crédito).
  const totalUsd = Math.max(subtotalUsd - descuentoUsd, 0);
  const totalVes = totalUsd * tasaVigente;
  const resaltarMoneda = esMetodoVes(metodoPago) ? 'ves' : 'usd';
  const valorPago = { ...datosPago, metodo_pago: metodoPago };

  /* ── Reglas de habilitación de "Cobrar" (§7.2 cantina.md) ── */
  let cobrarDisabled = false;
  let cobrarDisabledMotivo = '';
  if (carrito.length === 0) {
    cobrarDisabled = true;
    cobrarDisabledMotivo = 'Agrega al menos un producto al carrito.';
  } else if (descuentoExcede) {
    cobrarDisabled = true;
    cobrarDisabledMotivo = 'El descuento no puede superar el subtotal.';
  } else if (descuentoUsd > 0 && !motivoDescuento.trim()) {
    cobrarDisabled = true;
    cobrarDisabledMotivo = 'Indica el motivo del descuento.';
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
      descuento_usd: descuentoUsd.toFixed(2),
      origen_producto: origenProductos(carrito),
      // Solo la tarjeta prepago identifica alumno por escáner o búsqueda; en
      // "Cargar a cuenta" el alumno sale del representante elegido (no aplica).
      origen_alumno: metodoPago === 'tarjeta_prepago' ? (origenTarjeta ?? 'manual') : 'no_aplica',
    };
    if (descuentoUsd > 0) payload.motivo_descuento = motivoDescuento.trim();
    if (metodoPago === 'tarjeta_prepago') payload.tarjeta_codigo = tarjeta.codigo;
    if (esMetodoBancario(metodoPago)) Object.assign(payload, camposMetodoVenta(valorPago));
    if (metodoPago === 'credito_representante') {
      // Un cliente general (personal/otro) va por cliente_id; sin alumno.
      if (representante.tipo && representante.tipo !== 'representante') {
        payload.cliente_id = representante.id;
      } else {
        payload.representante_id = representante.id;
        if (alumnoId) payload.alumno_id = Number(alumnoId);
      }
    }
    const repVenta = representante;
    const alumnoVenta = repVenta?.alumnos?.find(a => String(a.id) === alumnoId);

    setCobrando(true);
    try {
      const res = await registrarVenta(payload, controller.signal);
      // El ticket lleva a quién se le cargó (el serializer de la venta no
      // necesariamente trae el nombre del representante).
      const ventaCobrada = metodoPago === 'credito_representante'
        ? {
          ...res.data,
          representante_nombre: res.data.representante_nombre
            ?? res.data.cliente_nombre
            ?? `${repVenta.nombre ?? ''} ${repVenta.apellido ?? ''}`.trim(),
          alumno_nombre: res.data.alumno_nombre
            ?? (alumnoVenta ? `${alumnoVenta.nombre} ${alumnoVenta.apellido}`.trim() : undefined),
        }
        : res.data;

      // Más vendidos de este equipo (ordena la grilla).
      if (areaCaja) {
        const siguiente = { ...usos };
        carrito.forEach(l => { siguiente[l.producto.id] = (siguiente[l.producto.id] || 0) + l.cantidad; });
        setUsosPorArea(prev => ({ ...prev, [areaCaja]: siguiente }));
        guardarUsos(areaCaja, siguiente);
      }

      // Impresión inmediata si el cajero la activó; no espera a que se monte el ticket.
      if (getImprimirAuto()) imprimirReciboCantina(ventaCobrada, getAnchoPapel());

      // Sin modal: el cajero sigue vendiendo. El ticket queda a un toque en el aviso.
      const idAviso = `venta-${res.data.id}`;
      toast.success(
        <div className="flex items-center justify-between gap-3">
          <span>Venta #{res.data.id} cobrada · ${Number(res.data.total_usd ?? totalUsd).toFixed(2)}</span>
          <button
            type="button"
            className="shrink-0 underline font-medium"
            onClick={() => { setVentaActual(ventaCobrada); toast.dismiss(idAviso); }}
          >
            Ver ticket
          </button>
        </div>,
        { toastId: idAviso, autoClose: 4000 },
      );
      limpiarVenta();
      setCarritoAbierto(false);
      setEnfocarScanner(n => n + 1);
    } catch (err) {
      if (err.name === 'CanceledError' || err.code === 'ERR_CANCELED') return;
      const msg = err.response?.data?.error || err.response?.data?.detail || 'No se pudo registrar la venta.';
      toast.error(msg);
    } finally {
      setCobrando(false);
    }
  };

  const cerrarTicket = () => setVentaActual(null);

  const renderCarrito = (embebido) => (
    <CarritoVenta
      embebido={embebido}
      items={carrito}
      onCambiarCantidad={cambiarCantidad}
      onQuitar={quitarProducto}
      subtotalUsd={subtotalUsd}
      descuentoUsd={descuentoUsd}
      descuento={(
        <DescuentoVenta
          subtotalUsd={subtotalUsd}
          descuento={descuento}
          onCambiarDescuento={setDescuento}
          motivo={motivoDescuento}
          onCambiarMotivo={setMotivoDescuento}
          disabled={cobrando}
        />
      )}
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
              <ScannerTarjeta onTarjetaResuelta={t => resolverTarjeta(t, 'escaner')} />
              <BuscadorAlumnoManual onTarjetaResuelta={t => resolverTarjeta(t, 'manual')} />
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
        <div className="space-y-3">
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
        </div>
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
  );

  // Lector de código de barras (input + cámara). En escritorio queda siempre
  // visible y con foco; en móvil se despliega a pedido y sin robar el foco (teclado).
  const lectorProducto = (
    <ScannerProducto
      onProductoEncontrado={p => agregarProducto(p, 'escaner')}
      disabled={Boolean(ventaActual)}
      autoEnfocar={esLg}
      enfocarTrigger={enfocarScanner}
      buscarLocal={buscarLocal}
    />
  );

  // Efectivo no pide ningún dato más: en móvil se cobra desde la barra inferior
  // sin abrir el carrito (el resto de métodos sí lo necesitan).
  const cobroDirecto = !esLg && carrito.length > 0 && (metodoPago === 'efectivo' || metodoPago === 'efectivo_ves');

  return (
    // Desde `lg` el POS ocupa la altura de la ventana (dvh) con dos columnas;
    // debajo de `lg` (tablet 768×1024, celular) la página scrollea y el botón
    // COBRAR queda fijo al pie del carrito (ver CarritoVenta).
    <div className="flex flex-col gap-4 lg:h-[calc(100dvh-4rem)]">
      {consultandoSaldo && <ConsultarSaldoModal onClose={() => setConsultandoSaldo(false)} />}
      {configurandoImpresora && <ConfigImpresoraModal onCerrar={() => setConfigurandoImpresora(false)} />}
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
        <div className="grid grid-cols-2 gap-2 w-full sm:w-auto sm:flex sm:flex-row">
          <button
            type="button"
            onClick={() => setConfigurandoImpresora(true)}
            className="flex items-center justify-center gap-2 px-3 sm:px-4 rounded-xl text-sm font-medium min-h-[44px] w-full sm:w-auto"
            style={{ border: '0.5px solid var(--border-md)', color: 'var(--ash)', background: '#fff' }}
          >
            <Printer size={16} /> Impresora
          </button>
          <button
            type="button"
            onClick={() => setConsultandoSaldo(true)}
            className="flex items-center justify-center gap-2 px-3 sm:px-4 rounded-xl text-sm font-medium min-h-[44px] w-full sm:w-auto"
            style={{ border: '1.5px solid var(--pb)', color: 'var(--pb)', background: '#fff' }}
          >
            <Wallet size={16} /> Consultar saldo
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:flex-1 lg:min-h-0">
        {/* Columna izquierda: escaneo + grid de productos */}
        <div className="lg:col-span-2 flex flex-col gap-3 lg:min-h-0">
          {esLg && lectorProducto}
          <div className="flex items-stretch gap-2">
            <div className="flex-1 min-w-0">
              <BuscadorProductoManual productos={productos} onSeleccionar={agregarManual} />
            </div>
            {!esLg && (
              <button
                type="button"
                onClick={() => setEscanerAbierto(v => !v)}
                aria-expanded={escanerAbierto}
                aria-label="Escanear código de barras"
                className="shrink-0 w-12 min-h-[44px] rounded-xl flex items-center justify-center"
                style={escanerAbierto
                  ? { background: 'var(--pb)', color: '#fff' }
                  : { border: '1.5px solid var(--pb)', color: 'var(--pb)', background: '#fff' }}
              >
                <ScanLine size={18} />
              </button>
            )}
          </div>
          {!esLg && escanerAbierto && lectorProducto}
          <PlantillasVentaBar
            plantillas={plantillas}
            tasa={tasaVigente}
            onAplicar={aplicarPlantilla}
            onGestionar={() => setGestionandoPlantillas(true)}
            disabled={Boolean(ventaActual)}
          />
          {gestionandoPlantillas && (
            <GestionPlantillasModal
              area={areaCaja}
              productos={productos}
              plantillas={plantillas}
              tasa={tasaVigente}
              onClose={() => setGestionandoPlantillas(false)}
              onCambio={() => setRecargaPlantillas(n => n + 1)}
            />
          )}

          <div className="lg:flex-1 lg:overflow-y-auto rounded-2xl p-3" style={{ border: '0.5px solid var(--border-md)', background: '#fff' }}>
            <p className="text-xs uppercase tracking-widest mb-2 flex items-center gap-1.5" style={{ color: 'var(--ash)' }}>
              <Package size={13} /> Productos
            </p>
            {loadingProductos || !areaCaja ? (
              <SkeletonGrid />
            ) : productos.length === 0 ? (
              <p className="text-sm py-8 text-center" style={{ color: 'var(--ash)' }}>No hay productos activos cargados en inventario.</p>
            ) : (
              <GrillaProductos productos={productos} onAgregar={agregarManual} />
            )}
          </div>
        </div>

        {/* Columna derecha: carrito (desde lg; debajo vive en el Modal del pie) */}
        {esLg && (
          <div className="lg:min-h-0">
            {renderCarrito(false)}
          </div>
        )}
      </div>

      {!esLg && (
        <>
          <div
            className="sticky bottom-0 z-20 -mx-3 sm:-mx-8 px-3 sm:px-8 py-3 flex items-center gap-3"
            style={{ background: 'var(--surface)', borderTop: '0.5px solid var(--border-md)' }}
          >
            <div className="min-w-0 flex-1">
              <p className="text-lg font-bold leading-tight" style={{ color: 'var(--pb)' }}>${totalUsd.toFixed(2)}</p>
              <p className="text-xs truncate" style={{ color: 'var(--ash)' }}>
                Bs. {totalVes.toFixed(2)} · {etiquetaMetodo(metodoPago)}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setCarritoAbierto(true)}
              className="shrink-0 flex items-center justify-center gap-2 px-4 rounded-xl text-sm font-semibold min-h-[48px]"
              style={cobroDirecto
                ? { border: '1.5px solid var(--pb)', color: 'var(--pb)', background: '#fff' }
                : { background: 'var(--pb)', color: '#fff' }}
            >
              <ShoppingCart size={16} />
              {cobroDirecto ? `Carrito (${carrito.length})` : `Ver carrito (${carrito.length})`}
            </button>
            {cobroDirecto && (
              <button
                type="button"
                onClick={handleCobrar}
                disabled={cobrarDisabled || cobrando}
                className="shrink-0 flex items-center justify-center gap-2 px-4 rounded-xl text-sm font-semibold text-white min-h-[48px] disabled:opacity-40"
                style={{ background: 'var(--pb)' }}
              >
                {cobrando ? <Loader2 size={16} className="animate-spin" /> : 'COBRAR'}
              </button>
            )}
          </div>
          <Modal
            open={carritoAbierto && !ventaActual}
            onClose={() => setCarritoAbierto(false)}
            size="lg"
            bodyClassName="p-0"
            titulo={<><ShoppingCart size={17} /> Carrito · {carrito.length} línea{carrito.length !== 1 ? 's' : ''}</>}
          >
            {renderCarrito(true)}
          </Modal>
        </>
      )}

      {ventaActual && (
        <TicketVenta
          venta={ventaActual}
          onCerrar={cerrarTicket}
          sinImpresionAuto
        />
      )}
    </div>
  );
}
