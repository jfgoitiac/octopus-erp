import CameraCodeScanner from './CameraTarjetaScanner';
import { FORMATOS_BARRAS_PRODUCTO, normalizarCodigoProductoLeido } from './codigosCamara';

export default function CameraProductoScanner({ onCodigoLeido, disabled = false }) {
  return (
    <CameraCodeScanner
      onCodigoLeido={onCodigoLeido}
      disabled={disabled}
      formatos={FORMATOS_BARRAS_PRODUCTO}
      normalizarCodigo={normalizarCodigoProductoLeido}
      titulo="Escanear producto con cámara"
      instruccion="Apunta la cámara al código de barras del producto."
      etiquetaCamara="Vista de la cámara para escanear el producto"
      mensajeLecturaInvalida="Se leyó un código, pero no tiene un formato válido para un producto. Intenta de nuevo."
      mensajeExito="Código leído. Agregando el producto…"
      mensajeNoDisponible="El lector con cámara no está disponible en este navegador. Usa el lector físico o escribe el código de barras del producto."
    />
  );
}
