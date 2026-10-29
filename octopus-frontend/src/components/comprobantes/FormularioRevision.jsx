import { useEffect, useMemo, useState } from 'react';
import { toast } from 'react-toastify';
import { BadgeCheck, CircleAlert, CircleCheck, Loader2, TrendingUp, XCircle } from 'lucide-react';
import DatePickerES from '../DatePickerES';
import DecimalInput from '../DecimalInput';
import { ErrorCampo } from '../ui/ErrorCampo';
import { obtenerTasaComprobante } from '../../services/comprobantesRevisionService';
import {
  METODOS_PAGO, calcularAbono, formatearFecha, formatearMonto, hoyISO, monedaPorMetodo,
} from './comprobantesUtils';

const TIPOS_BANCO = ['transferencia', 'pago_movil', 'punto_de_venta', 'zelle'];
// Punto de venta exige número de lote en Pago y aquí no se pide: el backend
// lo rechaza, así que no se ofrece. El efectivo no pasa por ningún banco.
const METODOS_REVISION = METODOS_PAGO.filter((m) => m.value !== 'punto_de_venta');
const METODOS_SIN_BANCO = ['efectivo', 'efectivo_ves'];

const inputStyle = (conError) => ({
  border: `0.5px solid ${conError ? '#dc2626' : 'var(--border-md)'}`,
  background: 'var(--porcelain)',
  color: 'var(--jet)',
});
const inputClass = 'mt-1 w-full min-h-[44px] rounded-xl px-3 text-sm';

const formularioInicial = (comprobante) => ({
  referencia: comprobante?.referencia_bancaria || '',
  banco_receptor_id: comprobante?.banco_receptor_id ? String(comprobante.banco_receptor_id) : '',
  metodo_pago: comprobante?.metodo_pago || '',
  fecha_pago: '',
  moneda: comprobante?.metodo_pago ? monedaPorMetodo(comprobante.metodo_pago) : '',
  monto_recibido: '',
  observaciones: '',
});

const Campo = ({ etiqueta, error, children, className = '' }) => (
  <label className={`block text-sm font-medium ${className}`} style={{ color: 'var(--jet)' }}>
    {etiqueta}
    {children}
    <ErrorCampo msg={error} />
  </label>
);

const ResultadoAbono = ({ resultado, saldo }) => {
  if (!resultado) return null;
  const config = {
    completo: { Icono: CircleCheck, clase: 'border-green-200 bg-green-50 text-green-800', texto: 'Pago completo: la mensualidad queda saldada.' },
    parcial: { Icono: CircleAlert, clase: 'border-amber-200 bg-amber-50 text-amber-800', texto: `Pago parcial: queda un saldo de ${formatearMonto(resultado.restante)}.` },
    excedente: { Icono: TrendingUp, clase: 'border-blue-200 bg-blue-50 text-blue-800', texto: `Pago con excedente de ${formatearMonto(resultado.excedente)}: solo se aplicará el saldo de ${formatearMonto(saldo)}.` },
  }[resultado.tipo];
  const { Icono } = config;
  return (
    <p className={`flex items-start gap-2 rounded-xl border px-3 py-2.5 text-sm ${config.clase}`}>
      <Icono size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
      <span>{config.texto}</span>
    </p>
  );
};

/**
 * Formulario que llena el revisor: el representante solo sube el archivo,
 * los datos del pago los transcribe quien revisa. Todos son obligatorios
 * para aprobar (salvo observaciones).
 */
export default function FormularioRevision({
  comprobante, bancos, errores = {}, procesando, onAprobar, onRechazar, onLimpiarError,
}) {
  const [form, setForm] = useState(() => formularioInicial(comprobante));
  const [erroresLocales, setErroresLocales] = useState({});
  // Respuesta de tasa para `para` (fecha consultada). Mientras la fecha
  // elegida no coincide con `para`, la consulta está en curso.
  const [respuestaTasa, setRespuestaTasa] = useState({ para: null, valor: null, fecha: null, fuente: null, error: null });

  const cambiar = (campo, valor) => {
    setForm((f) => {
      const siguiente = { ...f, [campo]: valor };
      if (campo === 'metodo_pago' && valor) siguiente.moneda = monedaPorMetodo(valor);
      return siguiente;
    });
    setErroresLocales((e) => ({ ...e, [campo]: undefined }));
    onLimpiarError?.(campo);
  };

  useEffect(() => {
    if (!form.fecha_pago) return undefined;
    const para = form.fecha_pago;
    const controller = new AbortController();
    obtenerTasaComprobante(para, controller.signal)
      .then(({ data }) => setRespuestaTasa({ para, valor: data.valor_bs, fecha: data.fecha, fuente: data.fuente, error: null }))
      .catch((error) => {
        if (error?.code === 'ERR_CANCELED') return;
        const msg = error?.response?.status === 404
          ? (error.response.data?.error || 'No hay tasa registrada para esa fecha ni para fechas anteriores.')
          : 'No se pudo consultar la tasa de esa fecha.';
        if (error?.response?.status !== 404) toast.error(msg);
        setRespuestaTasa({ para, valor: null, fecha: null, fuente: null, error: msg });
      });
    return () => controller.abort();
  }, [form.fecha_pago]);

  const tasa = form.fecha_pago && respuestaTasa.para === form.fecha_pago
    ? { ...respuestaTasa, cargando: false }
    : { valor: null, fecha: null, fuente: null, error: null, cargando: Boolean(form.fecha_pago) };

  const bancosVisibles = useMemo(() => {
    if (!TIPOS_BANCO.includes(form.metodo_pago)) return bancos;
    const filtrados = bancos.filter((b) => (b.tipos || []).includes(form.metodo_pago)
      || String(b.id) === form.banco_receptor_id);
    return filtrados.length ? filtrados : bancos;
  }, [bancos, form.metodo_pago, form.banco_receptor_id]);

  const saldo = comprobante.saldo_pendiente_usd;
  const resultado = calcularAbono({ monto: form.monto_recibido, moneda: form.moneda, tasa: tasa.valor, saldo });
  const err = (campo) => erroresLocales[campo] || errores[campo];
  const sinBanco = METODOS_SIN_BANCO.includes(form.metodo_pago);

  const validar = () => {
    const e = {};
    if (!form.referencia.trim()) e.referencia = 'Escribe la referencia del pago.';
    if (!sinBanco && !form.banco_receptor_id) e.banco_receptor_id = 'Selecciona el banco que recibió el pago.';
    if (!form.metodo_pago) e.metodo_pago = 'Selecciona el método de pago.';
    if (!form.fecha_pago) e.fecha_pago = 'Indica la fecha del pago.';
    else if (form.fecha_pago > hoyISO()) e.fecha_pago = 'La fecha del pago no puede ser futura.';
    if (!form.moneda) e.moneda = 'Selecciona la moneda.';
    const monto = Number(form.monto_recibido);
    if (!form.monto_recibido || !Number.isFinite(monto) || monto <= 0) e.monto_recibido = 'Escribe un monto mayor que cero.';
    if (form.moneda === 'VES' && form.fecha_pago && !tasa.valor && !tasa.cargando) {
      e.fecha_pago = e.fecha_pago || 'No hay tasa para esa fecha: no se puede registrar un pago en bolívares.';
    }
    setErroresLocales(e);
    return Object.keys(e).length === 0;
  };

  const enviar = (event) => {
    event.preventDefault();
    if (!validar()) return;
    onAprobar({
      referencia: form.referencia.trim(),
      banco_receptor_id: sinBanco ? null : Number(form.banco_receptor_id),
      metodo_pago: form.metodo_pago,
      fecha_pago: form.fecha_pago,
      monto_recibido: form.monto_recibido,
      moneda: form.moneda,
      observaciones: form.observaciones.trim(),
    });
  };

  return (
    <form onSubmit={enviar} noValidate className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold sm:text-base" style={{ color: 'var(--jet)' }}>Datos del pago</h3>
        <p className="text-xs sm:text-sm" style={{ color: 'var(--ash)' }}>
          Transcríbelos desde el comprobante. El representante no los carga.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Campo etiqueta="Referencia" error={err('referencia')}>
          <input
            className={inputClass}
            style={inputStyle(err('referencia'))}
            value={form.referencia}
            onChange={(e) => cambiar('referencia', e.target.value)}
            inputMode="numeric"
            autoComplete="off"
            aria-invalid={Boolean(err('referencia'))}
          />
        </Campo>
        <Campo etiqueta="Método" error={err('metodo_pago')}>
          <select
            className={inputClass}
            style={inputStyle(err('metodo_pago'))}
            value={form.metodo_pago}
            onChange={(e) => cambiar('metodo_pago', e.target.value)}
            aria-invalid={Boolean(err('metodo_pago'))}
          >
            <option value="">Selecciona…</option>
            {METODOS_REVISION.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </Campo>
        <Campo etiqueta="Banco receptor" error={err('banco_receptor_id')} className="sm:col-span-2">
          <select
            className={inputClass}
            style={inputStyle(err('banco_receptor_id'))}
            value={sinBanco ? '' : form.banco_receptor_id}
            onChange={(e) => cambiar('banco_receptor_id', e.target.value)}
            disabled={sinBanco}
            aria-invalid={Boolean(err('banco_receptor_id'))}
          >
            <option value="">{sinBanco ? 'No aplica para efectivo' : 'Selecciona…'}</option>
            {bancosVisibles.map((b) => (
              <option key={b.id} value={String(b.id)}>
                {b.nombre}{b.numero_cuenta ? ` · ${b.numero_cuenta}` : ''}
              </option>
            ))}
          </select>
        </Campo>
        <Campo etiqueta="Fecha del pago" error={err('fecha_pago')}>
          <div className="mt-1">
            <DatePickerES
              value={form.fecha_pago}
              onChange={(e) => cambiar('fecha_pago', e.target.value)}
              maxDate={hoyISO()}
              className="w-full min-h-[44px] rounded-xl px-3 text-sm"
              style={inputStyle(err('fecha_pago'))}
            />
          </div>
        </Campo>
        <Campo etiqueta="Moneda" error={err('moneda')}>
          <div className="mt-1 grid grid-cols-2 gap-1 rounded-xl p-1" style={{ background: 'var(--surface-sunken)', border: '0.5px solid var(--border)' }} role="radiogroup" aria-label="Moneda">
            {['USD', 'VES'].map((m) => {
              const activa = form.moneda === m;
              return (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={activa}
                  onClick={() => cambiar('moneda', m)}
                  className="min-h-[36px] rounded-lg text-sm font-semibold transition-colors"
                  style={activa ? { background: '#fff', color: 'var(--pb-mid)', boxShadow: '0 1px 3px rgba(43,48,58,0.10)' } : { color: 'var(--jet-mid)' }}
                >
                  {m === 'USD' ? 'USD ($)' : 'VES (Bs.)'}
                </button>
              );
            })}
          </div>
        </Campo>
        <Campo etiqueta={`Monto recibido${form.moneda ? ` (${form.moneda === 'VES' ? 'Bs.' : '$'})` : ''}`} error={err('monto_recibido')} className="sm:col-span-2">
          <DecimalInput
            className={`${inputClass} tabular-nums`}
            style={inputStyle(err('monto_recibido'))}
            value={form.monto_recibido}
            onChange={(valor) => cambiar('monto_recibido', valor)}
          />
        </Campo>
      </div>

      <div className="space-y-2 rounded-xl p-3" style={{ background: 'var(--surface-sunken)' }}>
        <div className="flex flex-col gap-1 text-sm sm:flex-row sm:items-center sm:justify-between">
          <span style={{ color: 'var(--ash)' }}>Tasa BCV del pago</span>
          <span className="font-semibold tabular-nums" style={{ color: 'var(--jet)' }}>
            {!form.fecha_pago && 'Elige la fecha del pago'}
            {tasa.cargando && <Loader2 size={14} className="inline animate-spin" aria-label="Consultando tasa" />}
            {!tasa.cargando && tasa.valor && `Bs. ${Number(tasa.valor).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`}
            {!tasa.cargando && tasa.error && <span className="text-red-700">Sin tasa</span>}
          </span>
        </div>
        {tasa.valor && tasa.fecha && tasa.fecha !== form.fecha_pago && (
          <p className="text-xs" style={{ color: 'var(--ash)' }}>
            No hay tasa del día; se usa la del {formatearFecha(tasa.fecha)}{tasa.fuente ? ` (${tasa.fuente})` : ''}.
          </p>
        )}
        {tasa.error && <p className="text-xs text-red-700">{tasa.error}</p>}
        <div className="flex flex-col gap-1 text-sm sm:flex-row sm:items-center sm:justify-between">
          <span style={{ color: 'var(--ash)' }}>Equivalente en USD</span>
          <span className="text-base font-semibold tabular-nums" style={{ color: 'var(--jet)' }}>
            {resultado ? formatearMonto(resultado.usd) : '—'}
          </span>
        </div>
        <ResultadoAbono resultado={resultado} saldo={saldo} />
      </div>

      <Campo etiqueta="Observaciones internas (opcional)" error={err('observaciones')}>
        <textarea
          rows={2}
          className="mt-1 w-full rounded-xl px-3 py-2 text-sm"
          style={inputStyle(err('observaciones'))}
          value={form.observaciones}
          onChange={(e) => cambiar('observaciones', e.target.value)}
        />
      </Campo>

      <div
        className="sticky bottom-0 z-10 -mx-4 flex flex-col-reverse gap-2 px-4 py-3 sm:-mx-5 sm:flex-row sm:justify-end sm:px-5"
        style={{ background: 'var(--surface)', borderTop: '0.5px solid var(--border)' }}
      >
        <button
          type="button"
          onClick={onRechazar}
          disabled={procesando}
          className="inline-flex w-full min-h-[44px] items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold text-red-700 disabled:opacity-60 sm:w-auto"
          style={{ border: '0.5px solid #fca5a5', background: 'var(--porcelain)' }}
        >
          <XCircle size={16} aria-hidden="true" /> Rechazar
        </button>
        <button
          type="submit"
          disabled={procesando}
          className="inline-flex w-full min-h-[44px] items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold text-white disabled:opacity-60 sm:w-auto"
          style={{ background: 'var(--pb)' }}
        >
          {procesando ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <BadgeCheck size={16} aria-hidden="true" />}
          Aprobar y registrar pago
        </button>
      </div>
    </form>
  );
}
