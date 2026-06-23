import { useState, useRef, useEffect, useCallback } from 'react';
import { Upload, X, FileText, CheckCircle, AlertCircle, Hash, Camera } from 'lucide-react';
import { toast } from 'react-toastify';
import { subirComprobante, getBancos } from '../api/portal.service';
import { useFocusTrap } from '../../hooks/useFocusTrap';

const TIPOS_PERMITIDOS = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

// Métodos de pago que requieren número de referencia obligatorio
const METODOS_CON_REFERENCIA = ['transferencia', 'pago_movil', 'punto_de_venta', 'zelle'];

/**
 * ComprobantePagoModal
 * Props:
 *   isOpen: boolean
 *   onClose: () => void
 *   mensualidad: { id, mes_nombre, anio, monto_usd } | null
 *   onSuccess: () => void
 */
const ComprobantePagoModal = ({ isOpen, onClose, mensualidad, onSuccess }) => {
  const [archivo, setArchivo] = useState(null);
  const [preview, setPreview] = useState(null);
  const [esPDF, setEsPDF] = useState(false);
  const [estado, setEstado] = useState('idle'); // idle | uploading | success | error
  const [bancos, setBancos] = useState([]);
  const [referencia, setReferencia] = useState('');
  const [metodoPago, setMetodoPago] = useState('transferencia');
  const inputRef = useRef(null);
  const containerRef = useRef(null);
  const timerRef = useRef(null);

  useFocusTrap(containerRef, isOpen);

  const handleClose = useCallback(() => {
    clearTimeout(timerRef.current);
    setArchivo(null);
    setPreview(null);
    setEsPDF(false);
    setEstado('idle');
    setReferencia('');
    setMetodoPago('transferencia');
    onClose();
  }, [onClose]);

  // Cerrar con Escape
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e) => { if (e.key === 'Escape') handleClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, handleClose]);

  // Cargar datos bancarios cuando se abre el modal
  useEffect(() => {
    if (!isOpen) return;
    getBancos()
      .then((res) => setBancos(res.data))
      .catch(() => setBancos([]));
  }, [isOpen]);

  if (!isOpen || !mensualidad) return null;

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!TIPOS_PERMITIDOS.includes(file.type)) {
      toast.error('Formato no permitido. Solo JPG, PNG, WEBP o PDF.');
      e.target.value = '';
      return;
    }

    if (file.size > MAX_BYTES) {
      toast.error('El archivo supera el límite de 10 MB.');
      e.target.value = '';
      return;
    }

    setArchivo(file);
    setEstado('idle');

    if (file.type === 'application/pdf') {
      setEsPDF(true);
      setPreview(null);
    } else {
      setEsPDF(false);
      setPreview(URL.createObjectURL(file));
    }
  };

  const referenciaObligatoria = METODOS_CON_REFERENCIA.includes(metodoPago);

  const handleSubmit = async () => {
    if (!archivo) {
      toast.warning('Selecciona un archivo primero');
      return;
    }
    if (referenciaObligatoria && !referencia.trim()) {
      toast.warning('Debes ingresar el número de referencia o confirmación de la transacción.');
      return;
    }

    setEstado('uploading');
    try {
      await subirComprobante(mensualidad.id, archivo, referencia.trim(), metodoPago);
      setEstado('success');
      toast.success('Comprobante enviado correctamente. Pendiente de revisión.');
      onSuccess?.();
      timerRef.current = setTimeout(handleClose, 1500);
    } catch (err) {
      setEstado('error');
      const mensaje = err?.response?.data?.error || err?.response?.data?.detail || 'Error al subir el comprobante. Intenta nuevamente.';
      toast.error(mensaje);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 px-0 sm:px-4"
      onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
    >
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-comprobante-titulo"
        className="bg-white w-full max-w-[480px] rounded-t-3xl sm:rounded-2xl p-5 space-y-4"
      >
        {/* Encabezado */}
        <div className="flex items-center justify-between">
          <div>
            <h2 id="modal-comprobante-titulo" className="font-semibold text-gray-800 text-base">Subir comprobante</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {mensualidad.mes_nombre} {mensualidad.anio} — ${mensualidad.monto_usd} USD
            </p>
          </div>
          <button
            onClick={handleClose}
            aria-label="Cerrar modal"
            className="w-11 h-11 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors -mr-2"
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>

        {/* Área de carga */}
        {!archivo ? (
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col items-center justify-center gap-2 p-4 rounded-2xl border-2 border-dashed border-gray-200 cursor-pointer hover:border-[#0fa3b1] active:bg-gray-50 transition-colors min-h-[90px]">
              <Camera size={26} className="text-[#0fa3b1]" aria-hidden="true" />
              <span className="text-sm font-medium text-gray-600">Cámara</span>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={handleFileChange}
              />
            </label>
            <label className="flex flex-col items-center justify-center gap-2 p-4 rounded-2xl border-2 border-dashed border-gray-200 cursor-pointer hover:border-[#0fa3b1] active:bg-gray-50 transition-colors min-h-[90px]">
              <Upload size={26} className="text-gray-400" aria-hidden="true" />
              <span className="text-sm font-medium text-gray-600">Archivo</span>
              <input
                ref={inputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                className="hidden"
                onChange={handleFileChange}
              />
            </label>
          </div>
        ) : (
          <div className="relative">
            {esPDF ? (
              <div className="flex flex-col items-center gap-2 p-5 rounded-2xl bg-gray-50 text-[#0fa3b1]">
                <FileText size={40} aria-hidden="true" />
                <span className="text-sm text-gray-600 text-center break-all">{archivo?.name}</span>
              </div>
            ) : (
              <img
                src={preview}
                alt="Vista previa del comprobante"
                className="w-full max-h-48 rounded-2xl object-contain bg-gray-50"
              />
            )}
            <button
              type="button"
              onClick={() => { setArchivo(null); setPreview(null); setEsPDF(false); setEstado('idle'); }}
              className="absolute top-2 right-2 w-8 h-8 bg-black/50 hover:bg-black/70 rounded-full flex items-center justify-center transition-colors"
              aria-label="Quitar archivo"
            >
              <X size={14} className="text-white" aria-hidden="true" />
            </button>
          </div>
        )}

        {/* Datos bancarios para transferencia */}
        {bancos.length > 0 && (
          <div className="bg-gray-50 rounded-xl p-3">
            <p className="text-xs font-semibold text-gray-600 mb-2">Datos para transferencia:</p>
            {bancos.map(b => (
              <div key={b.id} className="flex items-center justify-between py-1 border-b border-gray-100 last:border-0">
                <span className="text-xs text-gray-700 font-medium">{b.nombre}</span>
                <span className="text-xs text-gray-500">{b.numero_cuenta || b.tipo}</span>
              </div>
            ))}
          </div>
        )}

        {/* Método de pago */}
        <div className="space-y-1">
          <label className="text-xs font-semibold text-gray-600 block">Método de pago</label>
          <select
            value={metodoPago}
            onChange={(e) => setMetodoPago(e.target.value)}
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#0fa3b1] bg-white"
          >
            <option value="transferencia">Transferencia Bancaria</option>
            <option value="pago_movil">Pago Móvil</option>
            <option value="zelle">Zelle</option>
            <option value="punto_de_venta">Punto de Venta</option>
          </select>
        </div>

        {/* Número de referencia — requerido para métodos bancarios */}
        <div className="space-y-1">
          <label className="text-xs font-semibold text-gray-600 block flex items-center gap-1">
            <Hash size={12} aria-hidden="true" />
            Número de referencia / confirmación
            {referenciaObligatoria && <span className="text-red-500 ml-0.5">*</span>}
          </label>
          <input
            type="text"
            value={referencia}
            onChange={(e) => setReferencia(e.target.value)}
            placeholder={
              metodoPago === 'pago_movil'
                ? 'Ej: 00000123456'
                : metodoPago === 'zelle'
                ? 'Ej: ZL-2024-XXXXXXXX'
                : 'Ej: 12345678'
            }
            className="w-full border border-gray-200 rounded-xl px-3 py-3 text-base text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#0fa3b1] uppercase placeholder:normal-case"
            maxLength={100}
            autoComplete="off"
          />
          <p className="text-xs text-gray-400">
            Este número identifica tu transacción de forma única. Encontrás en el mensaje de confirmación del banco.
          </p>
        </div>

        {/* Estado success */}
        {estado === 'success' && (
          <div className="flex items-center gap-2 bg-green-50 text-green-700 rounded-xl px-4 py-3 text-sm" role="status">
            <CheckCircle size={18} aria-hidden="true" />
            <span>Comprobante enviado. En revisión.</span>
          </div>
        )}

        {/* Estado error */}
        {estado === 'error' && (
          <div className="flex items-center gap-2 bg-red-50 text-red-700 rounded-xl px-4 py-3 text-sm" role="alert">
            <AlertCircle size={18} aria-hidden="true" />
            <span>No se pudo enviar. Intenta nuevamente.</span>
          </div>
        )}

        {/* Botón submit */}
        <button
          onClick={handleSubmit}
          disabled={!archivo || estado === 'uploading' || estado === 'success'}
          className="w-full bg-[#0fa3b1] text-white font-medium py-3 rounded-xl transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {estado === 'uploading' ? (
            <>
              <span className="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full" aria-hidden="true" />
              Enviando...
            </>
          ) : (
            <>
              <Upload size={16} aria-hidden="true" />
              Enviar comprobante
            </>
          )}
        </button>
      </div>
    </div>
  );
};

export default ComprobantePagoModal;
