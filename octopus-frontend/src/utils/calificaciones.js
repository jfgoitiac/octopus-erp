// `completo` solo significa que ya se capturaron todos los componentes. Mientras
// el lapso siga abierto, el backend conserva el valor como provisional y no
// publica una definitiva. El único estado realmente final es `cerrado`.
const ESTADOS_FINALES = new Set(['cerrado']);

export const extraerCalificaciones = (payload) => {
  if (Array.isArray(payload)) return payload;
  return payload?.resultados ?? payload?.calificaciones ?? payload?.notas ?? [];
};

export const normalizarCalificacion = (fila) => {
  const resultado = fila?.resultado_calificacion ?? fila?.resultado ?? {};
  const unificada = { ...fila, ...resultado };
  const definitivaLiteral = unificada.definitiva_literal ?? unificada.definitiva_letra ?? null;
  const provisionalLiteral = unificada.valor_literal_provisional ?? null;
  const definitiva = unificada.definitiva ?? null;
  const provisional = unificada.valor_provisional ?? unificada.resultado_provisional ?? null;

  // Compatibilidad de lectura con el payload anterior. No se recalculan
  // promedios ni aprobación en el cliente: esos valores vienen del backend.
  const estado = unificada.estado
    ?? ((definitiva != null || definitivaLiteral != null) ? 'completo' : 'sin_datos');

  return {
    ...unificada,
    fuente: unificada.fuente ?? 'legacy',
    modalidad: unificada.modalidad ?? unificada.tipo ?? (definitivaLiteral ? 'literal' : 'numerica'),
    estado,
    progreso: unificada.progreso ?? null,
    valor_provisional: provisional,
    valor_literal_provisional: provisionalLiteral,
    definitiva,
    definitiva_literal: definitivaLiteral,
    definitiva_letra: definitivaLiteral,
    aprobado: unificada.aprobado ?? null,
    desglose: unificada.desglose ?? [],
    aportes_externos: unificada.aportes_externos ?? unificada.aportes ?? [],
  };
};

export const valorVisibleCalificacion = (calificacion) => (
  calificacion.definitiva_literal
  ?? calificacion.definitiva
  ?? calificacion.valor_literal_provisional
  ?? calificacion.valor_provisional
  ?? null
);

export const esResultadoProvisional = (calificacion) => (
  !ESTADOS_FINALES.has(calificacion.estado)
  && (calificacion.valor_provisional != null || calificacion.valor_literal_provisional != null)
);

export const etiquetaEstadoCalificacion = (estado) => ({
  sin_configuracion: 'Sin configurar',
  sin_configurar: 'Sin configurar',
  sin_datos: 'Sin notas',
  en_progreso: 'En progreso',
  completo: 'Completo',
  cerrado: 'Definitiva',
}[estado] ?? 'Pendiente');

export const usaEvaluacionesLegacy = (calificacion) => (
  normalizarCalificacion(calificacion).fuente === 'legacy'
);

export const resumenProgresoCalificacion = (calificacion) => {
  const progreso = normalizarCalificacion(calificacion).progreso;
  if (!progreso || !progreso.esperados) return '—';
  return `${progreso.evaluados}/${progreso.esperados} (${progreso.porcentaje ?? 0}%)`;
};

