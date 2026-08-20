import { useState, useRef, useEffect, useCallback } from 'react';
import { Upload, X, FileText, CheckCircle, AlertCircle, Hash, Camera, Wallet } from 'lucide-react';
import { toast } from 'react-toastify';
import { recargarTarjetaCantina, getBancos } from '../api/portal.service';
import { useFocusTrap } from '../../hooks/useFocusTrap';

const TIPOS_PERMITIDOS = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

// Métodos que ofrece el portal — NUNCA "efectivo" (USD) ni "efectivo_ves en caja
// física", esos son exclusivos de RecargarTarjetaCajeroView (cajero presencial).
const METODOS_PORTAL = [
  { value: 'transferencia', label: 'Transferencia Bancaria' },
  { value: 'pago_movil', label: 'Pago Móvil' },
  { value: 'zelle', label: 'Zelle' },
  { value: 'efectivo_ves', label: 'Efectivo Bolívares' },
];

// Métodos que requieren banco receptor/procedencia + referencia (§5.9)
const METODOS_CON_BANCO = ['transferencia', 'pago_movil'];
// Métodos que requieren número de referencia
const METODOS_CON_REFERENCIA = ['transferencia', 'pago_movil', 'zelle'];
// efectivo_ves no pide datos bancarios ni comprobante obligatorio — se paga
// en billete físico, solo se declara el monto (§5.9 tabla).
const COMPROBANTE_OBLIGATORIO = (metodo) => metodo !== 'efectivo_ves';

/**
 * RecargarTarjetaModal
 * Clon de ComprobantePagoModal.jsx adaptado a recarga de tarjeta de cantina.
 * Props:
 *   isOpen: boolean
 *   onClose: () => void
 *   alumno: { id, nombre, apellido } | null
 *   onSuccess: () => void
 */
const RecargarTarjetaModal = ({ isOpen, onClose, alumno, onSuccess }) => {
  const [archivo, setArchivo] = useState(null);
  const [preview, setPreview] = useState(null);
  const [esPDF, setEsPDF] = useState(false);
  const [estado, setEstado] = useState('idle'); // idle | uploading | success | error
  const [bancos, setBancos] = useState([]);
  const [metodoPago, setMetodoPago] = useState('transferencia');
  const [bancoReceptorId, setBancoReceptorId] = useState('');
  const [bancoProcedencia, setBancoProcedencia] = useState('');
  const [referencia, setReferencia] = useState('');
  const [moneda, setMoneda] = useState('usd');
  const [monto, setMonto] = useState('');
  const inputRef = useRef(null);
  const containerRef = useRef(null);
  const timerRef = useRef(null);

  useFocusTrap(containerRef, isOpen);

  const resetForm = useCallback(() => {
    clearTimeout(timerRef.current);
    setArchivo(null);
    setPreview(null);
    setEsPDF(false);
    setEstado('idle');
    setMetodoPago('transferencia');
    setBancoReceptorId('');
    setBancoProcedencia('');
    setReferencia('');
    setMoneda('usd');
    setMonto('');
  }, []);

  const handleClose = useCallback(() => {
    resetForm();
    onClose();
  }, [onClose, resetForm]);

  // Cerrar con Escape
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e) => { if (e.key === 'Escape') handleClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, handleClose]);

  // Cargar catálogo de bancos institucionales — se reutiliza getBancos() del
  // portal (ya usado por ComprobantePagoModal) en vez de crear un endpoint
  // nuevo: ambos módulos apuntan al mismo catálogo cobranza.BancoInstitucional
  // (§5.9 de cantina.md: "no se duplica el modelo"), así que reciclar la
  // función existente evita mantener dos listas potencialmente desincronizadas.
  useEffect(() => {
    if (!isOpen) return;
    getBancos()
      .then((res) => setBancos(res.data))
      .catch(() => setBancos([]));
  }, [isOpen]);

  // Efectivo Bolívares es cash físico → moneda fija en VES, sin datos bancarios
  useEffect(() => {
    if (metodoPago === 'efectivo_ves') setMoneda('ves');
  }, [metodoPago]);

  if (!isOpen || !alumno) return null;

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

  const requiereBanco = METODOS_CON_BANCO.includes(metodoPago);
  const requiereReferencia = METODOS_CON_REFERENCIA.includes(metodoPago);
  const requiereComprobante = COMPROBANTE_OBLIGATORIO(metodoPago);

  const extraerMensajeError = (err) => {
    const data = err?.response?.data;
    if (!data) return 'No se pudo enviar la recarga. Intenta nuevamente.';
    if (typeof data === 'string') return data;
    if (data.error) return data.error;
    if (data.detail) return data.detail;
    // Errores de campo tipo DRF: { referencia: ["ya fue usada en ..."] }
    const primerCampo = Object.values(data)[0];
    if (Array.isArray(primerCampo) && primerCampo.length) return primerCampo[0];
    if (typeof primerCampo === 'string') return primerCampo;
    return 'No se pudo enviar la recarga. Intenta nuevamente.';
  };

  const handleSubmit = async () => {
    if (!monto || Number(monto) <= 0) {
      toast.warning('Ingresa un monto válido.');
      return;
    }
    if (requiereBanco && !bancoReceptorId) {
      toast.warning('Selecciona el banco receptor.');
      return;
    }
    if (requiereReferencia && !referencia.trim()) {
      toast.warning('Debes ingresar el número de referencia o confirmación de la transacción.');
      return;
    }
    if (requiereComprobante && !archivo) {
      toast.warning('Selecciona el comprobante de pago.');
      return;
    }

    setEstado('uploading');
    try {
      await recargarTarjetaCantina({
        alumno_id: alumno.id,
        metodo_pago: metodoPago,
        // El backend acepta monto_usd O monto_ves (deriva el otro con la tasa
        // vigente) — se envía solo el campo correspondiente a la moneda elegida.
        monto_usd: moneda === 'usd' ? monto : undefined,
        monto_ves: moneda === 'ves' ? monto : undefined,
        banco_receptor_id: requiereBanco ? bancoReceptorId : undefined,
        banco_procedencia: requiereBanco ? bancoProcedencia.trim() : undefined,
        referencia: requiereReferencia ? referencia.trim() : undefined,
        archivo: archivo || undefined,
      });
      setEstado('success');
      toast.success('Recarga enviada, será revisada en breve');
      onSuccess?.();
      timerRef.current = setTimeout(handleClose, 1500);
    } catch (err) {
      setEstado('error');
      toast.error(extraerMensajeError(err));
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 px-0 sm:px-4">
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-recarga-titulo"
        className="bg-white w-full max-w-[480px] rounded-t-3xl sm:rounded-2xl p-5 space-y-4 max-h-[92vh] overflow-y-auto"
      >
        {/* Encabezado */}
        <div className="flex items-center justify-between">
          <div>
            <h2 id="modal-recarga-titulo" className="font-semibold text-gray-800 text-base flex items-center gap-1.5">
              <Wallet size={16} className="text-[var(--portal-primary,#0fa3b1)]" aria-hidden="true" />
              Recargar saldo
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {alumno.nombre} {alumno.apellido}
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

        {/* Método de pago */}
        <div className="space-y-1">
          <label className="text-xs font-semibold text-gray-600 block">Método de pago</label>
          <select
            value={metodoPago}
            onChange={(e) => setMetodoPago(e.target.value)}
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-[var(--portal-primary,#0fa3b1)] bg-white"
          >
            {METODOS_PORTAL.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
        </div>

        {/* Banco receptor + procedencia — transferencia / pago móvil */}
        {requiereBanco && (
          <>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-gray-600 block">Banco receptor (del colegio)</label>
              <select
                value={bancoReceptorId}
                onChange={(e) => setBancoReceptorId(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-[var(--portal-primary,#0fa3b1)] bg-white"
              >
                <option value="">Selecciona un banco</option>
                {bancos.map((b) => (
                  <option key={b.id} value={b.id}>{b.nombre}{b.numero_cuenta ? ` — ${b.numero_cuenta}` : ''}</option>
                ))}
              </select>
            </div>

            {bancos.length > 0 && (
              <div className="bg-gray-50 rounded-xl p-3">
                <p className="text-xs font-semibold text-gray-600 mb-2">Datos para transferencia:</p>
                {bancos.map((b) => (
                  <div key={b.id} className="flex items-center justify-between py-1 border-b border-gray-100 last:border-0">
                    <span className="text-xs text-gray-700 font-medium">{b.nombre}</span>
                    <span className="text-xs text-gray-500">{b.numero_cuenta || (b.tipos || []).join(', ')}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="space-y-1">
              <label className="text-xs font-semibold text-gray-600 block">Banco de procedencia (tuyo)</label>
              <input
                type="text"
                value={bancoProcedencia}
                onChange={(e) => setBancoProcedencia(e.target.value)}
                placeholder="Ej: Banesco"
                className="w-full border border-gray-200 rounded-xl px-3 py-3 text-base text-gray-700 focus:outline-none focus:ring-2 focus:ring-[var(--portal-primary,#0fa3b1)]"
                maxLength={100}
              />
            </div>
          </>
        )}

        {/* Referencia — transferencia / pago móvil / zelle */}
        {requiereReferencia && (
          <div className="space-y-1">
            <label className="text-xs font-semibold text-gray-600 block flex items-center gap-1">
              <Hash size={12} aria-hidden="true" />
              Número de referencia / confirmación
              <span className="text-red-500 ml-0.5">*</span>
            </label>
            <input
              type="text"
              value={referencia}
              onChange={(e) => setReferencia(e.target.value)}
              placeholder={metodoPago === 'zelle' ? 'Ej: ZL-2024-XXXXXXXX' : 'Ej: 000123'}
              className="w-full border border-gray-200 rounded-xl px-3 py-3 text-base text-gray-700 focus:outline-none focus:ring-2 focus:ring-[var(--portal-primary,#0fa3b1)] uppercase placeholder:normal-case"
              maxLength={100}
              autoComplete="off"
            />
            <p className="text-xs text-gray-400">
              Este número identifica tu transacción de forma única. No puede reutilizarse en otro pago del sistema.
            </p>
          </div>
        )}

        {/* Moneda + monto */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-gray-600 block">Moneda</label>
            <select
              value={moneda}
              onChange={(e) => setMoneda(e.target.value)}
              disabled={metodoPago === 'efectivo_ves'}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-[var(--portal-primary,#0fa3b1)] bg-white disabled:bg-gray-50 disabled:text-gray-400"
            >
              <option value="usd">USD ($)</option>
              <option value="ves">VES (Bs.)</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-gray-600 block">Monto</label>
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
              placeholder="0.00"
              className="w-full border border-gray-200 rounded-xl px-3 py-3 text-base text-gray-700 focus:outline-none focus:ring-2 focus:ring-[var(--portal-primary,#0fa3b1)]"
            />
          </div>
        </div>

        {/* Área de carga de comprobante */}
        {requiereComprobante && (
          !archivo ? (
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col items-center justify-center gap-2 p-4 rounded-2xl border-2 border-dashed border-gray-200 cursor-pointer hover:border-[var(--portal-primary,#0fa3b1)] active:bg-gray-50 transition-colors min-h-[90px]">
                <Camera size={26} className="text-[var(--portal-primary,#0fa3b1)]" aria-hidden="true" />
                <span className="text-sm font-medium text-gray-600">Cámara</span>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={handleFileChange}
                />
              </label>
              <label className="flex flex-col items-center justify-center gap-2 p-4 rounded-2xl border-2 border-dashed border-gray-200 cursor-pointer hover:border-[var(--portal-primary,#0fa3b1)] active:bg-gray-50 transition-colors min-h-[90px]">
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
                <div className="flex flex-col items-center gap-2 p-5 rounded-2xl bg-gray-50 text-[var(--portal-primary,#0fa3b1)]">
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
          )
        )}

        {/* Estado success */}
        {estado === 'success' && (
          <div className="flex items-center gap-2 bg-green-50 text-green-700 rounded-xl px-4 py-3 text-sm" role="status">
            <CheckCircle size={18} aria-hidden="true" />
            <span>Recarga enviada. En revisión.</span>
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
          disabled={estado === 'uploading' || estado === 'success'}
          className="w-full bg-[var(--portal-primary,#0fa3b1)] text-white font-medium py-3 rounded-xl transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {estado === 'uploading' ? (
            <>
              <span className="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full" aria-hidden="true" />
              Enviando...
            </>
          ) : (
            <>
              <Upload size={16} aria-hidden="true" />
              Enviar recarga
            </>
          )}
        </button>
      </div>
    </div>
  );
};

export default RecargarTarjetaModal;
