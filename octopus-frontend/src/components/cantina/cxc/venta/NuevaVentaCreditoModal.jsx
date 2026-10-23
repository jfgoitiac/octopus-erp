import { useState, useEffect, useRef, useMemo } from 'react';
import { toast } from 'react-toastify';
import { HandCoins, Loader2, Info } from 'lucide-react';
import { Modal } from '../../../ui/Modal';
import DatePickerES from '../../../DatePickerES';
import {
  getProductos, getTasaVigenteCantina, registrarVenta, getAperturaCajaActual,
} from '../../../../api/cantina.service';
import { ETIQUETA_AREA } from '../../../../cantina/aperturaEvento';
import CargoCuentaPanel from '../../pos/CargoCuentaPanel';
import CarritoVenta from '../../pos/CarritoVenta';
import DescuentoVenta from '../../pos/DescuentoVenta';
import { evaluarCredito } from '../../pos/evaluarCredito';
import { esCancelacion, esCliente, nombreCompleto, num, fmtUsd, fmtVes, fechaLocalISO } from '../utilsCxc';
import CatalogoProductosVenta from './CatalogoProductosVenta';
import useCarritoVenta, { origenProductos } from './useCarritoVenta';

const noop = () => {};
const MOTIVO_MIN = 10;
const FIELD_STYLE = { border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)', fontSize: '15px' };

// Si el titular inicial es un representante con un único hijo, se preselecciona.
const alumnoInicial = (t) => (t && !esCliente(t) && t.alumnos?.length === 1 ? String(t.alumnos[0].id) : '');

function mensajeVenta(err) {
  const d = err?.response?.data;
  return d?.error || d?.detail || 'No se pudo registrar la venta a crédito.';
}

// "Nueva venta a crédito": el registro de una cuenta por cobrar tipo POS.
// Titular (representante / personal / otro) → carrito → confirmar. Crea una
// VENTA REAL (POST ventas/registrar/ con metodo_pago 'credito_representante'):
// descuenta inventario, cuelga de la caja abierta del cajero, deja bitácora de
// descuento / venta manual y genera el cargo en la cuenta del titular. El
// backend revalida límite de crédito y bloqueo de la cuenta.
// Props: { open, onClose, onVentaCreada({ venta, titular }),
//          titularInicial (opcional: titular ya elegido, con saldo_usd / limite_usd / bloqueado / alumnos),
//          esAdmin (opcional: habilita la venta retroactiva) }.
// Venta retroactiva (solo admin/director): fecha pasada + motivo. No entra a ninguna
// caja (ni abierta ni cerrada), por eso el administrador puede registrarla sin
// caja abierta eligiendo el área.
export default function NuevaVentaCreditoModal({ open, onClose, onVentaCreada, titularInicial = null, esAdmin = false }) {
  const [apertura, setApertura] = useState(null); // null = cargando, false = sin caja
  const [productos, setProductos] = useState([]);
  const [productosDe, setProductosDe] = useState(null); // área para la que ya se cargó el catálogo
  const [tasa, setTasa] = useState(0);
  const [titular, setTitular] = useState(titularInicial);
  const [alumnoId, setAlumnoId] = useState(() => alumnoInicial(titularInicial));
  const [retro, setRetro] = useState(false);
  const [fechaRetro, setFechaRetro] = useState(() => fechaLocalISO(-1));
  const [motivoRetro, setMotivoRetro] = useState('');
  const [areaRetro, setAreaRetro] = useState('cantina');
  const [descuento, setDescuento] = useState('');
  const [motivoDescuento, setMotivoDescuento] = useState('');
  const [guardando, setGuardando] = useState(false);
  const abortRef = useRef(null);

  // Admin sin caja abierta: solo puede vender de forma retroactiva (modo forzado).
  const sinCajaAdmin = esAdmin && apertura === false;
  const retroActiva = esAdmin && (retro || sinCajaAdmin);
  const areaCaja = apertura?.area ?? (sinCajaAdmin ? areaRetro : null);
  const { carrito, agregar, cambiarCantidad, quitar, subtotalUsd } = useCarritoVenta(areaCaja);

  useEffect(() => {
    if (!open) return undefined;
    const controller = new AbortController();
    getAperturaCajaActual(controller.signal)
      .then(res => setApertura(res.data?.apertura ?? false))
      .catch(err => {
        if (esCancelacion(err)) return;
        toast.error('No se pudo verificar tu apertura de caja.');
        setApertura(false);
      });
    getTasaVigenteCantina(controller.signal)
      .then(res => setTasa(num(res.data?.valor_bs)))
      .catch(() => { /* sin tasa: el equivalente en Bs queda en 0; el backend usa la suya. */ });
    return () => controller.abort();
  }, [open]);

  useEffect(() => {
    if (!areaCaja) return undefined;
    const controller = new AbortController();
    getProductos({ activo: true, area: areaCaja }, controller.signal)
      .then(res => {
        setProductos(res.data?.results ?? res.data ?? []);
        setProductosDe(areaCaja);
      })
      .catch(err => {
        if (esCancelacion(err)) return;
        toast.error('Error al cargar los productos.');
        setProductosDe(areaCaja);
      });
    return () => controller.abort();
  }, [areaCaja]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const cargandoProductos = Boolean(areaCaja) && productosDe !== areaCaja;
  const descuentoUsd = num(descuento);
  const descuentoExcede = descuentoUsd > subtotalUsd + 0.005;
  const totalUsd = Math.max(subtotalUsd - descuentoUsd, 0);
  const totalVes = totalUsd * tasa;
  const ev = evaluarCredito(titular, totalUsd);

  let motivoBloqueo = '';
  if (!apertura && !retroActiva) motivoBloqueo = 'Necesitas una caja abierta.';
  else if (retroActiva && (!fechaRetro || fechaRetro >= fechaLocalISO())) motivoBloqueo = 'La fecha de la venta retroactiva debe ser anterior a hoy.';
  else if (retroActiva && motivoRetro.trim().length < MOTIVO_MIN) motivoBloqueo = `Explica el motivo de la venta retroactiva (mínimo ${MOTIVO_MIN} caracteres).`;
  else if (!titular) motivoBloqueo = ev.motivo;
  else if (carrito.length === 0) motivoBloqueo = 'Agrega al menos un producto al carrito.';
  else if (descuentoExcede) motivoBloqueo = 'El descuento no puede superar el subtotal.';
  else if (descuentoUsd > 0 && !motivoDescuento.trim()) motivoBloqueo = 'Indica el motivo del descuento.';
  else if (totalUsd <= 0) motivoBloqueo = 'Un descuento total no puede cargarse a la cuenta.';
  else if (!ev.ok) motivoBloqueo = ev.motivo;

  const alumnoElegido = useMemo(
    () => titular?.alumnos?.find(a => String(a.id) === alumnoId),
    [titular, alumnoId],
  );

  const elegirTitular = (t) => {
    setTitular(t);
    setAlumnoId(!esCliente(t) && t?.alumnos?.length === 1 ? String(t.alumnos[0].id) : '');
  };
  const cambiarTitular = () => { setTitular(null); setAlumnoId(''); };

  const confirmar = async () => {
    if (motivoBloqueo || guardando) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const payload = {
      items: carrito.map(l => ({ producto_id: l.producto.id, cantidad: l.cantidad })),
      metodo_pago: 'credito_representante',
      descuento_usd: descuentoUsd.toFixed(2),
      origen_producto: origenProductos(carrito),
      origen_alumno: 'no_aplica',
    };
    if (descuentoUsd > 0) payload.motivo_descuento = motivoDescuento.trim();
    if (retroActiva) {
      payload.fecha_venta = fechaRetro;
      payload.motivo_retroactivo = motivoRetro.trim();
    }
    if (esCliente(titular)) {
      payload.cliente_id = titular.id;
    } else {
      payload.representante_id = titular.id;
      if (alumnoId) payload.alumno_id = Number(alumnoId);
    }

    setGuardando(true);
    try {
      const res = await registrarVenta(payload, controller.signal);
      toast.success(`Venta #${res.data.id} cargada a la cuenta de ${nombreCompleto(titular)}.`);
      onVentaCreada?.({
        venta: {
          ...res.data,
          representante_nombre: res.data.representante_nombre ?? res.data.cliente_nombre ?? nombreCompleto(titular),
          alumno_nombre: res.data.alumno_nombre
            ?? (alumnoElegido ? `${alumnoElegido.nombre} ${alumnoElegido.apellido}`.trim() : undefined),
        },
        titular: { tipo: titular.tipo || 'representante', id: titular.id },
      });
    } catch (err) {
      if (esCancelacion(err)) return;
      toast.error(mensajeVenta(err));
    } finally {
      setGuardando(false);
    }
  };

  const footer = (
    <>
      <button
        type="button"
        onClick={onClose}
        disabled={guardando}
        className="w-full sm:w-auto px-4 rounded-xl py-2.5 text-sm min-h-[44px] disabled:opacity-50"
        style={{ border: '0.5px solid var(--border-md)', color: 'var(--ash)' }}
      >
        Cancelar
      </button>
      <button
        type="button"
        onClick={confirmar}
        disabled={Boolean(motivoBloqueo) || guardando}
        className="w-full sm:w-auto px-5 rounded-xl py-2.5 text-sm font-semibold text-white min-h-[44px] flex items-center justify-center gap-2 disabled:opacity-40"
        style={{ background: 'var(--pb)' }}
      >
        {guardando
          ? <><Loader2 size={15} className="animate-spin" /> Registrando…</>
          : <><HandCoins size={15} /> Cargar {fmtUsd(totalUsd)} a la cuenta</>}
      </button>
    </>
  );

  return (
    <Modal
      open={open}
      onClose={guardando ? noop : onClose}
      size="xl"
      titulo={<><HandCoins size={18} /> Nueva venta a crédito</>}
      footer={footer}
    >
      {apertura === null ? (
        <div className="h-40 rounded-2xl animate-pulse" aria-busy="true" style={{ background: 'var(--border-md)' }} />
      ) : apertura === false && !esAdmin ? (
        <div className="rounded-2xl p-4 flex items-start gap-3 text-sm" role="alert" style={{ background: 'var(--pb-light)', color: 'var(--jet)' }}>
          <Info size={18} className="shrink-0 mt-0.5" style={{ color: 'var(--pb)' }} />
          <p>
            Una venta a crédito es una venta real y se registra en tu caja. Abre tu caja desde
            <strong> Punto de venta</strong> y vuelve a intentarlo.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <p className="text-xs" style={{ color: 'var(--ash)' }}>
            {apertura ? `Caja de ${ETIQUETA_AREA[areaCaja] ?? areaCaja}` : 'Sin caja abierta'} · tasa vigente {tasa ? `${fmtVes(tasa)} por $ 1,00` : 'no registrada'}
          </p>

          {esAdmin && (
            <div className="rounded-xl p-3 flex flex-col gap-3" style={{ background: '#fff', border: '0.5px solid var(--border-md)' }}>
              {sinCajaAdmin ? (
                <p className="text-sm font-medium" style={{ color: 'var(--jet)' }}>
                  Venta retroactiva <span className="font-normal text-xs" style={{ color: 'var(--ash)' }}>· no tienes caja abierta; la venta no afecta ninguna caja.</span>
                </p>
              ) : (
                <label className="flex items-center gap-2 text-sm font-medium cursor-pointer min-h-[40px]" style={{ color: 'var(--jet)' }}>
                  <input type="checkbox" role="switch" checked={retro} disabled={guardando} onChange={e => setRetro(e.target.checked)} className="h-4 w-4" />
                  Venta retroactiva
                </label>
              )}
              {retroActiva && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <span className="block text-xs uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>Fecha de la venta</span>
                    <DatePickerES
                      value={fechaRetro}
                      onChange={e => setFechaRetro(e.target.value)}
                      maxDate={fechaLocalISO(-1)}
                      className="w-full px-3 py-2 rounded-lg outline-none min-h-[40px]"
                      style={FIELD_STYLE}
                    />
                  </div>
                  {sinCajaAdmin && (
                    <div>
                      <label htmlFor="venta-retro-area" className="block text-xs uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>Área</label>
                      <select
                        id="venta-retro-area"
                        value={areaRetro}
                        onChange={e => setAreaRetro(e.target.value)}
                        disabled={guardando || carrito.length > 0}
                        className="w-full px-3 py-2 rounded-lg outline-none min-h-[40px]"
                        style={FIELD_STYLE}
                      >
                        <option value="cantina">Cantina</option>
                        <option value="libreria">Librería</option>
                      </select>
                    </div>
                  )}
                  <div className="sm:col-span-2">
                    <label htmlFor="venta-retro-motivo" className="block text-xs uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>Motivo (obligatorio)</label>
                    <textarea
                      id="venta-retro-motivo"
                      rows={2}
                      value={motivoRetro}
                      onChange={e => setMotivoRetro(e.target.value)}
                      placeholder="Por qué se registra esta venta con fecha pasada"
                      className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                      style={FIELD_STYLE}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          <CargoCuentaPanel
            representante={titular}
            onSeleccionar={elegirTitular}
            onCambiar={cambiarTitular}
            alumnoId={alumnoId}
            onCambiarAlumno={setAlumnoId}
            totalUsd={totalUsd}
            disabled={guardando}
          />

          {titular ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
              <CatalogoProductosVenta
                productos={productos}
                cargando={cargandoProductos}
                onAgregar={agregar}
                disabled={guardando}
              />
              <CarritoVenta
                items={carrito}
                onCambiarCantidad={cambiarCantidad}
                onQuitar={quitar}
                subtotalUsd={subtotalUsd}
                descuentoUsd={descuentoUsd}
                descuento={(
                  <DescuentoVenta
                    subtotalUsd={subtotalUsd}
                    descuento={descuento}
                    onCambiarDescuento={setDescuento}
                    motivo={motivoDescuento}
                    onCambiarMotivo={setMotivoDescuento}
                    disabled={guardando}
                  />
                )}
                totalUsd={totalUsd}
                totalVes={totalVes}
                resaltarMoneda="usd"
                metodoPago="credito_representante"
                onCambiarMetodo={noop}
                onCobrar={confirmar}
                cobrando={guardando}
                cobrarDisabled={Boolean(motivoBloqueo)}
                cobrarDisabledMotivo={motivoBloqueo}
                ocultarMetodo
                ocultarCobrar
              />
            </div>
          ) : (
            <p className="text-sm text-center py-4" style={{ color: 'var(--ash)' }}>
              Elige primero quién asume el cargo para empezar a armar la venta.
            </p>
          )}

          {titular && motivoBloqueo && carrito.length > 0 && (
            <p className="text-xs text-center" style={{ color: 'var(--ash)' }}>{motivoBloqueo}</p>
          )}
        </div>
      )}
    </Modal>
  );
}
