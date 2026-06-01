import { useState, useRef, useEffect } from 'react';
import { Upload, X, FileText, CheckCircle, AlertCircle } from 'lucide-react';
import { toast } from 'react-toastify';
import { subirComprobante, getBancos } from '../api/portal.service';

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
  const inputRef = useRef(null);

  // Cargar datos bancarios cuando se abre el modal
  useEffect(() => {
    if (!isOpen) return;
    getBancos()
      .then((res) => setBancos(res.data))
      .catch(() => setBancos([]));
  }, [isOpen]);

  if (!isOpen || !mensualidad) return null;

  // Validaciones de seguridad en cliente (la validación definitiva está en el backend)
  const TIPOS_PERMITIDOS = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
  const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Validar tipo MIME antes de aceptar el archivo
    if (!TIPOS_PERMITIDOS.includes(file.type)) {
      toast.error('Formato no permitido. Solo JPG, PNG, WEBP o PDF.');
      e.target.value = '';
      return;
    }

    // Validar tamaño máximo (10 MB)
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

  const handleSubmit = async () => {
    if (!archivo) {
      toast.warning('Selecciona un archivo primero');
      return;
    }

    setEstado('uploading');
    try {
      await subirComprobante(mensualidad.id, archivo);
      setEstado('success');
      toast.success('Comprobante enviado correctamente. Pendiente de revisión.');
      onSuccess?.();
      setTimeout(() => {
        handleClose();
      }, 1500);
    } catch (err) {
      setEstado('error');
      const mensaje = err?.response?.data?.error || err?.response?.data?.detail || 'Error al subir el comprobante. Intenta nuevamente.';
      toast.error(mensaje);
    }
  };

  const handleClose = () => {
    setArchivo(null);
    setPreview(null);
    setEsPDF(false);
    setEstado('idle');
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 px-0 sm:px-4"
      onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
    >
      <div className="bg-white w-full max-w-[480px] rounded-t-3xl sm:rounded-2xl p-5 space-y-4">
        {/* Encabezado */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-gray-800 text-base">Subir comprobante</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {mensualidad.mes_nombre} {mensualidad.anio} — ${mensualidad.monto_usd} USD
            </p>
          </div>
          <button onClick={handleClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Área de carga */}
        <div
          className="border-2 border-dashed border-gray-200 rounded-2xl p-5 flex flex-col items-center justify-center gap-3 cursor-pointer hover:border-[#0fa3b1] transition-colors"
          onClick={() => inputRef.current?.click()}
        >
          {preview ? (
            <img src={preview} alt="Preview" className="max-h-40 rounded-xl object-contain" />
          ) : esPDF ? (
            <div className="flex flex-col items-center gap-2 text-[#0fa3b1]">
              <FileText size={40} />
              <span className="text-sm text-gray-600 text-center">{archivo?.name}</span>
            </div>
          ) : (
            <>
              <Upload size={28} className="text-gray-300" />
              <div className="text-center">
                <p className="text-sm font-medium text-gray-600">Toca para seleccionar</p>
                <p className="text-xs text-gray-400 mt-0.5">Imagen (JPG, PNG) o PDF</p>
              </div>
            </>
          )}
        </div>

        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,application/pdf"
          className="hidden"
          onChange={handleFileChange}
        />

        {/* Datos bancarios para transferencia */}
        {bancos.length > 0 && (
          <div className="bg-gray-50 rounded-xl p-3 mb-3">
            <p className="text-xs font-semibold text-gray-600 mb-2">Datos para transferencia:</p>
            {bancos.map(b => (
              <div key={b.id} className="flex items-center justify-between py-1 border-b border-gray-100 last:border-0">
                <span className="text-xs text-gray-700 font-medium">{b.nombre}</span>
                <span className="text-xs text-gray-500">{b.numero_cuenta || b.tipo}</span>
              </div>
            ))}
          </div>
        )}

        {/* Estado success */}
        {estado === 'success' && (
          <div className="flex items-center gap-2 bg-green-50 text-green-700 rounded-xl px-4 py-3 text-sm">
            <CheckCircle size={18} />
            <span>Comprobante enviado. En revisión.</span>
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
              <span className="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
              Enviando...
            </>
          ) : (
            <>
              <Upload size={16} />
              Enviar comprobante
            </>
          )}
        </button>
      </div>
    </div>
  );
};

export default ComprobantePagoModal;
