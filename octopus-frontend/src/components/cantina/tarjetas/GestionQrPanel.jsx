import { useEffect, useRef, useState } from 'react';
import { toast } from 'react-toastify';
import {
  AlertTriangle, ArrowLeft, CheckCircle2, CreditCard, Loader2,
  RefreshCw, ScanLine, Search, UserRound, Wallet,
} from 'lucide-react';
import {
  asignarTarjeta,
  asignarYRecargarTarjeta,
  buscarTarjetaOperacion,
  getBancosCantina,
  getTasaVigenteCantina,
  recargarTarjetaCajero,
} from '../../../api/cantina.service';
import BuscadorRepresentanteCxc from '../cxc/BuscadorRepresentanteCxc';
import { nombreCompleto, TIPO_LABELS } from '../cxc/utilsCxc';

const FIELD_STYLE = {
  border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)', fontSize: '16px',
};
const METODOS = [
  { value: 'efectivo', label: 'Efectivo USD' },
  { value: 'efectivo_ves', label: 'Efectivo Bs.' },
  { value: 'transferencia', label: 'Transferencia' },
  { value: 'pago_movil', label: 'Pago móvil' },
  { value: 'punto_de_venta', label: 'Punto de venta' },
  { value: 'zelle', label: 'Zelle' },
];
const ESTADO_LABELS = {
  sin_asignar: 'Sin asignar', activa: 'Activa', bloqueada: 'Bloqueada', extraviada: 'Extraviada',
};
const ES_SERIAL = /^L\d+-\d+$/i;
const requiereBanco = metodo => ['transferencia', 'pago_movil', 'punto_de_venta'].includes(metodo);
const requiereReferencia = metodo => !['efectivo', 'efectivo_ves'].includes(metodo);
const monedaDefault = metodo => (
  ['efectivo_ves', 'transferencia', 'pago_movil', 'punto_de_venta'].includes(metodo) ? 'VES' : 'USD'
);

function mensajeError(err, fallback) {
  const data = err.response?.data || {};
  return data.detail || data.referencia?.[0] || data.non_field_errors?.[0] || fallback;
}

function TarjetaResumen({ tarjeta }) {
  const disponible = Number(tarjeta.saldo || 0) + Number(tarjeta.limite_credito || 0);
  return (
    <div
      className="rounded-2xl p-4 grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-4"
      style={{ background: 'var(--pb-light)', border: '0.5px solid var(--border-md)' }}
    >
      <div className="flex items-start gap-3 min-w-0">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: '#fff', color: 'var(--pb)' }}>
          <CreditCard size={19} />
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold break-words" style={{ color: 'var(--jet)' }}>
              {tarjeta.titular_nombre || 'Tarjeta disponible'}
            </p>
            <span className="px-2 py-0.5 rounded-full text-xs font-medium" style={{ background: '#fff', color: 'var(--pb)' }}>
              {ESTADO_LABELS[tarjeta.estado] || tarjeta.estado}
            </span>
          </div>
          <p className="text-sm mt-1" style={{ color: 'var(--ash)' }}>
            {[tarjeta.alumno_grado_seccion || TIPO_LABELS[tarjeta.titular_tipo], tarjeta.serial].filter(Boolean).join(' · ')}
          </p>
        </div>
      </div>
      {tarjeta.estado !== 'sin_asignar' && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-right">
          <div><p className="text-xs" style={{ color: 'var(--ash)' }}>Saldo</p><p className="font-semibold" style={{ color: 'var(--jet)' }}>${Number(tarjeta.saldo || 0).toFixed(2)}</p></div>
          <div><p className="text-xs" style={{ color: 'var(--ash)' }}>Crédito</p><p className="font-semibold" style={{ color: 'var(--jet)' }}>${Number(tarjeta.limite_credito || 0).toFixed(2)}</p></div>
          <div className="col-span-2 sm:col-span-1"><p className="text-xs" style={{ color: 'var(--ash)' }}>Disponible</p><p className="font-semibold" style={{ color: 'var(--teal)' }}>${disponible.toFixed(2)}</p></div>
        </div>
      )}
    </div>
  );
}

function RecargaFormulario({ onSubmit, enviando, textoBoton }) {
  const [requestId] = useState(() => crypto.randomUUID());
  const [metodo, setMetodo] = useState('efectivo');
  const [moneda, setMoneda] = useState('USD');
  const [monto, setMonto] = useState('');
  const [bancos, setBancos] = useState([]);
  const [tasa, setTasa] = useState(0);
  const [bancoReceptor, setBancoReceptor] = useState('');
  const [referencia, setReferencia] = useState('');
  const [numeroLote, setNumeroLote] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    Promise.allSettled([
      getBancosCantina(controller.signal).then(res => setBancos(res.data || [])),
      getTasaVigenteCantina(controller.signal).then(res => setTasa(Number(res.data?.valor_bs) || 0)),
    ]);
    return () => controller.abort();
  }, []);

  const cambiarMetodo = value => {
    setMetodo(value);
    setMoneda(monedaDefault(value));
    setBancoReceptor('');
    setReferencia('');
    setNumeroLote('');
  };

  const confirmar = () => {
    const valor = Number(monto);
    if (!(valor > 0)) return toast.warning('Ingresa un monto válido mayor a cero.');
    if (moneda === 'VES' && !(tasa > 0)) return toast.warning('No hay una tasa BCV disponible para convertir el monto.');
    if (requiereBanco(metodo) && !bancoReceptor) return toast.warning('Selecciona el banco receptor.');
    if (['transferencia', 'pago_movil'].includes(metodo) && !/^\d{6}$/.test(referencia)) {
      return toast.warning('La referencia debe tener exactamente 6 dígitos.');
    }
    if (metodo === 'punto_de_venta' && !/^\d{4}$/.test(referencia)) {
      return toast.warning('La referencia del punto de venta debe tener exactamente 4 dígitos.');
    }
    if (metodo === 'punto_de_venta' && !/^\d{4}$/.test(numeroLote)) {
      return toast.warning('El lote del punto de venta debe tener exactamente 4 dígitos.');
    }
    if (metodo === 'zelle' && !referencia.trim()) return toast.warning('Ingresa el número de confirmación de Zelle.');

    const montoUsd = moneda === 'USD' ? valor : valor / tasa;
    return onSubmit({
      client_request_id: requestId,
      metodo_pago: metodo,
      monto_usd: montoUsd.toFixed(2),
      banco_receptor: requiereBanco(metodo) ? bancoReceptor : null,
      referencia: requiereReferencia(metodo) ? referencia.trim() : '',
      numero_lote: metodo === 'punto_de_venta' ? numeroLote : '',
    }, { moneda, monto: valor, montoUsd });
  };

  return (
    <div className="space-y-4">
      <div>
        <span className="block text-xs uppercase tracking-widest mb-2" style={{ color: 'var(--ash)' }}>Método de pago</span>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
          {METODOS.map(item => (
            <button
              key={item.value}
              type="button"
              onClick={() => cambiarMetodo(item.value)}
              disabled={enviando}
              className="px-3 py-2.5 rounded-xl text-sm font-medium min-h-[44px]"
              style={metodo === item.value
                ? { border: '1.5px solid var(--pb)', color: 'var(--pb)', background: 'var(--pb-light)' }
                : { border: '0.5px solid var(--border-md)', color: 'var(--ash)', background: '#fff' }}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label htmlFor="gestion-qr-monto" className="block text-xs uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>Monto recibido</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold" style={{ color: 'var(--ash)' }}>{moneda === 'USD' ? '$' : 'Bs.'}</span>
            <input
              id="gestion-qr-monto"
              type="number"
              min="0.01"
              step="0.01"
              value={monto}
              onChange={e => setMonto(e.target.value)}
              disabled={enviando}
              placeholder="0.00"
              className="w-full pl-10 pr-3 py-2.5 rounded-xl outline-none min-h-[44px] font-semibold"
              style={FIELD_STYLE}
            />
          </div>
          {moneda === 'VES' && tasa > 0 && Number(monto) > 0 && (
            <p className="text-xs mt-1.5" style={{ color: 'var(--teal)' }}>
              Se acreditarán ${(Number(monto) / tasa).toFixed(2)} · Tasa BCV: Bs. {tasa.toFixed(2)}
            </p>
          )}
        </div>
        <div>
          <span className="block text-xs uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>Moneda</span>
          <div className="grid grid-cols-2 gap-2">
            {['USD', 'VES'].map(value => (
              <button
                key={value}
                type="button"
                onClick={() => setMoneda(value)}
                disabled={enviando}
                className="px-3 py-2.5 rounded-xl text-sm font-medium min-h-[44px]"
                style={moneda === value
                  ? { border: '1.5px solid var(--teal)', color: 'var(--teal)', background: 'var(--teal-light)' }
                  : { border: '0.5px solid var(--border-md)', color: 'var(--ash)', background: 'var(--porcelain)' }}
              >
                {value}
              </button>
            ))}
          </div>
        </div>
      </div>

      {requiereBanco(metodo) && (
        <div>
            <label htmlFor="gestion-qr-banco" className="block text-xs uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>Banco receptor</label>
            <select id="gestion-qr-banco" value={bancoReceptor} onChange={e => setBancoReceptor(e.target.value)} disabled={enviando} className="w-full px-3 py-2.5 rounded-xl outline-none min-h-[44px]" style={FIELD_STYLE}>
              <option value="">Seleccionar banco…</option>
              {bancos.map(banco => <option key={banco.id} value={banco.id}>{banco.nombre}</option>)}
            </select>
        </div>
      )}

      {requiereReferencia(metodo) && (
        <div className={metodo === 'punto_de_venta' ? 'grid grid-cols-1 sm:grid-cols-2 gap-3' : ''}>
          <div>
          <label htmlFor="gestion-qr-referencia" className="block text-xs uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>
            {metodo === 'zelle' ? 'Confirmación Zelle' : `Referencia (${metodo === 'punto_de_venta' ? 4 : 6} dígitos)`}
          </label>
          <input
            id="gestion-qr-referencia"
            value={referencia}
            onChange={e => setReferencia(metodo === 'zelle' ? e.target.value : e.target.value.replace(/\D/g, '').slice(0, metodo === 'punto_de_venta' ? 4 : 6))}
            disabled={enviando}
            maxLength={metodo === 'zelle' ? 100 : metodo === 'punto_de_venta' ? 4 : 6}
            placeholder={metodo === 'zelle' ? 'Ej: ZL-2026-XXXXXXXX' : metodo === 'punto_de_venta' ? 'Ej: 1234' : 'Ej: 123456'}
            className="w-full px-3 py-2.5 rounded-xl outline-none min-h-[44px]"
            style={FIELD_STYLE}
          />
          </div>
          {metodo === 'punto_de_venta' && (
            <div>
              <label htmlFor="gestion-qr-lote" className="block text-xs uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>Lote (4 dígitos)</label>
              <input id="gestion-qr-lote" value={numeroLote} onChange={e => setNumeroLote(e.target.value.replace(/\D/g, '').slice(0, 4))} disabled={enviando} inputMode="numeric" maxLength={4} placeholder="0000" className="w-full px-3 py-2.5 rounded-xl outline-none min-h-[44px]" style={FIELD_STYLE} />
            </div>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={confirmar}
        disabled={enviando}
        className="w-full sm:w-auto px-5 py-3 rounded-xl text-sm font-semibold text-white min-h-[46px] flex items-center justify-center gap-2 disabled:opacity-50"
        style={{ background: 'var(--pb)' }}
      >
        {enviando ? <><Loader2 size={16} className="animate-spin" /> Procesando…</> : <><Wallet size={16} /> {textoBoton}</>}
      </button>
    </div>
  );
}

export default function GestionQrPanel({ onOperacionCompletada, onReponer }) {
  const [entrada, setEntrada] = useState('');
  const [buscando, setBuscando] = useState(false);
  const [resultados, setResultados] = useState([]);
  const [tarjeta, setTarjeta] = useState(null);
  const [tipoTitular, setTipoTitular] = useState('alumno');
  const [cuenta, setCuenta] = useState(null);
  const [alumnoId, setAlumnoId] = useState('');
  const [incluirRecarga, setIncluirRecarga] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [resultadoFinal, setResultadoFinal] = useState(null);
  const abortRef = useRef(null);

  const reiniciar = () => {
    abortRef.current?.abort();
    setEntrada('');
    setResultados([]);
    setTarjeta(null);
    setCuenta(null);
    setAlumnoId('');
    setTipoTitular('alumno');
    setIncluirRecarga(true);
    setResultadoFinal(null);
  };

  const seleccionarTarjeta = value => {
    setTarjeta(value);
    setResultados([]);
    setCuenta(null);
    setAlumnoId('');
  };

  const buscar = async () => {
    const valor = entrada.trim();
    if (!valor) return toast.warning('Escanea el QR o escribe un serial, nombre o cédula.');
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setBuscando(true);
    setResultados([]);
    try {
      const query = /CANT-/i.test(valor) ? { codigo: valor } : ES_SERIAL.test(valor) ? { serial: valor } : { nombre: valor };
      const res = await buscarTarjetaOperacion(query, controller.signal);
      if (res.data?.resultados) {
        setResultados(res.data.resultados);
        if (!res.data.resultados.length) toast.info('No se encontraron tarjetas para esa búsqueda.');
      } else {
        seleccionarTarjeta(res.data);
      }
    } catch (err) {
      if (err.name !== 'CanceledError' && err.code !== 'ERR_CANCELED') toast.error(mensajeError(err, 'No se pudo buscar la tarjeta.'));
    } finally {
      setBuscando(false);
    }
  };

  const titularPayload = tipoTitular === 'cliente'
    ? (cuenta?.id ? { cliente_id: cuenta.id } : null)
    : (alumnoId ? { alumno_id: alumnoId } : null);

  const completar = (tarjetaActualizada, datos = {}) => {
    setResultadoFinal({ tarjeta: tarjetaActualizada, ...datos });
    setTarjeta(tarjetaActualizada);
    onOperacionCompletada?.(tarjetaActualizada);
  };

  const asignarSinRecarga = async () => {
    if (!titularPayload) return toast.warning('Selecciona la persona que recibirá la tarjeta.');
    setEnviando(true);
    try {
      const res = await asignarTarjeta(tarjeta.id, titularPayload);
      completar(res.data, { tipo: 'asignacion' });
      toast.success('Tarjeta asignada correctamente.');
    } catch (err) {
      toast.error(mensajeError(err, 'No se pudo asignar la tarjeta.'));
    } finally {
      setEnviando(false);
    }
  };

  const asignarConRecarga = async (recarga, resumen) => {
    if (!titularPayload) return toast.warning('Selecciona la persona que recibirá la tarjeta.');
    setEnviando(true);
    try {
      const res = await asignarYRecargarTarjeta(tarjeta.id, { ...titularPayload, recarga });
      completar(res.data.tarjeta, { tipo: 'asignacion_recarga', resumen });
      toast.success('Tarjeta asignada y recargada correctamente.');
    } catch (err) {
      toast.error(mensajeError(err, 'No se pudo completar la asignación y recarga.'));
    } finally {
      setEnviando(false);
    }
  };

  const recargar = async (recarga, resumen) => {
    setEnviando(true);
    try {
      await recargarTarjetaCajero({ tarjeta: tarjeta.id, ...recarga });
      const actualizada = { ...tarjeta, saldo: (Number(tarjeta.saldo || 0) + resumen.montoUsd).toFixed(2) };
      completar(actualizada, { tipo: 'recarga', resumen });
      toast.success('Recarga aplicada correctamente.');
    } catch (err) {
      toast.error(mensajeError(err, 'No se pudo registrar la recarga.'));
    } finally {
      setEnviando(false);
    }
  };

  const elegirCuenta = value => {
    setCuenta(value);
    setAlumnoId(value?.alumnos?.length === 1 ? value.alumnos[0].id : '');
  };

  const paso = resultadoFinal ? 3 : tarjeta ? 2 : 1;

  return (
    <section className="rounded-2xl overflow-hidden" style={{ background: '#fff', border: '0.5px solid var(--border-md)' }}>
      <div className="p-5 sm:p-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between" style={{ borderBottom: '0.5px solid var(--border-md)' }}>
        <div>
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'var(--pb-light)', color: 'var(--pb)' }}><ScanLine size={18} /></div>
            <div><h2 className="font-semibold" style={{ color: 'var(--jet)' }}>Gestión rápida de QR</h2><p className="text-sm" style={{ color: 'var(--ash)' }}>Escanea una vez para asignar o recargar.</p></div>
          </div>
        </div>
        <div className="flex items-center gap-2" aria-label={`Paso ${paso} de 3`}>
          {['Identificar', 'Gestionar', 'Listo'].map((label, index) => (
            <div key={label} className="flex items-center gap-1.5">
              <span className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold" style={paso >= index + 1 ? { background: 'var(--pb)', color: '#fff' } : { background: 'var(--porcelain)', color: 'var(--ash)' }}>{index + 1}</span>
              <span className="hidden sm:inline text-xs" style={{ color: paso >= index + 1 ? 'var(--jet)' : 'var(--ash)' }}>{label}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="p-5 sm:p-6">
        {!tarjeta && !resultadoFinal && (
          <div className="max-w-3xl mx-auto py-3 sm:py-8">
            <label htmlFor="gestion-qr-busqueda" className="block text-xs uppercase tracking-widest mb-2" style={{ color: 'var(--ash)' }}>QR, serial, nombre o cédula</label>
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <ScanLine size={18} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--pb)' }} />
                <input id="gestion-qr-busqueda" autoFocus value={entrada} onChange={e => { setEntrada(e.target.value); setResultados([]); }} onKeyDown={e => { if (e.key === 'Enter') buscar(); }} placeholder="Escanea el QR o busca a la persona" className="w-full pl-10 pr-3 py-3 rounded-xl outline-none min-h-[48px]" style={FIELD_STYLE} />
              </div>
              <button type="button" onClick={buscar} disabled={buscando} className="px-5 py-3 rounded-xl text-sm font-semibold text-white min-h-[48px] flex items-center justify-center gap-2 disabled:opacity-50" style={{ background: 'var(--pb)' }}>
                {buscando ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />} Buscar
              </button>
            </div>
            <p className="text-xs mt-2" style={{ color: 'var(--ash)' }}>El lector puede enviar el código directamente con Enter.</p>

            {resultados.length > 0 && (
              <div className="mt-4 rounded-xl overflow-hidden" style={{ border: '0.5px solid var(--border-md)' }}>
                {resultados.map(item => (
                  <button key={item.id} type="button" onClick={() => seleccionarTarjeta(item)} className="w-full px-4 py-3 flex items-center justify-between gap-3 text-left hover:bg-black/5" style={{ borderBottom: '0.5px solid var(--border-md)' }}>
                    <span className="min-w-0"><span className="block text-sm font-medium" style={{ color: 'var(--jet)' }}>{item.titular_nombre}</span><span className="block text-xs" style={{ color: 'var(--ash)' }}>{[item.alumno_grado_seccion || TIPO_LABELS[item.titular_tipo], item.representante_nombre, item.serial].filter(Boolean).join(' · ')}</span></span>
                    <span className="text-sm font-semibold shrink-0" style={{ color: 'var(--teal)' }}>${Number(item.saldo || 0).toFixed(2)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {tarjeta && !resultadoFinal && (
          <div className="space-y-5">
            <div className="flex items-center justify-between gap-3">
              <button type="button" onClick={reiniciar} className="text-sm flex items-center gap-1.5" style={{ color: 'var(--ash)' }}><ArrowLeft size={15} /> Cambiar tarjeta</button>
              <span className="font-mono text-xs" style={{ color: 'var(--ash)' }}>{tarjeta.codigo}</span>
            </div>
            <TarjetaResumen tarjeta={tarjeta} />

            {tarjeta.estado === 'sin_asignar' && (
              <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] gap-5">
                <div className="rounded-2xl p-4 sm:p-5 space-y-4" style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)' }}>
                  <div><h3 className="font-semibold flex items-center gap-2" style={{ color: 'var(--jet)' }}><UserRound size={17} style={{ color: 'var(--pb)' }} /> ¿Quién recibirá la tarjeta?</h3><p className="text-sm mt-1" style={{ color: 'var(--ash)' }}>Busca por nombre, apellido o cédula.</p></div>
                  <div className="grid grid-cols-2 gap-2">
                    {[['alumno', 'Alumno'], ['cliente', 'Personal / otro']].map(([value, label]) => (
                      <button key={value} type="button" onClick={() => { setTipoTitular(value); setCuenta(null); setAlumnoId(''); }} className="px-3 py-2.5 rounded-xl text-sm font-medium min-h-[44px]" style={tipoTitular === value ? { border: '1.5px solid var(--pb)', background: 'var(--pb-light)', color: 'var(--pb)' } : { border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--ash)' }}>{label}</button>
                    ))}
                  </div>
                  <BuscadorRepresentanteCxc
                    key={tipoTitular}
                    paraVenta
                    soloRepresentantes={tipoTitular === 'alumno'}
                    soloClientes={tipoTitular === 'cliente'}
                    permitirAgregarCliente={tipoTitular === 'cliente'}
                    placeholder={tipoTitular === 'alumno' ? 'Representante, alumno o cédula…' : 'Personal, nombre o cédula…'}
                    onSelect={elegirCuenta}
                  />
                  {cuenta && (
                    <div className="rounded-xl p-3" style={{ background: '#fff', border: '0.5px solid var(--border-md)' }}>
                      <p className="text-sm font-medium" style={{ color: 'var(--jet)' }}>{nombreCompleto(cuenta)}</p>
                      <p className="text-xs" style={{ color: 'var(--ash)' }}>{TIPO_LABELS[cuenta.tipo] || 'Representante'} · C.I. {cuenta.cedula || cuenta.documento || '—'}</p>
                    </div>
                  )}
                  {tipoTitular === 'alumno' && cuenta?.alumnos?.length > 0 && (
                    <div className="space-y-2">
                      <span className="block text-xs uppercase tracking-widest" style={{ color: 'var(--ash)' }}>Selecciona el alumno</span>
                      {cuenta.alumnos.map(alumno => (
                        <label key={alumno.id} className="flex items-center gap-3 p-3 rounded-xl cursor-pointer" style={String(alumnoId) === String(alumno.id) ? { border: '1.5px solid var(--pb)', background: 'var(--pb-light)' } : { border: '0.5px solid var(--border-md)', background: '#fff' }}>
                          <input type="radio" name="gestion-qr-alumno" checked={String(alumnoId) === String(alumno.id)} onChange={() => setAlumnoId(alumno.id)} />
                          <span className="text-sm" style={{ color: 'var(--jet)' }}>{nombreCompleto(alumno)}{alumno.grado_seccion ? ` · ${alumno.grado_seccion}` : ''}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>

                <div className="rounded-2xl p-4 sm:p-5 space-y-4" style={{ border: '0.5px solid var(--border-md)' }}>
                  <div className="flex items-start justify-between gap-3">
                    <div><h3 className="font-semibold flex items-center gap-2" style={{ color: 'var(--jet)' }}><Wallet size={17} style={{ color: 'var(--teal)' }} /> Recarga inicial</h3><p className="text-sm mt-1" style={{ color: 'var(--ash)' }}>Opcional. Puedes entregar la tarjeta con saldo disponible.</p></div>
                    <button type="button" role="switch" aria-checked={incluirRecarga} onClick={() => setIncluirRecarga(v => !v)} className="relative w-12 h-7 rounded-full shrink-0" style={{ background: incluirRecarga ? 'var(--teal)' : 'var(--border-md)' }}><span className={`absolute top-1 w-5 h-5 bg-white rounded-full transition-all ${incluirRecarga ? 'left-6' : 'left-1'}`} /></button>
                  </div>
                  {incluirRecarga ? (
                    <RecargaFormulario onSubmit={asignarConRecarga} enviando={enviando} textoBoton="Asignar y recargar" />
                  ) : (
                    <div className="rounded-xl p-4" style={{ background: 'var(--porcelain)' }}>
                      <p className="text-sm mb-3" style={{ color: 'var(--ash)' }}>La tarjeta quedará activa con saldo inicial de $0.00.</p>
                      <button type="button" onClick={asignarSinRecarga} disabled={enviando} className="w-full sm:w-auto px-5 py-3 rounded-xl text-sm font-semibold text-white min-h-[46px] flex items-center justify-center gap-2 disabled:opacity-50" style={{ background: 'var(--pb)' }}>{enviando ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />} Asignar tarjeta</button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {tarjeta.estado === 'activa' && (
              <div className="rounded-2xl p-4 sm:p-5" style={{ border: '0.5px solid var(--border-md)' }}>
                <div className="mb-4"><h3 className="font-semibold flex items-center gap-2" style={{ color: 'var(--jet)' }}><Wallet size={17} style={{ color: 'var(--teal)' }} /> Registrar recarga</h3><p className="text-sm mt-1" style={{ color: 'var(--ash)' }}>Confirma el monto y el medio de pago antes de acreditar.</p></div>
                <RecargaFormulario onSubmit={recargar} enviando={enviando} textoBoton="Confirmar recarga" />
              </div>
            )}

            {!['sin_asignar', 'activa'].includes(tarjeta.estado) && (
              <div className="rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4" style={{ background: 'var(--yellow-light)', border: '0.5px solid var(--border-md)' }}>
                <div className="flex items-start gap-3"><AlertTriangle size={20} className="shrink-0 mt-0.5" style={{ color: 'var(--amber-ink)' }} /><div><p className="font-semibold" style={{ color: 'var(--jet)' }}>Esta tarjeta no admite recargas</p><p className="text-sm mt-1" style={{ color: 'var(--ash)' }}>Está {ESTADO_LABELS[tarjeta.estado]?.toLowerCase() || tarjeta.estado}. Repónla para generar un QR válido conservando el saldo.</p></div></div>
                <button type="button" onClick={() => onReponer?.(tarjeta)} className="px-4 py-2.5 rounded-xl text-sm font-medium text-white shrink-0" style={{ background: 'var(--amber-ink)' }}>Reponer tarjeta</button>
              </div>
            )}
          </div>
        )}

        {resultadoFinal && (
          <div className="max-w-2xl mx-auto py-6 sm:py-10 text-center">
            <div className="w-16 h-16 rounded-full mx-auto flex items-center justify-center" style={{ background: 'var(--teal-light)', color: 'var(--teal)' }}><CheckCircle2 size={32} /></div>
            <h3 className="text-lg font-semibold mt-4" style={{ color: 'var(--jet)' }}>
              {resultadoFinal.tipo === 'asignacion' ? 'Tarjeta asignada' : resultadoFinal.tipo === 'recarga' ? 'Recarga completada' : 'Tarjeta asignada y recargada'}
            </h3>
            <p className="text-sm mt-1" style={{ color: 'var(--ash)' }}>{resultadoFinal.tarjeta.titular_nombre} · {resultadoFinal.tarjeta.serial}</p>
            <div className="grid grid-cols-2 gap-3 mt-5 text-left">
              <div className="rounded-xl p-3" style={{ background: 'var(--porcelain)' }}><p className="text-xs" style={{ color: 'var(--ash)' }}>Saldo actual</p><p className="text-lg font-semibold" style={{ color: 'var(--jet)' }}>${Number(resultadoFinal.tarjeta.saldo || 0).toFixed(2)}</p></div>
              <div className="rounded-xl p-3" style={{ background: 'var(--pb-light)' }}><p className="text-xs" style={{ color: 'var(--ash)' }}>Estado</p><p className="text-lg font-semibold" style={{ color: 'var(--pb)' }}>Activa</p></div>
            </div>
            <button type="button" onClick={reiniciar} className="mt-5 px-5 py-3 rounded-xl text-sm font-semibold text-white min-h-[46px] inline-flex items-center gap-2" style={{ background: 'var(--pb)' }}><RefreshCw size={16} /> Nueva operación</button>
          </div>
        )}
      </div>
    </section>
  );
}
