import { useState, useRef, useEffect, useCallback } from 'react';
import { Upload, X, FileText, CheckCircle, AlertCircle, Hash, Camera } from 'lucide-react';
import { toast } from 'react-toastify';
import { subirComprobante, getMetodosPago } from '../api/portal.service';
import { useFocusTrap } from '../../hooks/useFocusTrap';

const TIPOS_PERMITIDOS = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
const MAX_BYTES = 10 * 1024 * 1024;
const METODOS_CON_REFERENCIA = ['transferencia', 'pago_movil', 'punto_de_venta', 'zelle'];
const ETIQUETAS_DATOS = { titular: 'Titular', identificacion: 'Cédula / RIF', numero_cuenta: 'Número de cuenta', telefono: 'Teléfono', correo: 'Correo Zelle', instrucciones: 'Indicaciones' };

const ComprobantePagoModal = ({ isOpen, onClose, mensualidad, onSuccess }) => {
  const [archivo, setArchivo] = useState(null);
  const [preview, setPreview] = useState(null);
  const [esPDF, setEsPDF] = useState(false);
  const [estado, setEstado] = useState('idle');
  const [metodos, setMetodos] = useState([]);
  const [metodoSeleccionado, setMetodoSeleccionado] = useState(null);
  const [referencia, setReferencia] = useState('');
  const inputRef = useRef(null);
  const containerRef = useRef(null);
  const timerRef = useRef(null);
  useFocusTrap(containerRef, isOpen);

  const cerrar = useCallback(() => {
    clearTimeout(timerRef.current);
    setArchivo(null); setPreview(null); setEsPDF(false); setEstado('idle'); setReferencia(''); setMetodoSeleccionado(null);
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) return;
    getMetodosPago().then(res => setMetodos(res.data || [])).catch(() => setMetodos([]));
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (event) => { if (event.key === 'Escape') cerrar(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, cerrar]);

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

  return <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 px-0 sm:px-4">
    <div ref={containerRef} role="dialog" aria-modal="true" aria-labelledby="modal-comprobante-titulo" className="bg-white w-full max-w-[480px] rounded-t-3xl sm:rounded-2xl p-5 space-y-4 max-h-[92vh] overflow-y-auto">
      <div className="flex items-center justify-between"><div><h2 id="modal-comprobante-titulo" className="font-semibold text-gray-800 text-base">Enviar comprobante</h2><p className="text-xs text-gray-500 mt-0.5">{mensualidad.mes_nombre} {mensualidad.anio} — ${mensualidad.monto_usd} USD</p></div><button onClick={cerrar} aria-label="Cerrar modal" className="w-11 h-11 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400"><X size={20} /></button></div>
      <div className="space-y-2"><p className="text-xs font-semibold text-gray-600">Selecciona cómo realizaste el pago</p>{metodos.length === 0 ? <p className="text-xs rounded-xl bg-amber-50 text-amber-700 px-3 py-2.5">No hay métodos disponibles. Contacta a administración.</p> : <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">{metodos.map(metodo => <button key={metodo.id} type="button" onClick={() => { setMetodoSeleccionado(metodo); setReferencia(''); }} className={`text-left rounded-xl border px-3 py-2.5 ${metodoSeleccionado?.id === metodo.id ? 'border-[var(--portal-primary,#0fa3b1)] bg-[var(--portal-primary,#0fa3b1)]/10' : 'border-gray-200 bg-white'}`}><p className="text-sm font-semibold text-gray-700">{metodo.nombre}</p><p className="text-xs text-gray-500">{metodo.banco}</p></button>)}</div>}</div>
      {metodoSeleccionado && <><div className="rounded-xl bg-gray-50 p-3 space-y-1.5"><p className="text-xs font-semibold text-gray-700">Datos para {metodoSeleccionado.nombre}</p><p className="text-xs font-medium text-gray-700">{metodoSeleccionado.banco}</p>{Object.entries(metodoSeleccionado.datos || {}).filter(([, valor]) => valor).map(([campo, valor]) => <p key={campo} className="text-xs text-gray-600"><span className="text-gray-400">{ETIQUETAS_DATOS[campo] || campo}:</span> {valor}</p>)}</div>
        {!archivo ? <div className="grid grid-cols-1 sm:grid-cols-2 gap-3"><label className="flex flex-col items-center justify-center gap-2 p-4 rounded-2xl border-2 border-dashed border-gray-200 cursor-pointer hover:border-[var(--portal-primary,#0fa3b1)] min-h-[90px]"><Camera size={26} className="text-[var(--portal-primary,#0fa3b1)]" /><span className="text-sm font-medium text-gray-600">Cámara</span><input type="file" accept="image/*" capture="environment" className="hidden" onChange={seleccionarArchivo} /></label><label className="flex flex-col items-center justify-center gap-2 p-4 rounded-2xl border-2 border-dashed border-gray-200 cursor-pointer hover:border-[var(--portal-primary,#0fa3b1)] min-h-[90px]"><Upload size={26} className="text-gray-400" /><span className="text-sm font-medium text-gray-600">Archivo</span><input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="hidden" onChange={seleccionarArchivo} /></label></div> : <div className="relative">{esPDF ? <div className="flex flex-col items-center gap-2 p-5 rounded-2xl bg-gray-50 text-[var(--portal-primary,#0fa3b1)]"><FileText size={40} /><span className="text-sm text-gray-600 break-all">{archivo.name}</span></div> : <img src={preview} alt="Vista previa del comprobante" className="w-full max-h-48 rounded-2xl object-contain bg-gray-50" />}<button type="button" onClick={() => { setArchivo(null); setPreview(null); setEsPDF(false); setEstado('idle'); }} className="absolute top-2 right-2 w-8 h-8 bg-black/50 rounded-full flex items-center justify-center" aria-label="Quitar archivo"><X size={14} className="text-white" /></button></div>}
        <div className="space-y-1"><label className="text-xs font-semibold text-gray-600 flex items-center gap-1"><Hash size={12} />Número de referencia / confirmación {referenciaObligatoria && <span className="text-red-500">*</span>}</label><input type="text" value={referencia} onChange={event => setReferencia(event.target.value)} placeholder="Ej: 12345678" className="w-full border border-gray-200 rounded-xl px-3 py-3 text-base text-gray-700 focus:outline-none focus:ring-2 focus:ring-[var(--portal-primary,#0fa3b1)] uppercase" maxLength={100} autoComplete="off" /></div></>}
      {estado === 'success' && <div className="flex items-center gap-2 bg-green-50 text-green-700 rounded-xl px-4 py-3 text-sm"><CheckCircle size={18} /><span>Comprobante enviado. En revisión.</span></div>}{estado === 'error' && <div className="flex items-center gap-2 bg-red-50 text-red-700 rounded-xl px-4 py-3 text-sm"><AlertCircle size={18} /><span>No se pudo enviar. Intenta nuevamente.</span></div>}
      <button onClick={enviar} disabled={!archivo || !metodoSeleccionado || estado === 'uploading' || estado === 'success'} className="w-full bg-[var(--portal-primary,#0fa3b1)] text-white font-medium py-3 rounded-xl disabled:opacity-50 flex items-center justify-center gap-2">{estado === 'uploading' ? <><span className="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full" />Enviando...</> : <><Upload size={16} />Enviar comprobante</>}</button>
    </div>
  </div>;
};

export default ComprobantePagoModal;
