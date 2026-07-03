// Formateo de montos en bolívares — separado de utils/nominaPDF.js para que
// los componentes que solo necesitan mostrar cifras no arrastren jsPDF en su bundle.
export const fmtBs = (n) =>
    (parseFloat(n) || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
