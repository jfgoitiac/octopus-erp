import { useCallback, useEffect, useRef, useState } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Ban, Download, History, Loader2, Pencil, Search } from 'lucide-react';
import { toast } from 'react-toastify';
import Pagination from '../../shared/Pagination';
import { Modal } from '../../ui/Modal';
import {
  anularRecarga,
  corregirRecarga,
  descargarComprobanteAnulacionRecarga,
  getHistorialRecargas,
} from '../../../api/cantina.service';

const PAGE_SIZE = 10;
const ESTADOS = {
  pendiente: ['Pendiente', 'var(--yellow-light)', 'var(--amber-ink)'],
  aprobado: ['Aprobada', 'var(--green-light)', 'var(--green)'],
  rechazado: ['Rechazada', 'var(--porcelain)', 'var(--ash)'],
  anulado: ['Anulada', 'var(--red-light)', 'var(--red)'],
};
const METODOS = {
  efectivo: 'Efectivo USD', efectivo_ves: 'Efectivo Bs.', transferencia: 'Transferencia',
  pago_movil: 'Pago móvil', punto_de_venta: 'Punto de venta', zelle: 'Zelle',
};

const fecha = valor => {
  try { return format(new Date(valor), 'dd MMM yyyy, HH:mm', { locale: es }); } catch { return valor || '—'; }
};

function ReversoModal({ recarga, modo, onClose, onCompletado }) {
  const [motivo, setMotivo] = useState('');
  const [monto, setMonto] = useState(String(recarga?.monto_usd || ''));
  const [devolucion, setDevolucion] = useState(false);
  const [forzar, setForzar] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const esCorreccion = modo === 'corregir';
  const bloqueadaPorSaldo = recarga.requiere_forzar_saldo && !recarga.puede_forzar_saldo;

  const confirmar = async () => {
    if (motivo.trim().length < 5) return toast.warning('Indica un motivo de al menos 5 caracteres.');
    if (esCorreccion && !(Number(monto) > 0)) return toast.warning('Indica un monto corregido mayor a cero.');
    setGuardando(true);
    try {
      if (esCorreccion) {
        await corregirRecarga(recarga.id, {
          motivo: motivo.trim(),
          forzar_saldo_negativo: forzar,
          recarga: {
            metodo_pago: recarga.metodo_pago,
            monto_usd: Number(monto).toFixed(2),
            banco_receptor: recarga.banco_receptor,
            referencia: recarga.referencia || '',
            numero_lote: recarga.numero_lote || '',
          },
        });
        toast.success(`Recarga #${recarga.id} corregida.`);
      } else {
        await anularRecarga(recarga.id, {
          motivo: motivo.trim(), devolucion_dinero: devolucion, forzar_saldo_negativo: forzar,
        });
        toast.success(`Recarga #${recarga.id} anulada.`);
      }
      onCompletado();
      onClose();
    } catch (err) {
      const data = err.response?.data;
      toast.error(data?.error || data?.detail || 'No se pudo procesar la recarga.');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Modal
      open={Boolean(recarga)} onClose={onClose} size="sm"
      titulo={<><Ban size={17} /> {esCorreccion ? 'Corregir recarga' : 'Anular recarga'} #{recarga.id}</>}
      footer={<>
        <button type="button" onClick={onClose} className="px-4 py-2.5 rounded-xl text-sm min-h-[44px]" style={{ border: '1px solid var(--border-md)', color: 'var(--ash)' }}>Cancelar</button>
        <button type="button" onClick={confirmar} disabled={guardando || bloqueadaPorSaldo} className="px-4 py-2.5 rounded-xl text-sm min-h-[44px] text-white font-medium flex items-center justify-center gap-2 disabled:opacity-50" style={{ background: esCorreccion ? 'var(--pb)' : 'var(--red)' }}>
          {guardando && <Loader2 size={14} className="animate-spin" />}{esCorreccion ? 'Guardar corrección' : 'Anular recarga'}
        </button>
      </>}
    >
      <div className="rounded-xl p-3 mb-4 text-sm" style={{ background: '#fff', border: '1px solid var(--border-md)' }}>
        <div className="flex justify-between"><span style={{ color: 'var(--ash)' }}>Titular</span><strong>{recarga.titular_nombre || recarga.tarjeta_serial}</strong></div>
        <div className="flex justify-between mt-1"><span style={{ color: 'var(--ash)' }}>Monto original</span><strong>${Number(recarga.monto_usd).toFixed(2)}</strong></div>
        <div className="flex justify-between mt-1"><span style={{ color: 'var(--ash)' }}>Saldo proyectado</span><strong style={{ color: Number(recarga.saldo_proyectado) < 0 ? 'var(--red)' : 'var(--jet)' }}>${Number(recarga.saldo_proyectado).toFixed(2)}</strong></div>
      </div>

      {esCorreccion && <label className="block mb-4 text-xs uppercase tracking-widest" style={{ color: 'var(--ash)' }}>
        Monto correcto
        <div className="flex items-center mt-1.5 rounded-xl px-3 bg-white" style={{ border: '1px solid var(--border-md)' }}><span>$</span><input aria-label="Monto correcto" type="number" min="0.01" step="0.01" value={monto} onChange={e => setMonto(e.target.value)} className="w-full p-2.5 outline-none" /></div>
      </label>}

      {!esCorreccion && <label className="flex items-start gap-2.5 p-3 mb-4 rounded-xl text-sm" style={{ background: 'var(--yellow-light)' }}>
        <input type="checkbox" checked={devolucion} onChange={e => setDevolucion(e.target.checked)} className="mt-0.5" />
        <span><strong>Se devolvió el dinero.</strong><span className="block text-xs mt-0.5" style={{ color: 'var(--ash)' }}>Actívalo solo si el colegio entregó físicamente o reintegró los fondos.</span></span>
      </label>}

      {recarga.caja_cerrada && <p className="text-xs rounded-lg p-2.5 mb-4" style={{ background: 'var(--red-light)', color: 'var(--red)' }}>La caja original ya cerró. El cierre no se modificará; el ajuste quedará vinculado y, si hubo devolución, afectará la caja actual.</p>}
      {bloqueadaPorSaldo && <p className="text-xs rounded-lg p-2.5 mb-4" style={{ background: 'var(--red-light)', color: 'var(--red)' }}>Este reverso excede el crédito de la tarjeta y requiere un administrador o director.</p>}
      {recarga.requiere_forzar_saldo && recarga.puede_forzar_saldo && <label className="flex items-start gap-2 text-sm mb-4"><input type="checkbox" checked={forzar} onChange={e => setForzar(e.target.checked)} className="mt-0.5" /><span>Autorizar saldo por debajo del límite de crédito.</span></label>}

      <label htmlFor="reverso-recarga-motivo" className="block text-xs uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>Motivo *</label>
      <textarea id="reverso-recarga-motivo" rows={3} maxLength={500} value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Ej. Monto cargado por error o recarga duplicada…" className="w-full px-3 py-2 rounded-xl outline-none resize-none bg-white" style={{ border: '1px solid var(--border-md)', fontSize: '16px' }} />
    </Modal>
  );
}

export default function HistorialRecargas({ refreshSignal, onCambio }) {
  const [datos, setDatos] = useState({ count: 0, results: [] });
  const [pagina, setPagina] = useState(1);
  const [busqueda, setBusqueda] = useState('');
  const [consulta, setConsulta] = useState('');
  const [estatus, setEstatus] = useState('');
  const [cargando, setCargando] = useState(true);
  const [modal, setModal] = useState(null);
  const abortRef = useRef(null);

  useEffect(() => {
    const nuevaConsulta = busqueda.trim();
    // En la carga inicial ambos valores ya son ''. No debemos encender el
    // spinner 300 ms después de que la respuesta llegó porque no habrá una
    // consulta nueva que vuelva a apagarlo.
    if (nuevaConsulta === consulta) return undefined;
    const timer = setTimeout(() => { setCargando(true); setConsulta(nuevaConsulta); setPagina(1); }, 300);
    return () => clearTimeout(timer);
  }, [busqueda, consulta]);

  const solicitar = useCallback(() => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    getHistorialRecargas({ page: pagina, page_size: PAGE_SIZE, q: consulta || undefined, estatus: estatus || undefined }, controller.signal)
      .then(res => setDatos(res.data))
      .catch(err => { if (err.code !== 'ERR_CANCELED') toast.error('No se pudo cargar el historial de recargas.'); })
      .finally(() => { if (!controller.signal.aborted) setCargando(false); });
    return () => controller.abort();
  }, [consulta, estatus, pagina]);

  useEffect(() => solicitar(), [solicitar, refreshSignal]);

  const refrescar = () => { setCargando(true); solicitar(); onCambio?.(); };
  const descargar = async recarga => {
    try {
      const res = await descargarComprobanteAnulacionRecarga(recarga.id);
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a'); a.href = url; a.download = `anulacion-recarga-${recarga.id}.pdf`; a.click();
      URL.revokeObjectURL(url);
    } catch { toast.error('No se pudo descargar el comprobante.'); }
  };
  const totalPaginas = Math.max(1, Math.ceil(datos.count / PAGE_SIZE));

  return <section className="rounded-2xl overflow-hidden" style={{ background: '#fff', border: '1px solid var(--border-md)' }}>
    <div className="p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3" style={{ borderBottom: '1px solid var(--border-md)' }}>
      <div><h2 className="font-semibold text-sm flex items-center gap-2" style={{ color: 'var(--jet)' }}><History size={16} style={{ color: 'var(--pb)' }} /> Historial de recargas</h2><p className="text-xs mt-0.5" style={{ color: 'var(--ash)' }}>Anula o corrige operaciones sin borrar su trazabilidad.</p></div>
      <div className="flex flex-col sm:flex-row gap-2">
        <label className="relative"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--ash)' }} /><input aria-label="Buscar recargas" value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Titular, serial o referencia…" className="h-10 pl-9 pr-3 rounded-xl text-sm outline-none w-full sm:w-64" style={{ border: '1px solid var(--border-md)' }} /></label>
        <select aria-label="Filtrar recargas" value={estatus} onChange={e => { setCargando(true); setEstatus(e.target.value); setPagina(1); }} className="h-10 px-3 rounded-xl text-sm" style={{ border: '1px solid var(--border-md)' }}><option value="">Todos los estados</option><option value="aprobado">Aprobadas</option><option value="anulado">Anuladas</option><option value="pendiente">Pendientes</option><option value="rechazado">Rechazadas</option></select>
      </div>
    </div>
    {cargando ? <div className="py-14 flex justify-center"><Loader2 className="animate-spin" style={{ color: 'var(--pb)' }} /></div> : datos.results.length === 0 ? <div className="py-14 text-center text-sm" style={{ color: 'var(--ash)' }}>No hay recargas que coincidan.</div> : <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-sm"><thead><tr style={{ background: 'var(--porcelain)' }}>{['Titular / tarjeta', 'Fecha', 'Método', 'Monto', 'Cajero', 'Estado', 'Acciones'].map(h => <th key={h} className="text-left px-4 py-3 text-xs uppercase tracking-wider" style={{ color: 'var(--ash)' }}>{h}</th>)}</tr></thead><tbody>{datos.results.map(r => {
      const estado = ESTADOS[r.estatus] || [r.estatus, 'var(--porcelain)', 'var(--ash)'];
      return <tr key={r.id} style={{ borderTop: '1px solid var(--border-md)' }}><td className="px-4 py-3"><strong>{r.titular_nombre || 'Sin titular'}</strong><span className="block text-xs font-mono" style={{ color: 'var(--ash)' }}>{r.tarjeta_serial}</span></td><td className="px-4 py-3 text-xs" style={{ color: 'var(--ash)' }}>{fecha(r.creado_en)}</td><td className="px-4 py-3">{METODOS[r.metodo_pago] || r.metodo_pago}<span className="block text-xs" style={{ color: 'var(--ash)' }}>{r.referencia || 'Sin referencia'}</span></td><td className="px-4 py-3 font-semibold">${Number(r.monto_usd).toFixed(2)}</td><td className="px-4 py-3">{r.cajero_nombre || r.cajero_username || 'Portal'}</td><td className="px-4 py-3"><span className="px-2 py-1 rounded-full text-xs font-medium" style={{ background: estado[1], color: estado[2] }}>{estado[0]}</span>{r.reemplaza_a && <span className="block text-[11px] mt-1" style={{ color: 'var(--ash)' }}>Corrige #{r.reemplaza_a}</span>}</td><td className="px-4 py-3"><div className="flex gap-1.5">{r.puede_corregir && <button onClick={() => setModal({ recarga: r, modo: 'corregir' })} title="Corregir monto" aria-label={`Corregir recarga ${r.id}`} className="p-2 rounded-lg" style={{ color: 'var(--pb)', background: 'var(--pb-light)' }}><Pencil size={15} /></button>}{r.puede_anular && <button onClick={() => setModal({ recarga: r, modo: 'anular' })} title="Anular recarga" aria-label={`Anular recarga ${r.id}`} className="p-2 rounded-lg" style={{ color: 'var(--red)', background: 'var(--red-light)' }}><Ban size={15} /></button>}{r.estatus === 'anulado' && <button onClick={() => descargar(r)} title="Descargar comprobante" aria-label={`Descargar comprobante ${r.id}`} className="p-2 rounded-lg" style={{ color: 'var(--ash)', background: 'var(--porcelain)' }}><Download size={15} /></button>}</div></td></tr>;
    })}</tbody></table></div>}
    <Pagination page={pagina} totalPages={totalPaginas} onPageChange={valor => { setCargando(true); setPagina(valor); }} total={datos.count} pageSize={PAGE_SIZE} />
    {modal && <ReversoModal {...modal} onClose={() => setModal(null)} onCompletado={refrescar} />}
  </section>;
}
