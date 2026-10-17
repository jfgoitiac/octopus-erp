import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, Loader2, RotateCcw, Square, TriangleAlert } from 'lucide-react';

// Los QR se reservan para tarjetas prepago; los códigos de barras son para
// productos. Esta separación evita enviar por error una lectura al flujo
// equivocado (contrato de Cantina en móvil).
export const FORMATOS_QR_TARJETA = ['qr_code'];
export const FORMATOS_BARRAS_PRODUCTO = [
  'code_128',
  'code_39',
  'code_93',
  'ean_13',
  'ean_8',
  'upc_a',
  'upc_e',
  'itf',
  'codabar',
];

/**
 * Normaliza un valor leído por la cámara antes de enviarlo al flujo existente
 * de tarjetas. Los QR de Cantina codifican siempre el identificador CANT-,
 * nunca URLs ni texto libre.
 */
export function normalizarCodigoTarjetaLeido(valor) {
  const codigo = String(valor ?? '').trim();
  if (!/^CANT-[A-Za-z0-9-]{3,45}$/i.test(codigo)) return null;
  return codigo.toUpperCase();
}

function mensajeErrorCamara(error) {
  if (error?.name === 'NotAllowedError' || error?.name === 'SecurityError') {
    return 'El permiso de cámara fue denegado. Actívalo en los ajustes del navegador para poder escanear.';
  }
  if (error?.name === 'NotFoundError' || error?.name === 'OverconstrainedError') {
    return 'No se encontró una cámara disponible en este dispositivo.';
  }
  return 'No se pudo iniciar la cámara. Verifica que no esté siendo usada por otra aplicación e inténtalo de nuevo.';
}

/**
 * Lector móvil reutilizable. Usa BarcodeDetector, API nativa del navegador,
 * sin reemplazar ni interferir con los lectores físicos que escriben en los
 * inputs del POS. Requiere HTTPS (o localhost) para acceder a la cámara.
 */
export default function CameraCodeScanner({
  onCodigoLeido,
  disabled = false,
  formatos = FORMATOS_QR_TARJETA,
  normalizarCodigo = normalizarCodigoTarjetaLeido,
  titulo = 'Escanear tarjeta con cámara',
  instruccion = 'Apunta la cámara al código QR de la tarjeta.',
  etiquetaCamara = 'Vista de la cámara para escanear la tarjeta',
  mensajeLecturaInvalida = 'Se leyó un código, pero no tiene un formato válido para una tarjeta de Cantina. Intenta de nuevo.',
  mensajeExito = 'Código leído. Buscando la tarjeta…',
  mensajeNoDisponible = 'El lector con cámara no está disponible en este navegador. Usa el lector físico o escribe el código de la tarjeta.',
}) {
  const [estado, setEstado] = useState('idle');
  const [mensaje, setMensaje] = useState('');
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const frameRef = useRef(null);
  const activoRef = useRef(false);

  const liberarCamara = useCallback(() => {
    activoRef.current = false;
    if (frameRef.current) {
      window.cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.srcObject = null;
    }
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
  }, []);

  const detener = useCallback(() => {
    liberarCamara();
    setEstado('idle');
    setMensaje('');
  }, [liberarCamara]);

  useEffect(() => () => liberarCamara(), [liberarCamara]);

  const iniciar = async () => {
    if (disabled || estado === 'starting' || estado === 'active') return;

    const Detector = window.BarcodeDetector;
    if (!navigator.mediaDevices?.getUserMedia || !Detector) {
      setEstado('unavailable');
      setMensaje(mensajeNoDisponible);
      return;
    }

    setEstado('starting');
    setMensaje('Solicitando acceso a la cámara…');
    try {
      // Espera el siguiente cuadro para que el <video> condicional esté
      // montado antes de asignarle el stream, incluso en móviles rápidos.
      await new Promise(resolve => window.requestAnimationFrame(resolve));
      if (!videoRef.current) return;

      const soportados = await Detector.getSupportedFormats?.();
      const formatosDisponibles = Array.isArray(soportados)
        ? formatos.filter(formato => soportados.includes(formato))
        : formatos;
      if (formatosDisponibles.length === 0) {
        setEstado('unavailable');
        setMensaje('La cámara está disponible, pero este navegador no puede leer este tipo de código.');
        return;
      }

      // `ideal` favorece la trasera sin impedir que un teléfono con una sola
      // cámara o una tablet use su cámara disponible.
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      });
      streamRef.current = stream;
      if (!videoRef.current) {
        liberarCamara();
        return;
      }

      const detector = new Detector({ formats: formatosDisponibles });
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      activoRef.current = true;
      setEstado('active');
      setMensaje(instruccion);

      const detectar = async () => {
        if (!activoRef.current || !videoRef.current) return;
        try {
          const codigos = await detector.detect(videoRef.current);
          if (codigos.length > 0) {
            const codigo = normalizarCodigo(codigos[0].rawValue);
            if (codigo) {
              liberarCamara();
              setEstado('success');
              setMensaje(mensajeExito);
              onCodigoLeido(codigo);
              return;
            }
            setMensaje(mensajeLecturaInvalida);
          }
        } catch (error) {
          // Algunos navegadores lanzan InvalidStateError durante el primer
          // cuadro del vídeo. Se mantiene el lector activo para el siguiente.
          if (error?.name !== 'InvalidStateError') {
            liberarCamara();
            setEstado('error');
            setMensaje('No se pudo leer el código con la cámara. Intenta de nuevo o usa el lector físico.');
            return;
          }
        }
        frameRef.current = window.requestAnimationFrame(detectar);
      };
      frameRef.current = window.requestAnimationFrame(detectar);
    } catch (error) {
      liberarCamara();
      const esPermiso = error?.name === 'NotAllowedError' || error?.name === 'SecurityError';
      const esSinCamara = error?.name === 'NotFoundError' || error?.name === 'OverconstrainedError';
      setEstado(esPermiso ? 'denied' : (esSinCamara ? 'unavailable' : 'error'));
      setMensaje(mensajeErrorCamara(error));
    }
  };

  const puedeReintentar = estado === 'denied' || estado === 'unavailable' || estado === 'error' || estado === 'success';

  return (
    <section className="rounded-xl p-3" style={{ border: '1px solid var(--border-md)', background: 'var(--porcelain)' }} aria-label={titulo}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Camera size={18} style={{ color: 'var(--pb)' }} aria-hidden="true" />
          <span className="text-sm font-medium" style={{ color: 'var(--jet)' }}>{titulo}</span>
        </div>
        {estado === 'active' ? (
          <button type="button" onClick={detener} className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium" style={{ border: '1px solid var(--border-md)', color: 'var(--jet)', background: '#fff' }}>
            <Square size={14} aria-hidden="true" /> Detener cámara
          </button>
        ) : (
          <button type="button" onClick={iniciar} disabled={disabled || estado === 'starting'} className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-60" style={{ background: 'var(--pb)', color: '#fff' }}>
            {estado === 'starting' ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : (puedeReintentar ? <RotateCcw size={15} aria-hidden="true" /> : <Camera size={15} aria-hidden="true" />)}
            {estado === 'starting' ? 'Abriendo cámara…' : (puedeReintentar ? 'Reintentar cámara' : 'Usar cámara')}
          </button>
        )}
      </div>

      {(estado === 'active' || estado === 'starting') && (
        <video ref={videoRef} className="mt-3 w-full max-h-[40dvh] rounded-lg bg-black object-cover" playsInline muted aria-label={etiquetaCamara} />
      )}
      {mensaje && (
        <p role="status" aria-live="polite" className="mt-2 flex items-start gap-1.5 text-xs" style={{ color: estado === 'denied' || estado === 'unavailable' || estado === 'error' ? 'var(--red)' : 'var(--ash)' }}>
          {(estado === 'denied' || estado === 'unavailable' || estado === 'error') && <TriangleAlert size={14} className="shrink-0 mt-0.5" aria-hidden="true" />}
          <span>{mensaje}</span>
        </p>
      )}
    </section>
  );
}
