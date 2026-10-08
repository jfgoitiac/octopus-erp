import { useCallback, useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import { PageHeader } from '../components/ui/PageHeader';
import { Modal } from '../components/ui/Modal';
import { ErrorCampo } from '../components/ui/ErrorCampo';
import { actualizarPlantilla, crearPlantilla, listarPlantillas } from '../services/cuentasPagarService';
import { parseApiError } from '../utils/apiError';
import { campoErr, useErroresCampos } from '../utils/erroresCampos';

const INPUT = 'mt-1 w-full rounded-lg border border-slate-300 bg-white p-2 text-sm font-normal normal-case tracking-normal text-slate-900';
const LABEL = 'block text-xs font-medium uppercase tracking-wide text-slate-500';
const FRECUENCIAS = ['mensual', 'bimestral', 'trimestral', 'semestral', 'anual'];

export default function PlantillasRecurrentes() {
  const [items, setItems] = useState([]);
  const [abierta, setAbierta] = useState(false);
  const [datos, setDatos] = useState({ concepto: '', moneda: 'USD', monto: '', frecuencia: 'mensual', dia_vencimiento: 1, dias_anticipacion: 7, fecha_inicio: new Date().toISOString().slice(0, 10), prioridad: 'normal', activa: true });
  const { errores, marcar } = useErroresCampos(datos);
  const campo = (nombre, valor) => setDatos((x) => ({ ...x, [nombre]: valor }));

  const cargar = useCallback(async () => {
    try {
      const { data } = await listarPlantillas();
      setItems(data.results || data);
    } catch (e) {
      toast.error(parseApiError(e));
    }
  }, []);

  useEffect(() => {
    let activo = true;
    listarPlantillas()
      .then(({ data }) => { if (activo) setItems(data.results || data); })
      .catch((e) => { if (activo) toast.error(parseApiError(e)); });
    return () => { activo = false; };
  }, []);

  const guardar = async (e) => {
    e.preventDefault();
    try {
      await crearPlantilla(datos);
      toast.success('Plantilla creada.');
      setAbierta(false);
      cargar();
    } catch (x) {
      marcar(x);
      toast.error(parseApiError(x));
    }
  };

  const pausar = async (p) => {
    try {
      await actualizarPlantilla(p.id, { activa: !p.activa });
      cargar();
    } catch (e) {
      toast.error(parseApiError(e));
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader titulo="Plantillas recurrentes" descripcion="Generan cuentas periódicas sin duplicarlas." acciones={<button onClick={() => setAbierta(true)} className="rounded-lg px-4 py-2 text-white" style={{ background: 'var(--pb)' }}>Nueva plantilla</button>} />
      <div className="space-y-3">
        {items.map((p) => (
          <article key={p.id} className="rounded-xl border border-slate-200 p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between bg-white shadow-sm">
            <div><b>{p.concepto}</b><p className="text-sm text-slate-500">{p.frecuencia} · próxima generación: {p.proxima_generacion || '—'}</p></div>
            <button onClick={() => pausar(p)} className="rounded-lg border border-slate-300 bg-white hover:bg-slate-50 transition-colors px-3 py-2">{p.activa ? 'Pausar' : 'Reanudar'}</button>
          </article>
        ))}
        {!items.length && <p className="rounded-xl border border-slate-200 p-8 text-center text-slate-500 bg-white shadow-sm">No hay plantillas.</p>}
      </div>
      <Modal open={abierta} onClose={() => setAbierta(false)} titulo="Nueva plantilla" footer={<button form="plantilla-cxp" className="w-full sm:w-auto rounded-lg px-4 py-2 text-white" style={{ background: 'var(--pb)' }}>Guardar</button>}>
        <form id="plantilla-cxp" onSubmit={guardar} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className={`${LABEL} ${campoErr(errores, 'concepto')}`}>Concepto<input required placeholder="Concepto" value={datos.concepto} onChange={(e) => campo('concepto', e.target.value)} className={INPUT} /><ErrorCampo msg={errores.concepto} /></label>
          <label className={`${LABEL} ${campoErr(errores, 'frecuencia')}`}>Frecuencia<select value={datos.frecuencia} onChange={(e) => campo('frecuencia', e.target.value)} className={INPUT}>{FRECUENCIAS.map((x) => <option key={x}>{x}</option>)}</select><ErrorCampo msg={errores.frecuencia} /></label>
          <label className={`${LABEL} ${campoErr(errores, 'monto')}`}>Monto<input placeholder="Monto" value={datos.monto} onChange={(e) => campo('monto', e.target.value)} className={INPUT} /><ErrorCampo msg={errores.monto} /></label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={datos.activa} onChange={(e) => campo('activa', e.target.checked)} /> Activa</label>
        </form>
      </Modal>
    </div>
  );
}
