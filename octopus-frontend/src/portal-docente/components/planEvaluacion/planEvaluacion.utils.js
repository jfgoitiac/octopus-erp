export function obtenerTotalCanonicoVisible(fila) {
  if (fila.pendiente || fila.total_canonico == null) return null;
  const total = Number(fila.total_canonico);
  return Number.isFinite(total) ? total.toFixed(2) : null;
}

export function fechaInicialParaLapso(fechaHoy, fechaInicio, fechaFin) {
  if (!fechaInicio || !fechaFin) return fechaHoy;
  return fechaHoy >= fechaInicio && fechaHoy <= fechaFin ? fechaHoy : fechaInicio;
}

export function fechaFueraDelLapso(fecha, fechaInicio, fechaFin) {
  return Boolean(
    fecha && fechaInicio && fechaFin && (fecha < fechaInicio || fecha > fechaFin),
  );
}

const esIdTemporal = (id) => typeof id === 'string' && id.startsWith('tmp-');

export function construirPayloadPlan(bloques, esLiteral) {
  return bloques.map((bloque, indiceBloque) => ({
    ...(esIdTemporal(bloque.id) ? {} : { id: bloque.id }),
    nombre: bloque.nombre.trim(),
    orden: indiceBloque,
    ...(esLiteral ? {} : {
      total_puntos: Number(bloque.total_puntos) || 0,
      modo: bloque.modo || 'puntos',
    }),
    items: bloque.items.map((item, indiceItem) => ({
      ...(esIdTemporal(item.id) ? {} : { id: item.id }),
      nombre: item.nombre.trim(),
      fecha: item.fecha,
      orden: indiceItem,
      ...(esLiteral ? {} : { valor_maximo: Number(item.valor_maximo) || 0 }),
    })),
  }));
}
