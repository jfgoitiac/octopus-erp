import { useEffect, useState } from 'react';
import { BarChart3, Loader2, Plus, Trash2 } from 'lucide-react';
import { toast } from 'react-toastify';
import { addMonths, format, parseISO, subDays } from 'date-fns';
import { es } from 'date-fns/locale';
import { TablaScroll } from '../ui/TablaScroll';
import { Modal } from '../ui/Modal';
import {
  actualizarConfiguracionMetaBanco, crearMetaBanco, eliminarMetaBanco,
  getConfiguracionMetaBanco, getMetasBanco,
} from '../../api/cobranza.service';

const METODOS = {
  transferencia: 'Transferencia', pago_movil: 'Pago móvil',
  punto_de_venta: 'Punto de venta', zelle: 'Zelle',
};
const fechaLocal = () => {
  const ahora = new Date();
  const desfase = ahora.getTimezoneOffset() * 60_000;
  return new Date(ahora.getTime() - desfase).toISOString().slice(0, 10);
};
const HOY = fechaLocal();
const PERIODICIDADES = { mensual: 'Mensual', trimestral: 'Trimestral', personalizado: 'Personalizado' };
const MESES_PERIODO = { mensual: 1, trimestral: 3 };
// Fin = inicio + N meses - 1 día (misma regla que el backend).
const calcularFin = (inicio, periodicidad) => {
  const meses = MESES_PERIODO[periodicidad];
  if (!meses || !inicio) return null;
  return format(subDays(addMonths(parseISO(inicio), meses), 1), 'yyyy-MM-dd');
};
const inicial = { banco: '', metodo_pago: '', objetivo_usd: '', periodicidad: 'mensual', fecha_inicio: HOY, fecha_fin: calcularFin(HOY, 'mensual') };
const fechaVisible = (fecha) => format(parseISO(fecha), "d 'de' MMM. yyyy", { locale: es });

export default function MetasBancoTab({ bancos = [] }) {
  const [habilitada, setHabilitada] = useState(false);
  const [metas, setMetas] = useState([]);
  const [form, setForm] = useState(inicial);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [modalAbierto, setModalAbierto] = useState(false);

  const cargar = async () => {
    setCargando(true);
    try {
      const [parametros, metasRes] = await Promise.all([getConfiguracionMetaBanco(), getMetasBanco()]);
      setHabilitada(Boolean(parametros.data?.habilitada));
      setMetas(metasRes.data || []);
    } catch { toast.error('No se pudo cargar la configuración de Meta de banco.'); }
    finally { setCargando(false); }
  };
  useEffect(() => {
    // Diferir la carga deja el efecto como una suscripción limpia y evita una
    // actualización de estado síncrona durante el commit inicial de React.
    let cancelada = false;
    queueMicrotask(() => { if (!cancelada) cargar(); });
    return () => { cancelada = true; };
  // cargar no depende de valores reactivos; se ejecuta una vez al montar.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const bancosActivos = bancos.filter(b => b.activo);
  const bancoActual = bancosActivos.find(b => String(b.id) === String(form.banco));
  const metodos = (bancoActual?.tipos || []).filter(tipo => METODOS[tipo]);

  const cambiarPeriodo = (cambios) => {
    const siguiente = { ...form, ...cambios };
    const fin = calcularFin(siguiente.fecha_inicio, siguiente.periodicidad);
    setForm(fin ? { ...siguiente, fecha_fin: fin } : siguiente);
  };
  const toggle = async (checked) => {
    setHabilitada(checked);
    try { await actualizarConfiguracionMetaBanco(checked); }
    catch { setHabilitada(!checked); toast.error('No se pudo actualizar Meta de banco.'); }
  };
  const agregar = async () => {
    if (!form.banco || !form.metodo_pago || !form.objetivo_usd || !form.fecha_inicio || !form.fecha_fin) {
      toast.warning('Completa banco, método, meta y período.'); return;
    }
    setGuardando(true);
    try {
      const { data } = await crearMetaBanco({ ...form, banco: Number(form.banco), objetivo_usd: Number(form.objetivo_usd).toFixed(2) });
      setMetas(prev => [data, ...prev]); setForm(inicial); setModalAbierto(false); toast.success('Meta de banco agregada.');
    } catch (err) { toast.error(err.response?.data?.detail || 'No se pudo guardar la meta.'); }
    finally { setGuardando(false); }
  };
  const eliminar = async (id) => {
    try { await eliminarMetaBanco(id); setMetas(prev => prev.filter(m => m.id !== id)); }
    catch { toast.error('No se pudo eliminar la meta.'); }
  };

  return <section className="rounded-xl overflow-hidden lg:col-span-2" style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)' }}>
    <div className="px-5 py-3.5 flex flex-wrap items-center justify-between gap-3" style={{ borderBottom: '0.5px solid var(--border-md)', background: 'var(--bg)' }}>
      <div className="flex items-center gap-3"><div className="p-1.5 rounded-lg" style={{ background: 'var(--pb-light)' }}><BarChart3 size={15} style={{ color: 'var(--pb)' }} /></div><div><h3 className="text-sm font-semibold" style={{ color: 'var(--jet)' }}>Meta de banco</h3><p className="text-xs" style={{ color: 'var(--ash)' }}>Seguimiento opcional de pagos de Cobranza por banco y método.</p></div></div>
      <div className="flex items-center gap-3"><label className="flex items-center gap-2 text-sm font-medium" style={{ color: 'var(--jet)' }}><span>{habilitada ? 'Activa' : 'Desactivada'}</span><input type="checkbox" checked={habilitada} onChange={e => toggle(e.target.checked)} disabled={cargando} /></label>{habilitada && <button type="button" onClick={() => setModalAbierto(true)} className="btn btn-primary"><Plus size={15} /> Agregar meta</button>}</div>
    </div>
    {cargando ? <div className="flex justify-center py-8"><Loader2 className="animate-spin" size={22} style={{ color: 'var(--pb)' }} /></div> : <div className="p-5 space-y-4">
      <p className="text-xs" style={{ color: 'var(--ash)' }}>Solo las combinaciones configuradas muestran avance al registrar pagos. El acumulado usa el monto USD guardado en cada pago.</p>
      {habilitada && <TablaScroll><table className="w-full min-w-[750px] text-sm"><thead><tr style={{ color: 'var(--ash)' }}><th className="text-left p-2">Banco</th><th className="text-left p-2">Método</th><th className="text-right p-2">Meta USD</th><th className="text-left p-2">Tipo</th><th className="text-left p-2">Período</th><th /></tr></thead><tbody>{metas.map(m => <tr key={m.id} style={{ borderTop: '0.5px solid var(--border-md)' }}><td className="p-2 font-medium">{m.banco_nombre}</td><td className="p-2">{METODOS[m.metodo_pago] || m.metodo_pago}</td><td className="p-2 text-right">${Number(m.objetivo_usd).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td><td className="p-2">{PERIODICIDADES[m.periodicidad] || 'Personalizado'}</td><td className="p-2">{fechaVisible(m.fecha_inicio)} — {fechaVisible(m.fecha_fin)}</td><td className="p-2 text-right"><button type="button" onClick={() => eliminar(m.id)} title="Eliminar meta" style={{ color: 'var(--red)' }}><Trash2 size={16} /></button></td></tr>)}{!metas.length && <tr><td colSpan="6" className="p-4 text-center" style={{ color: 'var(--ash)' }}>Aún no hay metas configuradas.</td></tr>}</tbody></table></TablaScroll>}
    </div>}
    <Modal open={modalAbierto} onClose={() => setModalAbierto(false)} titulo="Nueva meta de banco" size="lg" footer={<><button type="button" onClick={() => setModalAbierto(false)} className="btn btn-secondary">Cancelar</button><button type="button" onClick={agregar} disabled={guardando} className="btn btn-primary"><Plus size={15} /> Guardar meta</button></>}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <label className="text-xs">Banco<select value={form.banco} onChange={e => setForm({ ...form, banco: e.target.value, metodo_pago: '' })} className="mt-1 w-full input"><option value="">Seleccionar…</option>{bancosActivos.map(b => <option key={b.id} value={b.id}>{b.nombre}</option>)}</select></label>
        <label className="text-xs">Método<select value={form.metodo_pago} onChange={e => setForm({ ...form, metodo_pago: e.target.value })} disabled={!form.banco} className="mt-1 w-full input"><option value="">Seleccionar…</option>{metodos.map(m => <option key={m} value={m}>{METODOS[m]}</option>)}</select></label>
        <label className="text-xs">Meta (USD)<input type="number" min="0.01" step="0.01" value={form.objetivo_usd} onChange={e => setForm({ ...form, objetivo_usd: e.target.value })} className="mt-1 w-full input" placeholder="3000.00" /></label>
        <label className="text-xs sm:col-span-2">Período
          <select value={form.periodicidad} onChange={e => cambiarPeriodo({ periodicidad: e.target.value })} className="mt-1 w-full input">
            {Object.entries(PERIODICIDADES).map(([valor, etiqueta]) => <option key={valor} value={valor}>{etiqueta}</option>)}
          </select>
        </label>
        <label className="text-xs">Inicio<input type="date" value={form.fecha_inicio} onChange={e => cambiarPeriodo({ fecha_inicio: e.target.value })} className="mt-1 w-full input" /></label>
        <label className="text-xs">Fin<input type="date" value={form.fecha_fin} onChange={e => setForm({ ...form, fecha_fin: e.target.value })} disabled={form.periodicidad !== 'personalizado'} className="mt-1 w-full input" /></label>
      </div>
    </Modal>
  </section>;
}
