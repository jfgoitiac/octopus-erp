import CameraCodeScanner, { FORMATOS_BARRAS_PRODUCTO } from './CameraTarjetaScanner';

// Un código de barras de producto es un token alfanumérico corto. Los QR no
// se aceptan aquí: son la credencial exclusiva de las tarjetas prepago.
export function normalizarCodigoProductoLeido(valor) {
  const codigo = String(valor ?? '').trim();
  return /^[A-Za-z0-9-]{3,50}$/.test(codigo) ? codigo : null;
}

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
