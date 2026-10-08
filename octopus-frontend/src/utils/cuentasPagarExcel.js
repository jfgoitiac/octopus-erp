import * as XLSX from 'xlsx';
export function descargarReporteCuentasPagarExcel({ titulo, columnas, filas }) {
  const datos = filas.map((fila) => columnas.reduce((resultado, columna) => { const valor = fila[columna.key]; resultado[columna.label] = columna.tipo === 'numero' ? Number(valor || 0) : (valor ?? ''); return resultado; }, {}));
  const hoja = XLSX.utils.json_to_sheet(datos); const numeros = columnas.map((columna, indice) => columna.tipo === 'numero' ? indice : -1).filter((indice) => indice >= 0);
  for (let fila = 1; fila <= datos.length; fila += 1) numeros.forEach((columna) => { const celda = hoja[XLSX.utils.encode_cell({ r: fila, c: columna })]; if (celda) celda.z = '#,##0.00'; });
  hoja['!cols'] = columnas.map((columna) => ({ wch: Math.max(14, columna.label.length + 3) })); const libro = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(libro, hoja, titulo.slice(0, 31)); XLSX.writeFile(libro, `${titulo.toLowerCase().replaceAll(/[^a-z0-9]+/gi, '_')}.xlsx`);
}
