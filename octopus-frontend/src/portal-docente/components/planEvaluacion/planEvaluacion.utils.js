export function obtenerTotalCanonicoVisible(fila) {
  if (fila.pendiente || fila.total_canonico == null) return null;
  const total = Number(fila.total_canonico);
  return Number.isFinite(total) ? total.toFixed(2) : null;
}
