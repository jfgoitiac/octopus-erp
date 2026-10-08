import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { PageHeader } from '../components/ui/PageHeader';
import EgresoFormContenido from '../components/egresos/EgresoForm';
import SubirComprobantes from '../components/egresos/SubirComprobantes';
import { crearEgreso, subirComprobante } from '../services/egresosService';
import { parseApiError } from '../utils/apiError';

export default function EgresoForm() {
  const navegar = useNavigate(); const [guardando, setGuardando] = useState(false); const [pendiente, setPendiente] = useState(null);
  const subir = async (id, archivos) => { const fallidos = []; for (const archivo of archivos) { try { const form = new FormData(); form.append('archivo', archivo); await subirComprobante(id, form); } catch { fallidos.push(archivo); } } return fallidos; };
  const guardar = async (datos) => { setGuardando(true); try { const { comprobantes, ...cuerpo } = datos; const { data } = await crearEgreso(cuerpo); const fallidos = await subir(data.id, comprobantes); if (fallidos.length) { setPendiente({ id: data.id, archivos: fallidos }); toast.warning(`Egreso registrado; ${fallidos.length} comprobante(s) requieren reintento.`); return; } toast.success('Egreso de contado registrado.'); navegar(`/egresos/${data.id}`); } catch (error) { toast.error(parseApiError(error)); return error; } finally { setGuardando(false); } };
  const reintentar = async (archivos) => { if (!pendiente) return; const fallidos = await subir(pendiente.id, archivos); if (fallidos.length) { setPendiente((x) => ({ ...x, archivos: fallidos })); toast.error('Aún hay comprobantes pendientes.'); } else { toast.success('Comprobantes cargados.'); navegar(`/egresos/${pendiente.id}`); } };
  return <div className="animate-fadeIn"><PageHeader titulo="Nuevo egreso" descripcion="Registro exclusivo de compras y pagos de contado" />{pendiente ? <section className="space-y-3 rounded-xl border border-[var(--yellow)] bg-[var(--yellow-light)] p-4"><p className="text-sm text-[var(--yellow)]">El egreso quedó registrado, pero algunos comprobantes no se pudieron subir. Reinténtalos ahora.</p><SubirComprobantes archivos={pendiente.archivos} onChange={(archivos) => setPendiente((x) => ({ ...x, archivos }))} onAgregar={reintentar} /><button onClick={() => reintentar(pendiente.archivos)} className="btn btn-primary w-full sm:w-auto">Reintentar comprobantes</button></section> : <EgresoFormContenido onGuardar={guardar} guardando={guardando} />}</div>;
}
