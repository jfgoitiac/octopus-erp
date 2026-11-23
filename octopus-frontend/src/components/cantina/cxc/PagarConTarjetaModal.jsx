import { useEffect, useMemo, useState } from 'react';
import { CreditCard, Info, Loader2 } from 'lucide-react';
import { toast } from 'react-toastify';
import { Modal } from '../../ui/Modal';
import { listarTarjetasPagoDeuda, pagarDeudaConTarjeta } from '../../../api/cantina.service';
import { esCancelacion, fmtUsd, mensajeError, num } from './utilsCxc';

export default function PagarConTarjetaModal({ representanteId, deuda, onClose, onPagado }) {
  const [tarjetas, setTarjetas] = useState([]);
  const [tarjetaId, setTarjetaId] = useState('');
  const [monto, setMonto] = useState('');
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const tarjeta = useMemo(() => tarjetas.find(t => String(t.id) === String(tarjetaId)), [tarjetas, tarjetaId]);
  const maximo = Math.min(num(deuda), Math.max(0, num(tarjeta?.saldo)));

  useEffect(() => {
    const controller = new AbortController();
    listarTarjetasPagoDeuda(representanteId, controller.signal)
      .then(({ data }) => {
        const lista = Array.isArray(data) ? data : [];
        setTarjetas(lista);
        if (lista.length === 1) {
          setTarjetaId(String(lista[0].id));
          setMonto(Math.min(num(deuda), Math.max(0, num(lista[0].saldo))).toFixed(2));
        }
      })
      .catch(async err => {
        if (!esCancelacion(err)) toast.error(await mensajeError(err, 'No se pudieron cargar las tarjetas.'));
      })
      .finally(() => setCargando(false));
    return () => controller.abort();
  }, [representanteId, deuda]);

  const seleccionarTarjeta = (id) => {
    setTarjetaId(id);
    const elegida = tarjetas.find(t => String(t.id) === String(id));
    const disponible = Math.min(num(deuda), Math.max(0, num(elegida?.saldo)));
    setMonto(disponible > 0 ? disponible.toFixed(2) : '');
  };

  const confirmar = async () => {
    const valor = num(monto);
    if (!tarjetaId) return toast.warning('Selecciona una tarjeta.');
    if (!(valor > 0) || valor > maximo) return toast.warning(`El monto debe estar entre $0.01 y ${fmtUsd(maximo)}.`);
    setGuardando(true);
    try {
      const { data } = await pagarDeudaConTarjeta(representanteId, { tarjeta_id: Number(tarjetaId), monto_usd: valor.toFixed(2) });
      toast.success('Deuda pagada con el saldo de la tarjeta.');
      onPagado?.(data);
      onClose();
    } catch (err) {
      toast.error(await mensajeError(err, 'No se pudo aplicar el saldo de la tarjeta.'));
    } finally { setGuardando(false); }
  };

  return (
    <Modal open onClose={() => { if (!guardando) onClose(); }} titulo={<><CreditCard size={17} /> Pagar deuda con tarjeta</>} size="sm" bodyClassName="p-4 sm:p-6" footer={<>
      <button type="button" onClick={onClose} disabled={guardando} className="w-full sm:w-auto px-4 py-2.5 rounded-xl text-sm min-h-[44px]" style={{ border: '0.5px solid var(--border-md)' }}>Cancelar</button>
      <button type="button" onClick={confirmar} disabled={guardando || cargando || maximo <= 0} className="w-full sm:w-auto px-4 py-2.5 rounded-xl text-sm font-medium text-white min-h-[44px] inline-flex items-center justify-center gap-2 disabled:opacity-50" style={{ background: 'var(--pb)' }}>{guardando && <Loader2 size={15} className="animate-spin" />} Confirmar pago</button>
    </>}>
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div className="rounded-xl p-3" style={{ background: 'var(--red-light, #fef2f2)' }}>
            <p className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--ash)' }}>Deuda total USD</p>
            <p className="mt-1 text-lg font-bold" style={{ color: 'var(--red)' }}>{fmtUsd(deuda)}</p>
          </div>
          <div className="rounded-xl p-3" style={{ background: 'var(--teal-light, #f0fdfa)' }}>
            <p className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--ash)' }}>Saldo disponible USD</p>
            <p className="mt-1 text-lg font-bold" style={{ color: 'var(--teal)' }}>{tarjeta ? fmtUsd(tarjeta.saldo) : '—'}</p>
          </div>
        </div>
        <div className="flex gap-2 rounded-xl p-3 text-sm" role="note" style={{ background: 'var(--blue-light, #eff6ff)', color: 'var(--ink)' }}>
          <Info size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
          <p><strong>Pago directo en USD.</strong> El descuento y la deuda se procesan directamente en USD; la tasa BCV no altera el monto debitado. El recibo mostrará equivalente referencial en bolívares.</p>
        </div>
        {cargando ? <div className="h-20 rounded-xl animate-pulse" style={{ background: 'var(--border)' }} /> : tarjetas.length === 0 ? <p className="rounded-xl p-3 text-sm" style={{ background: 'var(--yellow-light)', color: 'var(--amber-ink)' }}>Este representante no tiene tarjetas activas.</p> : <>
          <label className="block text-xs uppercase tracking-widest" style={{ color: 'var(--ash)' }}>Tarjeta
            <select value={tarjetaId} onChange={e => seleccionarTarjeta(e.target.value)} className="mt-1.5 w-full px-3 py-2.5 rounded-xl text-sm normal-case tracking-normal min-h-[44px]" style={{ border: '0.5px solid var(--border-md)', background: '#fff' }}>
              <option value="">Seleccionar…</option>{tarjetas.map(t => <option key={t.id} value={t.id}>{t.alumno_nombre} · {t.serial} · {fmtUsd(t.saldo)}</option>)}
            </select>
          </label>
          <label className="block text-xs uppercase tracking-widest" style={{ color: 'var(--ash)' }}>Monto exacto a descontar (USD)
            <input type="number" min="0.01" max={maximo} step="0.01" value={monto} onChange={e => setMonto(e.target.value)} className="mt-1.5 w-full px-3 py-2.5 rounded-xl text-base font-semibold normal-case tracking-normal min-h-[44px]" style={{ border: '0.5px solid var(--border-md)' }} />
          </label>
          {tarjeta && <p className="text-xs" style={{ color: 'var(--teal)' }}>Se descontarán exactamente {fmtUsd(monto)} de la tarjeta. Máximo aplicable: {fmtUsd(maximo)}.</p>}
        </>}
      </div>
    </Modal>
  );
}
