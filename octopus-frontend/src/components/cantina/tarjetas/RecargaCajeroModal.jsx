import { useState, useEffect, useRef } from 'react';
import { toast } from 'react-toastify';
import {
  Loader2, Search, Wallet, AlertTriangle, CheckCircle2, UserRound,
} from 'lucide-react';
import {
  buscarTarjetaActiva, getBancosCantina, getTasaVigenteCantina, recargarTarjetaCajero,
} from '../../../api/cantina.service';
import { Modal } from '../../ui/Modal';

const FIELD_STYLE = { border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)', fontSize: '16px' };
const LABEL_STYLE = { color: 'var(--ash)' };
const IDLE_STYLE = { border: '0.5px solid var(--border-md)', color: 'var(--ash)', background: 'var(--porcelain)' };
const ACTIVE_STYLE = { border: '1.5px solid var(--pb)', color: 'var(--pb)', background: 'var(--pb-light, #e6f7f9)' };

// Métodos que el cajero puede cobrar en caja (§7.3bis cantina.md): efectivo
// USD/VES sin aprobación previa, y transferencia/pago móvil/zelle solo
// cuando el representante paga presente mostrando el comprobante — todos
// aprobados al instante (RecargarTarjetaCajeroView), a diferencia del
// portal donde una recarga siempre queda 'pendiente'.
const METODOS = [
  { value: 'efectivo', label: 'Efectivo USD' },
  { value: 'efectivo_ves', label: 'Efectivo Bs.' },
  { value: 'transferencia', label: 'Transferencia' },
  { value: 'pago_movil', label: 'Pago Móvil' },
  { value: 'zelle', label: 'Zelle' },
];

const requiereBanco = (m) => m === 'transferencia' || m === 'pago_movil';
const requiereReferencia = (m) => m !== 'efectivo' && m !== 'efectivo_ves';
// Convención local de comprobantes bancarios (§5.9 cantina.md): 6 dígitos
// para transferencia/pago móvil. Zelle no tiene un formato fijo (número de
// confirmación alfanumérico), por eso no se restringe con el mismo regex.
const referenciaInvalida = (m, ref) => {
  if (m === 'transferencia' || m === 'pago_movil') return !/^\d{6}$/.test(ref || '');
  if (m === 'zelle') return !(ref || '').trim();
  return false;
};

// Moneda por defecto según método — el cajero puede cambiarla igual (§7.3bis
// pide selector explícito de moneda, no solo inferirla del método).
const monedaDefault = (m) => (m === 'efectivo_ves' || m === 'transferencia' || m === 'pago_movil' ? 'VES' : 'USD');

export default function RecargaCajeroModal({ onClose, onRecargada }) {
  // Búsqueda de tarjeta
  const [entradaTarjeta, setEntradaTarjeta] = useState('');
  const [buscando, setBuscando] = useState(false);
  const [errorBusqueda, setErrorBusqueda] = useState('');
  const [tarjeta, setTarjeta] = useState(null);

  // Formulario de recarga
  const [metodoPago, setMetodoPago] = useState('efectivo');
  const [moneda, setMoneda] = useState('USD');
  const [monto, setMonto] = useState('');
  const [bancos, setBancos] = useState([]);
  const [tasaVigente, setTasaVigente] = useState(0);
  const [bancoReceptorId, setBancoReceptorId] = useState('');
  const [bancoProcedencia, setBancoProcedencia] = useState('');
  const [referencia, setReferencia] = useState('');
  const [tocado, setTocado] = useState({});
  const [enviando, setEnviando] = useState(false);

  const abortRef = useRef(null);

  useEffect(() => {
    const controller = new AbortController();
    getBancosCantina(controller.signal)
      .then(res => setBancos(res.data || []))
      .catch(err => {
        if (err.name === 'CanceledError' || err.code === 'ERR_CANCELED') return;
        // No bloquea el modal — el selector de banco simplemente queda vacío.
      });
    return () => controller.abort();
  }, []);

  // El backend (RecargaTarjetaSerializer) solo acepta monto_usd — monto_ves
  // es siempre derivado ahí con la tasa vigente al crear. Para que el
  // cajero pueda cobrar en Bs. igual, se trae la tasa acá y se convierte
  // ANTES de enviar (nunca se manda monto_ves al backend).
  useEffect(() => {
    const controller = new AbortController();
    getTasaVigenteCantina(controller.signal)
      .then(res => setTasaVigente(Number(res.data?.valor_bs) || 0))
      .catch(err => {
        if (err.name === 'CanceledError' || err.code === 'ERR_CANCELED') return;
        // Sin tasa: el selector de moneda VES queda inutilizable (ver validar()).
      });
    return () => controller.abort();
  }, []);

  const handleBuscarTarjeta = async () => {
    const valor = entradaTarjeta.trim();
    if (!valor) {
      toast.warning('Escanea el código QR o escribe el serial de la tarjeta.');
      return;
    }
    setBuscando(true);
    setErrorBusqueda('');
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const query = /^CANT-/i.test(valor) ? { codigo: valor } : { serial: valor };
      const res = await buscarTarjetaActiva(query, controller.signal);
      setTarjeta(res.data);
    } catch (err) {
      if (err.name === 'CanceledError' || err.code === 'ERR_CANCELED') return;
      if (err.response?.status === 404) {
        setErrorBusqueda('No se encontró ninguna tarjeta activa con ese código/serial.');
      } else {
        setErrorBusqueda(err.response?.data?.detail || 'No se pudo buscar la tarjeta.');
      }
    } finally {
      setBuscando(false);
    }
  };

  const handleCambiarMetodo = (m) => {
    setMetodoPago(m);
    setMoneda(monedaDefault(m));
    if (!requiereBanco(m)) { setBancoReceptorId(''); setBancoProcedencia(''); }
    setReferencia('');
    setTocado({});
  };

  const cambiarTarjeta = () => {
    setTarjeta(null);
    setEntradaTarjeta('');
    setErrorBusqueda('');
  };

  const marcarTocado = (campo) => setTocado(p => ({ ...p, [campo]: true }));

  const validar = () => {
    const n = parseFloat(monto);
    if (!monto || Number.isNaN(n) || n <= 0) {
      toast.warning('Ingresa un monto válido mayor a 0.');
      return false;
    }
    if (moneda === 'VES' && !(tasaVigente > 0)) {
      toast.warning('No hay una tasa de cambio vigente registrada — no se puede convertir el monto a USD.');
      return false;
    }
    if (requiereBanco(metodoPago) && !bancoReceptorId) {
      toast.warning('Selecciona el banco receptor.');
      return false;
    }
    if (requiereReferencia(metodoPago) && referenciaInvalida(metodoPago, referencia)) {
      toast.warning(
        metodoPago === 'zelle'
          ? 'Ingresa el número de confirmación de Zelle.'
          : 'La referencia debe tener exactamente 6 dígitos numéricos.'
      );
      return false;
    }
    return true;
  };

  const handleConfirmar = async () => {
    if (!tarjeta?.id) return;
    setTocado({ banco: true, referencia: true });
    if (!validar()) return;
    if (enviando) return; // evita doble submit

    setEnviando(true);
    const n = parseFloat(monto);
    // El backend (RecargaTarjetaSerializer) solo acepta monto_usd — monto_ves
    // es read_only, siempre derivado ahí con la tasa vigente. Si el cajero
    // cobró en Bs., se convierte a USD acá con la misma tasa que se le
    // mostró (getTasaVigenteCantina), nunca se envía monto_ves.
    // Nombres de campo confirmados contra RecargaTarjetaSerializer real
    // (cantina/serializers.py): FK planas sin sufijo '_id' (mismo criterio
    // que TarjetaPrepagoSerializer/ProductoCantinaSerializer).
    const montoUsd = moneda === 'USD' ? n : n / tasaVigente;
    const payload = {
      tarjeta: tarjeta.id,
      metodo_pago: metodoPago,
      monto_usd: montoUsd.toFixed(2),
      banco_receptor: requiereBanco(metodoPago) ? bancoReceptorId || null : null,
      banco_procedencia: requiereBanco(metodoPago) ? bancoProcedencia || '' : '',
      referencia: requiereReferencia(metodoPago) ? referencia.trim() : '',
    };
    try {
      await recargarTarjetaCajero(payload);
      toast.success(`Recarga de ${moneda === 'USD' ? '$' : 'Bs.'}${monto} aplicada correctamente.`);
      onRecargada?.();
      onClose();
    } catch (err) {
      if (err.name === 'CanceledError' || err.code === 'ERR_CANCELED') return;
      // Mensaje EXACTO del backend (ej. referencia duplicada cruzada con
      // cobranza) — no se reinventa el texto (§5.9/consigna de la tarea).
      const data = err.response?.data || {};
      const msg = data.detail || data.referencia?.[0] || data.non_field_errors?.[0]
        || 'No se pudo registrar la recarga.';
      toast.error(msg);
    } finally {
      setEnviando(false);
    }
  };

  const handleClose = () => { if (!enviando) onClose(); };

  const footer = (
    <>
      <button
        onClick={handleClose}
        disabled={enviando}
        className="w-full sm:w-auto rounded-xl py-2.5 text-sm min-h-[44px] disabled:opacity-40"
        style={{ border: '0.5px solid var(--border-md)', color: 'var(--ash)' }}
      >
        Cancelar
      </button>
      {tarjeta && (
        <button
          onClick={handleConfirmar}
          disabled={enviando}
          className="w-full sm:w-auto text-white rounded-xl py-2.5 text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2 min-h-[44px]"
          style={{ background: 'var(--pb)' }}
        >
          {enviando ? <><Loader2 size={14} className="animate-spin" /> Recargando...</> : 'Confirmar recarga'}
        </button>
      )}
    </>
  );

  return (
    <Modal
      open
      onClose={handleClose}
      titulo={(
        <>
          <Wallet size={17} />
          Recargar tarjeta
        </>
      )}
      footer={footer}
      size="md"
    >
      {!tarjeta ? (
        <div className="space-y-3">
          <label className="block text-[11px] uppercase tracking-widest" style={LABEL_STYLE}>
            Código QR o serial de la tarjeta
          </label>
          <div className="flex gap-2">
            <input
              autoFocus
              className="flex-1 px-3 py-2 rounded-lg text-sm outline-none min-h-[44px]"
              style={FIELD_STYLE}
              value={entradaTarjeta}
              onChange={e => { setEntradaTarjeta(e.target.value); setErrorBusqueda(''); }}
              onKeyDown={e => { if (e.key === 'Enter') handleBuscarTarjeta(); }}
              placeholder="CANT-7K9M2XQPRT o L003-0007"
            />
            <button
              onClick={handleBuscarTarjeta}
              disabled={buscando}
              className="px-4 rounded-xl text-sm font-medium text-white flex items-center gap-1.5 disabled:opacity-50 min-h-[44px]"
              style={{ background: 'var(--pb)' }}
            >
              {buscando ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
              Buscar
            </button>
          </div>
          {errorBusqueda && (
            <p className="text-sm flex items-center gap-1.5" style={{ color: 'var(--red, #dc2626)' }}>
              <AlertTriangle size={14} /> {errorBusqueda}
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-lg px-3 py-2.5 text-sm flex items-center justify-between gap-2" style={{ background: 'var(--pb-light, #e6f7f9)', color: 'var(--pb-mid, #0c7a86)' }}>
            <span className="flex items-center gap-2">
              <UserRound size={16} />
              {tarjeta.alumno?.nombre
                ? `${tarjeta.alumno.nombre} ${tarjeta.alumno.apellido || ''}`.trim()
                : `Tarjeta ${tarjeta.serial}`}
            </span>
            <span className="font-semibold" style={{ color: tarjeta.saldo < 0 ? 'var(--red, #dc2626)' : 'var(--pb-mid, #0c7a86)' }}>
              Saldo: ${Number(tarjeta.saldo ?? 0).toFixed(2)}
            </span>
          </div>
          <button onClick={cambiarTarjeta} disabled={enviando} className="text-xs -mt-2" style={{ color: 'var(--ash)' }}>
            Cambiar tarjeta
          </button>

          {/* Método de pago */}
          <div>
            <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={LABEL_STYLE}>Método de pago</label>
            <div className="grid grid-cols-3 gap-1.5">
              {METODOS.map(m => (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => handleCambiarMetodo(m.value)}
                  disabled={enviando}
                  className="py-2 px-2 rounded-lg text-xs font-medium min-h-[40px]"
                  style={metodoPago === m.value ? ACTIVE_STYLE : IDLE_STYLE}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          {/* Monto + moneda */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={LABEL_STYLE}>Monto</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold" style={{ color: 'var(--ash)' }}>
                  {moneda === 'USD' ? '$' : 'Bs.'}
                </span>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  className="w-full pl-9 pr-3 py-2 rounded-lg text-sm font-semibold outline-none min-h-[44px]"
                  style={FIELD_STYLE}
                  value={monto}
                  onChange={e => setMonto(e.target.value)}
                  placeholder="0.00"
                  disabled={enviando}
                />
              </div>
            </div>
            <div>
              <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={LABEL_STYLE}>Moneda</label>
              <div className="flex gap-1.5">
                {['USD', 'VES'].map(mo => (
                  <button
                    key={mo}
                    type="button"
                    onClick={() => setMoneda(mo)}
                    disabled={enviando}
                    className="px-3 py-2 rounded-lg text-xs font-medium min-h-[44px]"
                    style={moneda === mo ? ACTIVE_STYLE : IDLE_STYLE}
                  >
                    {mo}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Datos bancarios / referencia según método (§5.9 cantina.md) */}
          {requiereBanco(metodoPago) && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={LABEL_STYLE}>Banco receptor</label>
                <select
                  className="w-full px-3 py-2 rounded-lg text-sm outline-none min-h-[44px]"
                  style={{
                    ...FIELD_STYLE,
                    border: tocado.banco && !bancoReceptorId ? '1px solid #ef4444' : FIELD_STYLE.border,
                  }}
                  value={bancoReceptorId}
                  onChange={e => setBancoReceptorId(e.target.value)}
                  onBlur={() => marcarTocado('banco')}
                  disabled={enviando}
                >
                  <option value="">Seleccionar banco…</option>
                  {bancos.map(b => <option key={b.id} value={b.id}>{b.nombre}</option>)}
                </select>
                {tocado.banco && !bancoReceptorId && (
                  <p className="text-[11px] mt-1" style={{ color: '#ef4444' }}>Selecciona un banco</p>
                )}
              </div>
              <div>
                <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={LABEL_STYLE}>Banco de procedencia</label>
                <input
                  className="w-full px-3 py-2 rounded-lg text-sm outline-none min-h-[44px]"
                  style={FIELD_STYLE}
                  value={bancoProcedencia}
                  onChange={e => setBancoProcedencia(e.target.value)}
                  placeholder="Banco del representante"
                  disabled={enviando}
                />
              </div>
            </div>
          )}

          {requiereReferencia(metodoPago) && (
            <div>
              <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={LABEL_STYLE}>
                {metodoPago === 'zelle' ? 'Número de confirmación Zelle' : 'Referencia (6 dígitos)'}
              </label>
              <input
                type="text"
                className="w-full px-3 py-2 rounded-lg text-sm outline-none min-h-[44px]"
                style={{
                  ...FIELD_STYLE,
                  border: tocado.referencia && referenciaInvalida(metodoPago, referencia) ? '1px solid #ef4444' : FIELD_STYLE.border,
                }}
                value={referencia}
                onChange={e => setReferencia(
                  metodoPago === 'zelle' ? e.target.value : e.target.value.replace(/\D/g, '').slice(0, 6)
                )}
                onBlur={() => marcarTocado('referencia')}
                maxLength={metodoPago === 'zelle' ? 100 : 6}
                placeholder={metodoPago === 'zelle' ? 'Ej: ZL-2026-XXXXXXXX' : 'Ej: 123456'}
                disabled={enviando}
              />
              {tocado.referencia && referenciaInvalida(metodoPago, referencia) && (
                <p className="text-[11px] mt-1" style={{ color: '#ef4444' }}>
                  {metodoPago === 'zelle' ? 'Ingresa el número de confirmación.' : 'Debe tener exactamente 6 dígitos numéricos.'}
                </p>
              )}
            </div>
          )}

          {(metodoPago === 'efectivo' || metodoPago === 'efectivo_ves') && (
            <div className="rounded-lg px-3 py-2.5 text-xs flex items-center gap-2" style={{ background: 'var(--porcelain)', color: 'var(--ash)' }}>
              <CheckCircle2 size={14} />
              Recibido en caja — sin datos bancarios, aprobación instantánea.
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
