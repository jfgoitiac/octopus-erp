import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Ban, ChevronLeft, CircleDollarSign, Landmark, Workflow } from 'lucide-react';
import { toast } from 'react-toastify';
import { PageHeader } from '../components/ui/PageHeader';
import { TablaScroll } from '../components/ui/TablaScroll';
import SubirComprobantes from '../components/egresos/SubirComprobantes';
import DatoResumen from '../components/egresos/DatoResumen';
import EstadoBadge from '../components/egresos/EstadoBadge';
import { anularEgreso, eliminarComprobante, listarComprobantes, obtenerEgreso, subirComprobante } from '../services/egresosService';
import { fmt, fmtFecha } from '../utils/format';
import { parseApiError } from '../utils/apiError';

export default function EgresoDetalle() {
  const { id } = useParams(); const [egreso, setEgreso] = useState(null); const [comprobantes, setComprobantes] = useState([]); const [anulando, setAnulando] = useState(false);
  const cargar = useCallback(async () => { try { const [{ data }, adjuntos] = await Promise.all([obtenerEgreso(id), listarComprobantes(id).catch(() => ({ data: [] }))]); setEgreso(data); setComprobantes(adjuntos.data.results || adjuntos.data); } catch (error) { toast.error(parseApiError(error)); } }, [id]);
  useEffect(() => { const timer = setTimeout(cargar, 0); return () => clearTimeout(timer); }, [cargar]);
  const agregar = async (archivos) => { try { await Promise.all(archivos.map((archivo) => { const form = new FormData(); form.append('archivo', archivo); return subirComprobante(id, form); })); toast.success('Comprobante(s) agregado(s).'); cargar(); } catch (error) { toast.error(parseApiError(error)); } };
  const retirar = async (archivo) => { try { await eliminarComprobante(id, archivo.id); toast.success('Comprobante retirado.'); cargar(); } catch (error) { toast.error(parseApiError(error)); } };
  const anular = async () => { const motivo = window.prompt('Indica el motivo de anulación:'); if (!motivo?.trim()) return; setAnulando(true); try { await anularEgreso(id, motivo); toast.success('Egreso anulado.'); cargar(); } catch (error) { toast.error(parseApiError(error)); } finally { setAnulando(false); } };
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
        acciones={<div className="flex items-center justify-between gap-3 sm:justify-end"><EstadoBadge estado={egreso.estado} /><Link to="/egresos" className="btn btn-secondary"><ChevronLeft size={16} /> Volver</Link></div>}
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
      {editable && !esCxp && <button onClick={anular} disabled={anulando} className="btn btn-secondary w-full text-[var(--red)] sm:w-auto"><Ban size={16} /> {anulando ? 'Anulando…' : 'Anular egreso'}</button>}
    </div>
  );
}
