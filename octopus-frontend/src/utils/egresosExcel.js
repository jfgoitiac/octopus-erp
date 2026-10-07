import * as XLSX from 'xlsx';

/** Genera una hoja por informe con cantidades numéricas (no cadenas formateadas). */
export function descargarReporteEgresosExcel({ titulo, columnas, filas }) {
  const datos = filas.map((fila) => columnas.reduce((resultado, columna) => {
    resultado[columna.label] = columna.tipo === 'monto' ? Number(fila[columna.key] || 0) : (fila[columna.key] ?? '');
    return resultado;
  }, {}));
  const hoja = XLSX.utils.json_to_sheet(datos);
  const montos = columnas.map((columna, indice) => columna.tipo === 'monto' ? indice : -1).filter((indice) => indice >= 0);
  for (let fila = 1; fila <= datos.length; fila += 1) montos.forEach((columna) => {
    const celda = hoja[XLSX.utils.encode_cell({ r: fila, c: columna })];
    if (celda) celda.z = '#,##0.00';
  });
  hoja['!cols'] = columnas.map((columna) => ({ wch: Math.max(13, columna.label.length + 3) }));
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, titulo.slice(0, 31));
  XLSX.writeFile(libro, `${titulo.toLowerCase().replaceAll(/[^a-z0-9]+/gi, '_')}.xlsx`);
}
