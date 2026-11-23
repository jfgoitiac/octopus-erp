import { useEffect, useMemo, useState } from 'react';
import { CreditCard, Info, Loader2 } from 'lucide-react';
import { toast } from 'react-toastify';
import { Modal } from '../../components/ui/Modal';
import { getTarjetasPagoCuentaCantina, pagarCuentaCantinaConTarjeta } from '../api/portal.service';
import { fmtMonto } from '../utils/montos';

const numero = (valor) => {
  const resultado = Number(valor);
  return Number.isFinite(resultado) ? resultado : 0;
};

const usd = (valor) => `$ ${fmtMonto(valor)}`;

const mensajeError = (error) => {
  const data = error?.response?.data;
  if (data?.detail) return data.detail;
  if (data?.error) return data.error;
  const primero = data && typeof data === 'object' ? Object.values(data).flat()[0] : null;
  return typeof primero === 'string' ? primero : 'No se pudo aplicar el saldo de la tarjeta.';
};

const PagarCuentaCantinaModal = ({ open, deuda, onClose, onPagado }) => {
  const [tarjetas, setTarjetas] = useState([]);
  const [tarjetaId, setTarjetaId] = useState('');
  const [monto, setMonto] = useState('');
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const tarjeta = useMemo(
    () => tarjetas.find((item) => String(item.id ?? item.tarjeta_id) === String(tarjetaId)),
    [tarjetas, tarjetaId],
  );
  const saldoTarjeta = numero(tarjeta?.saldo);
  const maximo = Math.min(numero(deuda), Math.max(0, saldoTarjeta));

  useEffect(() => {
    if (!open) return undefined;
    const controller = new AbortController();
    getTarjetasPagoCuentaCantina(controller.signal)
      .then(({ data }) => {
        const lista = Array.isArray(data) ? data : (data?.tarjetas || []);
        setTarjetas(lista);
        if (lista.length === 1) {
          const id = lista[0].id ?? lista[0].tarjeta_id;
          setTarjetaId(String(id));
          setMonto(Math.min(numero(deuda), Math.max(0, numero(lista[0].saldo))).toFixed(2));
        }
      })
      .catch((error) => {
        if (error?.name !== 'CanceledError' && error?.code !== 'ERR_CANCELED') {
          toast.error(mensajeError(error));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setCargando(false);
      });
    return () => controller.abort();
  }, [open, deuda]);

  const cerrar = (forzar = false) => {
    if (guardando && !forzar) return;
    setCargando(true);
    setTarjetas([]);
    setTarjetaId('');
    setMonto('');
    onClose();
  };

  const seleccionarTarjeta = (id) => {
    setTarjetaId(id);
    const elegida = tarjetas.find((item) => String(item.id ?? item.tarjeta_id) === String(id));
    const disponible = Math.min(numero(deuda), Math.max(0, numero(elegida?.saldo)));
    setMonto(disponible > 0 ? disponible.toFixed(2) : '');
  };

  const confirmar = async () => {
    const valor = numero(monto);
    if (!tarjetaId) return toast.warning('Selecciona una tarjeta.');
    if (!(valor > 0) || valor > maximo) {
      return toast.warning(`El monto debe estar entre $ 0,01 y ${usd(maximo)}.`);
    }
    setGuardando(true);
    try {
      const { data } = await pagarCuentaCantinaConTarjeta({
        tarjeta_id: Number(tarjetaId),
        monto_usd: valor.toFixed(2),
      });
      toast.success('Pago aplicado. Tu deuda y saldo ya fueron actualizados.');
      onPagado?.(data);
      cerrar(true);
      return;
    } catch (error) {
      toast.error(mensajeError(error));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={() => cerrar()}
      size="sm"
      bodyClassName="p-4 sm:p-6"
      titulo={<><CreditCard size={17} aria-hidden="true" /> Pagar deuda</>}
      footer={<>
        <button type="button" onClick={() => cerrar()} disabled={guardando} className="min-h-[44px] w-full rounded-xl border border-[var(--border)] px-4 py-2.5 text-sm sm:w-auto">Cancelar</button>
        <button type="button" onClick={confirmar} disabled={guardando || cargando || maximo <= 0} className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-[var(--portal-primary)] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50 sm:w-auto">
          {guardando && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
          Confirmar pago
        </button>
      </>}
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div className="rounded-xl bg-[var(--red-light)] p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-[var(--ash)]">Deuda total USD</p>
            <p className="mt-1 text-lg font-bold text-[var(--red)]">{usd(deuda)}</p>
          </div>
          <div className="rounded-xl bg-[var(--surface-sunken)] p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-[var(--ash)]">Saldo disponible USD</p>
            <p className="mt-1 text-lg font-bold text-[var(--portal-primary)]">{tarjeta ? usd(saldoTarjeta) : '—'}</p>
          </div>
        </div>
        <div className="flex gap-2 rounded-xl bg-[var(--surface-sunken)] p-3 text-sm text-[var(--jet-mid)]" role="note">
          <Info size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
          <p>El descuento y la deuda se procesan directamente en USD. La tasa BCV no cambia el monto debitado.</p>
        </div>
        {cargando ? (
          <div className="h-24 animate-pulse rounded-xl bg-[var(--surface-sunken)]" />
        ) : tarjetas.length === 0 ? (
          <p className="rounded-xl bg-[var(--yellow-light)] p-3 text-sm text-[var(--amber-ink)]">No tienes tarjetas activas con saldo disponible.</p>
        ) : (
          <>
            <label className="block text-xs font-semibold text-[var(--jet-mid)]">Tarjeta
              <select value={tarjetaId} onChange={(event) => seleccionarTarjeta(event.target.value)} className="mt-1.5 min-h-[44px] w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-sm font-normal">
                <option value="">Seleccionar…</option>
                {tarjetas.map((item) => {
                  const id = item.id ?? item.tarjeta_id;
                  return <option key={id} value={id}>{item.alumno_nombre} · {item.serial} · {usd(item.saldo)}</option>;
                })}
              </select>
            </label>
            <label className="block text-xs font-semibold text-[var(--jet-mid)]">Monto a abonar (USD)
              <input type="number" inputMode="decimal" min="0.01" max={maximo} step="0.01" value={monto} onChange={(event) => setMonto(event.target.value)} className="mt-1.5 min-h-[44px] w-full rounded-xl border border-[var(--border)] px-3 py-2.5 text-base font-semibold" />
            </label>
            {tarjeta && <p className="text-xs text-[var(--portal-primary)]">Se descontarán exactamente {usd(monto)}. Puedes hacer un pago parcial hasta {usd(maximo)}.</p>}
          </>
        )}
      </div>
    </Modal>
  );
};

export default PagarCuentaCantinaModal;
