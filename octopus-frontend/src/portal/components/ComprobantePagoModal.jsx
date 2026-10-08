import { useState, useRef, useEffect, useCallback } from 'react';
import { Upload, X, FileText, CheckCircle, AlertCircle, Hash, Camera } from 'lucide-react';
import { toast } from 'react-toastify';
import { subirComprobante, getMetodosPago } from '../api/portal.service';
import { Modal } from '../../components/ui/Modal';
import { fmtMonto, montoEnBs } from '../utils/montos';

const TIPOS_PERMITIDOS = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
const MAX_BYTES = 10 * 1024 * 1024;
const METODOS_CON_REFERENCIA = ['transferencia', 'pago_movil', 'punto_de_venta', 'zelle'];
const ETIQUETAS_DATOS = { titular: 'Titular', identificacion: 'Cédula / RIF', numero_cuenta: 'Número de cuenta', telefono: 'Teléfono', correo: 'Correo Zelle', instrucciones: 'Indicaciones' };

const ComprobantePagoModal = ({ isOpen, onClose, mensualidad, onSuccess, tasaBcv = null }) => {
  const [archivo, setArchivo] = useState(null);
  const [preview, setPreview] = useState(null);
  const [esPDF, setEsPDF] = useState(false);
  const [estado, setEstado] = useState('idle');
  const [metodos, setMetodos] = useState([]);
  const [metodoSeleccionado, setMetodoSeleccionado] = useState(null);
  const [referencia, setReferencia] = useState('');
  const inputRef = useRef(null);
  const timerRef = useRef(null);

  const cerrar = useCallback(() => {
    clearTimeout(timerRef.current);
    setArchivo(null); setPreview(null); setEsPDF(false); setEstado('idle'); setReferencia(''); setMetodoSeleccionado(null);
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) return;
    getMetodosPago().then(res => setMetodos(res.data || [])).catch(() => setMetodos([]));
  }, [isOpen]);

  if (!isOpen || !mensualidad) return null;

  const metodoPago = metodoSeleccionado?.metodo || '';
  const referenciaObligatoria = METODOS_CON_REFERENCIA.includes(metodoPago);
  const seleccionarArchivo = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    if (!TIPOS_PERMITIDOS.includes(file.type)) { toast.error('Formato no permitido. Solo JPG, PNG, WEBP o PDF.'); event.target.value = ''; return; }
    if (file.size > MAX_BYTES) { toast.error('El archivo supera el límite de 10 MB.'); event.target.value = ''; return; }
    setArchivo(file); setEstado('idle');
    if (file.type === 'application/pdf') { setEsPDF(true); setPreview(null); } else { setEsPDF(false); setPreview(URL.createObjectURL(file)); }
  };
  const enviar = async () => {
    if (!metodoSeleccionado) return toast.warning('Selecciona el método de pago.');
    if (!archivo) return toast.warning('Selecciona un archivo primero.');
    if (referenciaObligatoria && !referencia.trim()) return toast.warning('Debes ingresar el número de referencia o confirmación.');
    setEstado('uploading');
    try {
      const bancoId = ['transferencia', 'pago_movil'].includes(metodoPago) ? metodoSeleccionado.banco_id : '';
      await subirComprobante(mensualidad.id, archivo, referencia.trim(), metodoPago, bancoId);
      setEstado('success'); toast.success('Comprobante enviado correctamente. Pendiente de revisión.'); onSuccess?.(); timerRef.current = setTimeout(cerrar, 1500);
    } catch (err) { setEstado('error'); toast.error(err?.response?.data?.error || 'Error al subir el comprobante. Intenta nuevamente.'); }
  };

  return <Modal open onClose={cerrar} size="sm" titulo="Enviar comprobante" footer={<button type="button" onClick={enviar} disabled={!archivo || !metodoSeleccionado || estado === 'uploading' || estado === 'success'} className="w-full bg-[var(--portal-primary)] text-white font-medium py-3 rounded-xl min-h-[44px] disabled:opacity-50 flex items-center justify-center gap-2">{estado === 'uploading' ? <><span className="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full" />Enviando…</> : <><Upload size={16} />Enviar comprobante</>}</button>}>
    <div className="space-y-4">
      <p className="text-xs text-[var(--ash)]">{mensualidad.mes_nombre} {mensualidad.anio} — REF. {fmtMonto(mensualidad.monto_total ?? mensualidad.monto_usd)}{tasaBcv ? ` · Bs. ${fmtMonto(montoEnBs(mensualidad.monto_total ?? mensualidad.monto_usd, tasaBcv))}` : ''}</p>
      <div className="space-y-2" role="group" aria-labelledby="comprobante-metodo"><p id="comprobante-metodo" className="text-xs font-semibold text-[var(--jet-mid)]">Selecciona cómo realizaste el pago</p>{metodos.length === 0 ? <p className="text-xs rounded-xl bg-[var(--yellow-light)] text-[var(--yellow)] px-3 py-2.5">No hay métodos disponibles. Contacta a administración.</p> : <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">{metodos.map(metodo => <button key={metodo.id} type="button" aria-pressed={metodoSeleccionado?.id === metodo.id} onClick={() => { setMetodoSeleccionado(metodo); setReferencia(''); }} className={`text-left rounded-xl border px-3 py-2.5 min-h-[44px] ${metodoSeleccionado?.id === metodo.id ? 'border-[var(--portal-primary)] bg-[var(--portal-primary)]/10' : 'border-[var(--border)] bg-[var(--surface)]'}`}><p className="text-sm font-semibold text-[var(--jet-mid)]">{metodo.nombre}</p><p className="text-xs text-[var(--ash)]">{metodo.banco}</p></button>)}</div>}</div>
      {metodoSeleccionado && <><div className="rounded-xl bg-[var(--surface-sunken)] p-3 space-y-1.5"><p className="text-xs font-semibold text-[var(--jet-mid)]">Datos para {metodoSeleccionado.nombre}</p><p className="text-xs font-medium text-[var(--jet-mid)]">{metodoSeleccionado.banco}</p>{Object.entries(metodoSeleccionado.datos || {}).filter(([, valor]) => valor).map(([campo, valor]) => <p key={campo} className="text-xs text-[var(--jet-mid)]"><span className="text-[var(--ash)]">{ETIQUETAS_DATOS[campo] || campo}:</span> {valor}</p>)}</div>
        {!archivo ? <div className="grid grid-cols-1 sm:grid-cols-2 gap-3"><label className="flex flex-col items-center justify-center gap-2 p-4 rounded-2xl border-2 border-dashed border-[var(--border)] cursor-pointer hover:border-[var(--portal-primary)] focus-within:border-[var(--portal-primary)] min-h-[90px]"><Camera size={26} className="text-[var(--portal-primary)]" /><span className="text-sm font-medium text-[var(--jet-mid)]">Cámara</span><input type="file" accept="image/*" capture="environment" className="sr-only" onChange={seleccionarArchivo} /></label><label className="flex flex-col items-center justify-center gap-2 p-4 rounded-2xl border-2 border-dashed border-[var(--border)] cursor-pointer hover:border-[var(--portal-primary)] focus-within:border-[var(--portal-primary)] min-h-[90px]"><Upload size={26} className="text-[var(--ash)]" /><span className="text-sm font-medium text-[var(--jet-mid)]">Archivo</span><input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="sr-only" onChange={seleccionarArchivo} /></label></div> : <div className="relative">{esPDF ? <div className="flex flex-col items-center gap-2 p-5 rounded-2xl bg-[var(--surface-sunken)] text-[var(--portal-primary)]"><FileText size={40} /><span className="text-sm text-[var(--jet-mid)] break-all">{archivo.name}</span></div> : <img src={preview} alt="Vista previa del comprobante" className="w-full max-h-48 rounded-2xl object-contain bg-[var(--surface-sunken)]" />}<button type="button" onClick={() => { setArchivo(null); setPreview(null); setEsPDF(false); setEstado('idle'); }} className="absolute top-1 right-1 w-11 h-11 bg-black/50 rounded-full flex items-center justify-center" aria-label="Quitar archivo"><X size={14} className="text-white" /></button></div>}
        <div className="space-y-1"><label htmlFor="comprobante-referencia" className="text-xs font-semibold text-[var(--jet-mid)] flex items-center gap-1"><Hash size={12} aria-hidden="true" />Número de referencia / confirmación {referenciaObligatoria && <span className="text-[var(--red)]">*</span>}</label><input id="comprobante-referencia" type="text" value={referencia} onChange={event => setReferencia(event.target.value)} placeholder="Ej: 12345678" className="w-full border border-[var(--border)] rounded-xl px-3 py-3 text-base text-[var(--jet-mid)] focus:outline-none focus:ring-2 focus:ring-[var(--portal-primary)] uppercase" maxLength={100} autoComplete="off" /></div></>}
      {estado === 'success' && <div role="status" className="flex items-center gap-2 bg-[var(--green-light)] text-[var(--green)] rounded-xl px-4 py-3 text-sm"><CheckCircle size={18} /><span>Comprobante enviado. En revisión.</span></div>}{estado === 'error' && <div role="alert" className="flex items-center gap-2 bg-[var(--red-light)] text-[var(--red)] rounded-xl px-4 py-3 text-sm"><AlertCircle size={18} /><span>No se pudo enviar. Intenta nuevamente.</span></div>}
    </div>
  </Modal>;
};

export default ComprobantePagoModal;
