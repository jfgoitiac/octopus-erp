// Este archivo ya no genera PDFs en el cliente.
// La generación es responsabilidad exclusiva del backend (ReportLab).
// Se mantiene el archivo para evitar romper imports existentes.

export const generarReciboPDF = () => {
  console.warn(
    'generarReciboPDF está deprecado. ' +
    'El PDF ahora se genera en el backend via /api/cobranza/recibo/{pago_id}/'
  );
};