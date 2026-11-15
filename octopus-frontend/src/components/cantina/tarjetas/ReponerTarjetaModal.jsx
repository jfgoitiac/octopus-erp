import { useState } from 'react';
import { toast } from 'react-toastify';
import { Loader2, AlertTriangle, ArrowRight, ScanLine, ShieldAlert } from 'lucide-react';
import {
  buscarTarjetaParaReponer,
  buscarTarjetaSinAsignar,
  reponerTarjeta,
} from '../../../api/cantina.service';
import { Modal } from '../../ui/Modal';

const FIELD_STYLE = { border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)', fontSize: '16px' };
const LABEL_STYLE = { color: 'var(--ash)' };
const IDLE_STYLE  = { border: '0.5px solid var(--border-md)', color: 'var(--ash)', background: 'var(--porcelain)' };

const MOTIVOS = [
  { value: 'extravio', label: 'Extravío' },
  { value: 'dano', label: 'Tarjeta dañada' },
];

// tarjetaInicial (opcional): { id, serial, alumnoNombre } — llega cuando el
// admin viene sugerido desde el conflicto de AsignarTarjetaModal (§7.3bis).
// Si no llega, este modal pide primero el código/serial para ubicarla (aún
// no existe listado/tabla de tarjetas — eso es Fase 3, §5 cantina.md).
export default function ReponerTarjetaModal({ tarjetaInicial, onClose, onRepuesta }) {
  const [tarjeta, setTarjeta] = useState(tarjetaInicial?.id ? tarjetaInicial : null);
  const [entradaTarjeta, setEntradaTarjeta] = useState('');
  const [buscando, setBuscando] = useState(false);
  const [errorBusqueda, setErrorBusqueda] = useState('');
  const [reemplazo, setReemplazo] = useState(null);
  const [entradaReemplazo, setEntradaReemplazo] = useState('');
  const [buscandoReemplazo, setBuscandoReemplazo] = useState(false);
  const [errorReemplazo, setErrorReemplazo] = useState('');

  const [motivo, setMotivo] = useState('extravio');
  const [confirmado, setConfirmado] = useState(false);
  const [reponiendo, setReponiendo] = useState(false);
  const [resultado, setResultado] = useState(null);

  const handleBuscar = async () => {
    const valor = entradaTarjeta.trim();
    if (!valor) {
      toast.warning('Escribe el código o el serial de la tarjeta a reponer.');
      return;
    }
    setBuscando(true);
    setErrorBusqueda('');
    try {
      const query = /^CANT-/i.test(valor) ? { codigo: valor } : { serial: valor };
      const res = await buscarTarjetaParaReponer(query);
      setTarjeta(res.data);
    } catch (err) {
      if (err.name === 'CanceledError' || err.code === 'ERR_CANCELED') return;
      setErrorBusqueda(err.response?.data?.detail || 'No se encontró una tarjeta con ese código/serial.');
    } finally {
      setBuscando(false);
    }
  };

  const handleConfirmar = async () => {
    if (!tarjeta?.id || !reemplazo?.id) {
      toast.warning('Escanea primero una tarjeta nueva sin asignar.');
      return;
    }
    if (!confirmado) {
      toast.warning('Confirma que entiendes que el código físico anterior quedará inválido.');
      return;
    }
    setReponiendo(true);
    try {
      const { data } = await reponerTarjeta(tarjeta.id, motivo, reemplazo.id);
      setResultado(data);
      toast.success('Tarjeta reasignada. El QR anterior quedó retirado.');
      onRepuesta?.(data);
    } catch (err) {
      if (err.name === 'CanceledError' || err.code === 'ERR_CANCELED') return;
      toast.error(err.response?.data?.detail || 'No se pudo reponer la tarjeta.');
    } finally {
      setReponiendo(false);
    }
  };

  const handleBuscarReemplazo = async () => {
    const valor = entradaReemplazo.trim();
    if (!valor) {
      toast.warning('Escanea el QR o escribe el serial de la tarjeta nueva.');
      return;
    }
    setBuscandoReemplazo(true);
    setErrorReemplazo('');
    try {
      const query = /^CANT-/i.test(valor) ? { codigo: valor } : { serial: valor };
      const { data } = await buscarTarjetaSinAsignar(query);
      if (data.id === tarjeta?.id) {
        setErrorReemplazo('La tarjeta nueva debe ser distinta de la tarjeta anterior.');
        return;
      }
      setReemplazo(data);
      setConfirmado(false);
    } catch (err) {
      if (err.name === 'CanceledError' || err.code === 'ERR_CANCELED') return;
      setErrorReemplazo(err.response?.data?.detail || 'No se encontró una tarjeta disponible con ese código/serial.');
    } finally {
      setBuscandoReemplazo(false);
    }
  };

  const handleClose = () => { if (!reponiendo) onClose(); };

  const footer = (
    <>
      <button
        onClick={handleClose}
        disabled={reponiendo}
        className="w-full sm:w-auto px-4 rounded-xl py-2.5 text-sm min-h-[44px] disabled:opacity-40"
        style={{ border: '0.5px solid var(--border-md)', color: 'var(--ash)' }}
      >
        Cancelar
      </button>
      {tarjeta && !resultado && (
        <button
          onClick={handleConfirmar}
          disabled={reponiendo || !confirmado}
          className="w-full sm:w-auto px-4 text-white rounded-xl py-2.5 text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2 min-h-[44px]"
          style={{ background: 'var(--amber-ink)' }}
        >
          {reponiendo ? <><Loader2 size={14} className="animate-spin" /> Reasignando...</> : 'Confirmar reasignación'}
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
          <ShieldAlert size={17} style={{ color: 'var(--amber-ink)' }} />
          Reasignar tarjeta extraviada/dañada
        </>
      )}
      footer={footer}
      size="sm"
    >
      {resultado ? (
        <div className="space-y-4 text-center">
          <div className="rounded-xl p-4" style={{ background: 'var(--teal-light)', color: 'var(--teal)' }}>
            <p className="font-semibold">Reasignación completada</p>
            <p className="text-sm mt-1">La tarjeta nueva ya está activa y la anterior quedó retirada.</p>
          </div>
          <div className="rounded-xl p-4 text-left" style={{ border: '0.5px solid var(--border-md)' }}>
            <p className="text-xs uppercase tracking-widest" style={LABEL_STYLE}>Tarjeta asignada</p>
            <p className="font-mono font-semibold mt-1 break-all" style={{ color: 'var(--jet)' }}>{resultado.serial}</p>
            <p className="text-sm mt-2" style={{ color: 'var(--ash)' }}>El saldo y todo el historial se conservaron.</p>
          </div>
          <button type="button" onClick={onClose} className="w-full px-4 py-2.5 rounded-xl text-sm font-medium text-white min-h-[44px]" style={{ background: 'var(--pb)' }}>Finalizar</button>
        </div>
      ) : !tarjeta ? (
        <div className="space-y-3">
          <label htmlFor="reponertarjetamodal-codigo-qr-o-serial-de-la-tar" className="block text-xs uppercase tracking-widest" style={LABEL_STYLE}>
            Tarjeta extraviada o dañada
          </label>
          <div className="flex gap-2">
            <input id="reponertarjetamodal-codigo-qr-o-serial-de-la-tar"
              autoFocus
              className="flex-1 px-3 py-2 rounded-lg text-sm outline-none min-h-[44px]"
              style={FIELD_STYLE}
              value={entradaTarjeta}
              onChange={e => { setEntradaTarjeta(e.target.value); setErrorBusqueda(''); }}
              onKeyDown={e => { if (e.key === 'Enter') handleBuscar(); }}
              placeholder="CANT-7K9M2XQPRT o L003-0007"
            />
            <button
              onClick={handleBuscar}
              disabled={buscando}
              className="px-4 rounded-xl text-sm font-medium text-white disabled:opacity-50 min-h-[44px]"
              style={{ background: 'var(--pb)' }}
            >
              {buscando ? <Loader2 size={14} className="animate-spin" /> : 'Buscar'}
            </button>
          </div>
          {errorBusqueda && (
            <p className="text-sm flex items-center gap-1.5" style={{ color: 'var(--red)' }}>
              <AlertTriangle size={14} /> {errorBusqueda}
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm" style={{ color: 'var(--ash)' }}>
            Tarjeta actual <strong style={{ color: 'var(--jet)' }}>{tarjeta.serial}</strong>
            {tarjeta.alumnoNombre || tarjeta.titular_nombre || tarjeta.alumno ? (
              <> — {tarjeta.alumnoNombre || tarjeta.titular_nombre || `${tarjeta.alumno?.nombre ?? ''} ${tarjeta.alumno?.apellido ?? ''}`.trim()}</>
            ) : null}
          </p>

          <div>
            <label htmlFor="reponertarjetamodal-tarjeta-nueva" className="block text-xs uppercase tracking-widest mb-1.5" style={LABEL_STYLE}>
              Tarjeta nueva sin asignar
            </label>
            {reemplazo ? (
              <div className="flex flex-col gap-3 rounded-xl p-3 sm:flex-row sm:items-center sm:justify-between" style={{ background: 'var(--teal-light)', border: '0.5px solid color-mix(in srgb, var(--teal) 25%, white)' }}>
                <div className="min-w-0">
                  <p className="text-xs" style={{ color: 'var(--teal)' }}>Lista para entregar</p>
                  <p className="font-mono font-semibold break-all" style={{ color: 'var(--jet)' }}>{reemplazo.serial}</p>
                </div>
                <button type="button" onClick={() => { setReemplazo(null); setEntradaReemplazo(''); setConfirmado(false); }} className="w-full sm:w-auto px-3 py-2 rounded-lg text-sm font-medium min-h-[44px]" style={IDLE_STYLE}>
                  Cambiar
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-2 sm:flex-row">
                <div className="relative flex-1 min-w-0">
                  <ScanLine size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--ash)' }} />
                  <input id="reponertarjetamodal-tarjeta-nueva" className="w-full pl-9 pr-3 py-2 rounded-lg outline-none min-h-[44px]" style={FIELD_STYLE} value={entradaReemplazo} onChange={e => { setEntradaReemplazo(e.target.value); setErrorReemplazo(''); }} onKeyDown={e => { if (e.key === 'Enter') handleBuscarReemplazo(); }} placeholder="Escanea QR o escribe serial" />
                </div>
                <button type="button" onClick={handleBuscarReemplazo} disabled={buscandoReemplazo} className="w-full sm:w-auto px-4 rounded-xl text-sm font-medium text-white disabled:opacity-50 min-h-[44px] flex items-center justify-center" style={{ background: 'var(--pb)' }}>
                  {buscandoReemplazo ? <Loader2 size={14} className="animate-spin" /> : 'Buscar'}
                </button>
              </div>
            )}
            {errorReemplazo && <p className="text-sm flex items-start gap-1.5 mt-2" style={{ color: 'var(--red)' }}><AlertTriangle size={14} className="shrink-0 mt-0.5" /> <span>{errorReemplazo}</span></p>}
          </div>

          {reemplazo && (
            <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 rounded-xl p-3" style={{ background: 'var(--porcelain)' }} aria-label={`Reasignar ${tarjeta.serial} a ${reemplazo.serial}`}>
              <div className="min-w-0"><p className="text-xs" style={LABEL_STYLE}>Anterior</p><p className="font-mono text-sm font-semibold break-all">{tarjeta.serial}</p></div>
              <ArrowRight size={18} aria-hidden="true" style={{ color: 'var(--pb)' }} />
              <div className="min-w-0 text-right"><p className="text-xs" style={LABEL_STYLE}>Nueva</p><p className="font-mono text-sm font-semibold break-all">{reemplazo.serial}</p></div>
            </div>
          )}

          <div>
            <span id="reponer-motivo" className="block text-xs uppercase tracking-widest mb-1.5" style={LABEL_STYLE}>Motivo</span>
            <div role="group" aria-labelledby="reponer-motivo" className="flex gap-2">
              {MOTIVOS.map(m => (
                <button
                  key={m.value}
                  type="button"
                  aria-pressed={motivo === m.value}
                  onClick={() => setMotivo(m.value)}
                  className="flex-1 py-2.5 rounded-lg text-sm font-medium min-h-[44px]"
                  style={motivo === m.value
                    ? { background: 'var(--yellow-light)', color: 'var(--amber-ink)', border: '1.5px solid var(--yellow)' }
                    : IDLE_STYLE}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-lg px-3 py-3 text-sm flex gap-2" style={{ background: 'var(--red-light)', border: '0.5px solid color-mix(in srgb, var(--red) 25%, white)', color: 'var(--red)' }}>
            <AlertTriangle size={16} className="shrink-0 mt-0.5" />
            <span>
              La tarjeta anterior quedará <strong>permanentemente retirada</strong>. La nueva conservará el saldo, límite de crédito e historial del titular.
            </span>
          </div>

          <label className="flex items-start gap-2 text-sm cursor-pointer" style={{ color: 'var(--jet)' }}>
            <input
              type="checkbox"
              checked={confirmado}
              onChange={e => setConfirmado(e.target.checked)}
              disabled={!reemplazo}
              className="mt-0.5"
            />
            Confirmo que entregaré la tarjeta {reemplazo?.serial || 'nueva'} y retiraré la anterior.
          </label>
        </div>
      )}
    </Modal>
  );
}
