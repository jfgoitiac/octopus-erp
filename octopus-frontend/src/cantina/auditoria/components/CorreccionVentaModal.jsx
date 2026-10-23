import { useId, useMemo, useState } from 'react';
import { toast } from 'react-toastify';
import { Loader2, Lock, PencilLine } from 'lucide-react';
import { Modal } from '../../../components/ui/Modal';
import { parseApiError } from '../../../utils/apiError';
import { METODOS_COBRANZA, etiquetaMetodo } from '../../../components/cantina/metodoPagoUtils';
import { corregirVenta } from '../api/auditoriaApi';
import { ESTILO_CAMPO, fmtFechaHora, usd } from './CierreFormato';
import { CLASE_CAMPO, CLASE_ETIQUETA, ESTILO_BOTON_SECUNDARIO } from './BitacoraFormato';

const MIN_MOTIVO = 5;
const MAX_TEXTO = 500;

// §10.2: solo estos métodos son destino válido de una corrección.
const OPCIONES_METODO = METODOS_COBRANZA;
const METODOS_BANCARIOS = ['zelle', 'transferencia', 'pago_movil', 'punto_de_venta'];
// Con saldo/CxC implicado el método no se cambia (se anula y se re-registra).
const METODOS_BLOQUEADOS = ['tarjeta_prepago', 'credito_representante'];

const num = (v) => {
  const n = Number(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : NaN;
};

function Campo({ id, etiqueta, requerido, ayuda, error, children }) {
  return (
    <div>
      <label htmlFor={id} className={CLASE_ETIQUETA} style={{ color: 'var(--ash)' }}>
        {etiqueta} {requerido && <span style={{ color: 'var(--red)' }}>*</span>}
      </label>
      {children}
      {(error || ayuda) && (
        <p
          id={`${id}-ayuda`}
          role={error ? 'alert' : undefined}
          className="mt-1 text-xs"
          style={{ color: error ? 'var(--red)' : 'var(--ash)' }}
        >
          {error || ayuda}
        </p>
      )}
    </div>
  );
}

// Modal de corrección de una venta (POST ventas/<id>/corregir/). Solo envía
// los campos que cambiaron; el motivo de la corrección es siempre obligatorio.
// Se monta únicamente con una venta seleccionada (el estado nace de ella).
export default function CorreccionVentaModal({ venta, onClose, onCorregida }) {
  const uid = useId();
  const ventaId = venta.id ?? venta.venta_id;
  const fechaVenta = venta.fecha ?? venta.fecha_hora;
  const metodoBloqueado = METODOS_BLOQUEADOS.includes(venta.metodo_pago);
  // Turno cerrado: el cierre es un snapshot, solo texto (§10.2).
  const cerrado = Boolean(venta.cierre_cerrado);
  const descuentoBloqueado = cerrado || venta.metodo_pago === 'tarjeta_prepago';
  const [referencia, setReferencia] = useState('');
  const [metodo, setMetodo] = useState(venta.metodo_pago ?? '');
  const [descuento, setDescuento] = useState(String(venta.descuento_usd ?? '0'));
  const [motivoDescuento, setMotivoDescuento] = useState(venta.motivo_descuento ?? '');
  const [observaciones, setObservaciones] = useState(venta.observaciones ?? '');
  const [motivo, setMotivo] = useState('');
  const [intentado, setIntentado] = useState(false);
  const [enviando, setEnviando] = useState(false);

  const subtotal = num(venta.subtotal_usd ?? (num(venta.total_usd) + num(venta.descuento_usd ?? 0)));
  const descNuevo = num(descuento);

  const cambios = useMemo(() => {
    const c = {};
    if (!metodoBloqueado && !cerrado && metodo && metodo !== venta.metodo_pago) c.metodo_pago = metodo;
    if (c.metodo_pago && METODOS_BANCARIOS.includes(c.metodo_pago) && referencia.trim()) c.referencia = referencia.trim();
    if (!descuentoBloqueado && !Number.isNaN(descNuevo) && descNuevo !== num(venta.descuento_usd ?? 0)) c.descuento_usd = descNuevo.toFixed(2);
    if (motivoDescuento.trim() !== (venta.motivo_descuento ?? '').trim()) c.motivo_descuento = motivoDescuento.trim();
    if (observaciones.trim() !== (venta.observaciones ?? '').trim()) c.observaciones = observaciones.trim();
    return c;
  }, [metodo, referencia, descNuevo, motivoDescuento, observaciones, venta, metodoBloqueado, cerrado, descuentoBloqueado]);

  const errores = {};
  if (Number.isNaN(descNuevo) || descNuevo < 0) errores.descuento = 'Ingresa un monto válido (0 o más).';
  else if (!Number.isNaN(subtotal) && descNuevo > subtotal) errores.descuento = `No puede superar el subtotal (${usd(subtotal)}).`;
  if (descNuevo > 0 && !motivoDescuento.trim() && ('descuento_usd' in cambios || 'motivo_descuento' in cambios)) {
    errores.motivoDescuento = 'Explica por qué se aplica el descuento.';
  }
  if (cambios.metodo_pago && METODOS_BANCARIOS.includes(cambios.metodo_pago) && !referencia.trim()) {
    errores.referencia = 'Este método exige el número de referencia.';
  }
  if (motivo.trim().length < MIN_MOTIVO) errores.motivo = `Explica el motivo de la corrección (mínimo ${MIN_MOTIVO} caracteres).`;
  const verErrores = intentado ? errores : {};

  const totalNuevo = !Number.isNaN(subtotal) && !Number.isNaN(descNuevo) ? Math.max(0, subtotal - descNuevo) : null;

  const cerrar = () => { if (!enviando) onClose(); };

  const confirmar = async () => {
    setIntentado(true);
    if (Object.keys(errores).length > 0) return;
    if (Object.keys(cambios).length === 0) {
      toast.info('No hay cambios que guardar: modifica al menos un dato de la venta.');
      return;
    }
    setEnviando(true);
    try {
      await corregirVenta(ventaId, { motivo: motivo.trim(), ...cambios });
      toast.success(`Venta #${ventaId} corregida. Quedó registrado en la bitácora.`);
      onCorregida?.();
    } catch (err) {
      toast.error(`No se pudo corregir la venta: ${parseApiError(err)}`);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Modal
      open
      onClose={cerrar}
      size="md"
      titulo={`Corregir venta #${ventaId}`}
      footer={
        <>
          <button
            type="button"
            onClick={cerrar}
            disabled={enviando}
            className="min-h-[44px] w-full rounded-xl px-4 text-sm font-medium disabled:opacity-50 sm:w-auto"
            style={ESTILO_BOTON_SECUNDARIO}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={confirmar}
            disabled={enviando}
            className="inline-flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-xl px-4 text-sm font-semibold text-white disabled:opacity-60 sm:w-auto"
            style={{ background: 'var(--pb)' }}
          >
            {enviando ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <PencilLine size={16} aria-hidden="true" />}
            Guardar corrección
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div
          className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-2xl p-3 text-sm"
          style={{ background: 'var(--pb-light)', color: 'var(--jet)' }}
        >
          <span className="min-w-0 break-words">{venta.cajero?.nombre ?? 'Cajero'} · {fmtFechaHora(fechaVenta)}</span>
          <span className="font-mono font-semibold tabular-nums">{usd(venta.total_usd)}</span>
        </div>

        {(cerrado || metodoBloqueado) && (
          <p className="flex items-start gap-2 rounded-2xl p-3 text-xs" style={{ background: 'var(--yellow-light)', color: 'var(--amber-ink)' }} role="note">
            <Lock size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
            <span>
              {cerrado
                ? `El turno ya está cerrado${venta.cierre_id ? ` (cierre #${venta.cierre_id})` : ''}: solo puedes editar el motivo del descuento y las observaciones.`
                : 'Esta venta usa saldo o cuenta por cobrar: el método no se puede cambiar. Para eso, anula y registra la venta de nuevo.'}
            </span>
          </p>
        )}

        <Campo id={`${uid}-metodo`} etiqueta="Método de pago">
          <select
            id={`${uid}-metodo`}
            value={metodo}
            onChange={(e) => setMetodo(e.target.value)}
            disabled={metodoBloqueado || cerrado}
            className={`${CLASE_CAMPO} disabled:opacity-60`}
            style={ESTILO_CAMPO}
          >
            {venta.metodo_pago && !OPCIONES_METODO.some((o) => o.value === venta.metodo_pago) && (
              <option value={venta.metodo_pago}>{etiquetaMetodo(venta.metodo_pago)}</option>
            )}
            {OPCIONES_METODO.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </Campo>

        {cambios.metodo_pago && METODOS_BANCARIOS.includes(cambios.metodo_pago) && (
          <Campo id={`${uid}-ref`} etiqueta="Referencia" requerido error={verErrores.referencia}>
            <input
              id={`${uid}-ref`}
              type="text"
              value={referencia}
              onChange={(e) => setReferencia(e.target.value)}
              maxLength={50}
              aria-invalid={Boolean(verErrores.referencia)}
              className={CLASE_CAMPO}
              style={ESTILO_CAMPO}
            />
          </Campo>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Campo
            id={`${uid}-desc`}
            etiqueta="Descuento (USD)"
            error={verErrores.descuento}
            ayuda={totalNuevo != null ? `Total resultante: ${usd(totalNuevo)}` : undefined}
          >
            <input
              id={`${uid}-desc`}
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={descuento}
              onChange={(e) => setDescuento(e.target.value)}
              disabled={descuentoBloqueado}
              aria-invalid={Boolean(verErrores.descuento)}
              className={`${CLASE_CAMPO} font-mono tabular-nums disabled:opacity-60`}
              style={ESTILO_CAMPO}
            />
          </Campo>
          <Campo id={`${uid}-mdesc`} etiqueta="Motivo del descuento" requerido={descNuevo > 0} error={verErrores.motivoDescuento}>
            <input
              id={`${uid}-mdesc`}
              type="text"
              value={motivoDescuento}
              onChange={(e) => setMotivoDescuento(e.target.value)}
              maxLength={200}
              aria-invalid={Boolean(verErrores.motivoDescuento)}
              className={CLASE_CAMPO}
              style={ESTILO_CAMPO}
            />
          </Campo>
        </div>

        <Campo id={`${uid}-obs`} etiqueta="Observaciones de la venta">
          <textarea
            id={`${uid}-obs`}
            rows={2}
            value={observaciones}
            onChange={(e) => setObservaciones(e.target.value)}
            maxLength={MAX_TEXTO}
            className={`${CLASE_CAMPO} min-h-[72px] resize-y`}
            style={ESTILO_CAMPO}
          />
        </Campo>

        <div className="rounded-2xl p-3 sm:p-4" style={{ background: 'var(--yellow-light)' }}>
          <Campo
            id={`${uid}-motivo`}
            etiqueta="Motivo de la corrección"
            requerido
            error={verErrores.motivo}
            ayuda="Obligatorio. Queda en la bitácora junto con los valores anteriores y no se puede editar."
          >
            <textarea
              id={`${uid}-motivo`}
              rows={3}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              maxLength={MAX_TEXTO}
              aria-invalid={Boolean(verErrores.motivo)}
              aria-describedby={`${uid}-motivo-ayuda`}
              placeholder="Ej.: El cajero marcó efectivo pero el cliente pagó con pago móvil."
              className={`${CLASE_CAMPO} min-h-[80px] resize-y`}
              style={{ ...ESTILO_CAMPO, ...(verErrores.motivo ? { border: '1px solid var(--red)' } : null) }}
            />
          </Campo>
        </div>
      </div>
    </Modal>
  );
}
