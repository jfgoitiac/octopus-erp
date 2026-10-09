import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Ban, ChevronLeft, CircleDollarSign, Landmark, Workflow } from 'lucide-react';
import { toast } from 'react-toastify';
import { PageHeader } from '../components/ui/PageHeader';
import { TablaScroll } from '../components/ui/TablaScroll';
import { Modal } from '../components/ui/Modal';
import SubirComprobantes from '../components/egresos/SubirComprobantes';
import DatoResumen from '../components/egresos/DatoResumen';
import EstadoBadge from '../components/egresos/EstadoBadge';
import { anularEgreso, eliminarComprobante, listarComprobantes, obtenerEgreso, subirComprobante } from '../services/egresosService';
import { fmt, fmtFecha } from '../utils/format';
import { parseApiError } from '../utils/apiError';

export default function EgresoDetalle() {
  const { id } = useParams(); const [egreso, setEgreso] = useState(null); const [comprobantes, setComprobantes] = useState([]); const [anulando, setAnulando] = useState(false);
  const [confirmando, setConfirmando] = useState(false); const [motivo, setMotivo] = useState('');
  const cargar = useCallback(async () => { try { const [{ data }, adjuntos] = await Promise.all([obtenerEgreso(id), listarComprobantes(id).catch(() => ({ data: [] }))]); setEgreso(data); setComprobantes(adjuntos.data.results || adjuntos.data); } catch (error) { toast.error(parseApiError(error)); } }, [id]);
  useEffect(() => { const timer = setTimeout(cargar, 0); return () => clearTimeout(timer); }, [cargar]);
  const agregar = async (archivos) => { try { await Promise.all(archivos.map((archivo) => { const form = new FormData(); form.append('archivo', archivo); return subirComprobante(id, form); })); toast.success('Comprobante(s) agregado(s).'); cargar(); } catch (error) { toast.error(parseApiError(error)); } };
  const retirar = async (archivo) => { try { await eliminarComprobante(id, archivo.id); toast.success('Comprobante retirado.'); cargar(); } catch (error) { toast.error(parseApiError(error)); } };
  const anular = async () => { if (!motivo.trim()) return; setAnulando(true); try { await anularEgreso(id, motivo.trim()); toast.success('Egreso anulado.'); setConfirmando(false); setMotivo(''); cargar(); } catch (error) { toast.error(parseApiError(error)); } finally { setAnulando(false); } };
  if (!egreso) {
    return (
      <div className="space-y-5" aria-busy="true">
        <div className="h-16 animate-pulse rounded-[var(--radius-card)] bg-[var(--surface-sunken)]" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">{[1, 2, 3].map((i) => <div key={i} className="h-[104px] animate-pulse rounded-[var(--radius-card)] bg-[var(--surface-sunken)]" />)}</div>
      </div>
    );
  }
  const pagos = egreso.pagos_cuenta_por_pagar || []; const editable = egreso.estado !== 'anulado';
  const esCxp = egreso.origen === 'cuenta_por_pagar';
  return (
    <div className="space-y-5">
      <PageHeader
        titulo={`Egreso ${egreso.numero_documento || `#${id}`}`}
        descripcion={`${egreso.proveedor_nombre || 'Proveedor'} · ${fmtFecha(egreso.fecha_egreso)}`}
        acciones={<div className="flex items-center justify-between gap-3 sm:justify-end"><EstadoBadge estado={egreso.estado} /><Link to="/egresos/movimientos" className="btn btn-secondary"><ChevronLeft size={16} /> Volver</Link></div>}
      />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <DatoResumen icono={CircleDollarSign} etiqueta="Monto USD" valor={`$ ${fmt(egreso.monto_usd, 2)}`} />
        <DatoResumen icono={Landmark} etiqueta="Monto en bolívares" valor={`Bs. ${fmt(egreso.monto_ves, 2)}`} />
        <DatoResumen
          icono={Workflow}
          etiqueta="Origen"
          valor={<span className="text-base sm:text-lg">{esCxp ? 'Cuenta por pagar liquidada' : 'Factura de contado'}</span>}
          detalle={egreso.cuenta_por_pagar_id ? <Link to={`/cuentas-por-pagar/${egreso.cuenta_por_pagar_id}`} className="font-medium text-[var(--pb-mid)] underline-offset-2 hover:underline">Ver cuenta por pagar</Link> : undefined}
        />
      </div>
      <section aria-label="Datos del documento" className="grid grid-cols-1 gap-x-6 gap-y-3 rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ['Proveedor', egreso.proveedor_nombre],
          ['Categoría', egreso.categoria_nombre],
          ['N.º documento', egreso.numero_documento],
          ['Fecha del egreso', fmtFecha(egreso.fecha_egreso)],
        ].map(([etiqueta, valor]) => (
          <div key={etiqueta} className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--ash)]">{etiqueta}</p>
            <p className="mt-0.5 break-words text-sm font-medium text-[var(--jet)]">{valor || '—'}</p>
          </div>
        ))}
      </section>
      {pagos.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-[var(--jet)] sm:text-base">Histórico de abonos</h2>
          <TablaScroll>
            <table className="min-w-[680px] w-full text-sm">
              <thead className="border-b border-[var(--border)] text-left text-xs font-medium uppercase tracking-wider text-[var(--ash)]">
                <tr><th className="p-2 text-left">Fecha</th><th className="p-2 text-left">Método</th><th className="p-2 text-right">Tasa</th><th className="p-2 text-right">USD</th><th className="p-2 text-right">VES</th><th className="p-2 text-left">Referencia</th></tr>
              </thead>
              <tbody>
                {pagos.map((p, i) => (
                  <tr key={p.id || i} className="border-t border-[var(--border)]">
                    <td className="whitespace-nowrap p-2 tabular-nums">{fmtFecha(p.fecha_pago)}</td>
                    <td className="p-2">{p.metodo_pago}</td>
                    <td className="p-2 text-right tabular-nums">{fmt(p.tasa_aplicada, 2)}</td>
                    <td className="p-2 text-right tabular-nums">$ {fmt(p.monto_usd, 2)}</td>
                    <td className="p-2 text-right tabular-nums">Bs. {fmt(p.monto_ves, 2)}</td>
                    <td className="p-2">{p.referencia || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TablaScroll>
        </section>
      )}
      <SubirComprobantes archivos={comprobantes} onChange={setComprobantes} onAgregar={agregar} onEliminar={retirar} disabled={!editable} />
      {editable && !esCxp && <button onClick={() => setConfirmando(true)} className="btn btn-secondary w-full text-[var(--red)] sm:w-auto"><Ban size={16} /> Anular egreso</button>}
      <Modal open={confirmando} onClose={() => !anulando && setConfirmando(false)} titulo="Anular egreso" size="sm"
        footer={<><button type="button" onClick={() => setConfirmando(false)} disabled={anulando} className="btn btn-secondary w-full sm:w-auto">Cancelar</button><button type="button" onClick={anular} disabled={anulando || !motivo.trim()} className="btn btn-primary w-full sm:w-auto">{anulando ? 'Anulando…' : 'Anular egreso'}</button></>}>
        <p className="text-sm text-[var(--jet)]">Esta acción marca el egreso como anulado y deja de sumar al gasto. Queda registrado el motivo.</p>
        <label className="mt-4 block text-xs font-medium uppercase tracking-wide text-[var(--ash)]">Motivo de anulación
          <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={3} className="input mt-1 w-full" placeholder="Ej.: factura duplicada" autoFocus />
        </label>
      </Modal>
    </div>
  );
}
