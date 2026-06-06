export const DIA_MAP = { Lunes: 1, Martes: 2, 'Miércoles': 3, Jueves: 4, Viernes: 5 };
export const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'];

// Formato {label, value} para el endpoint /horarios/generar/ que recibe nombres en minúscula
export const DIAS_GENERADOR = [
  { label: 'Lunes',     value: 'lunes' },
  { label: 'Martes',    value: 'martes' },
  { label: 'Miércoles', value: 'miercoles' },
  { label: 'Jueves',    value: 'jueves' },
  { label: 'Viernes',   value: 'viernes' },
];

/**
 * Genera bloques horarios de 1 hora entre `desde` (inclusive) y `hasta` (exclusive).
 * Ej: buildHoraBlocks('07:00', '17:00') → ['07:00', '08:00', ..., '16:00']
 */
export const buildHoraBlocks = (desde, hasta) => {
  const start = parseInt(desde.split(':')[0], 10);
  const end   = parseInt(hasta.split(':')[0], 10);
  return Array.from({ length: Math.max(0, end - start) }, (_, i) =>
    `${String(start + i).padStart(2, '0')}:00`
  );
};

// Defaults: 07:00 – 16:00 (inicio) y 08:00 – 17:00 (fin de bloque)
export const HORAS_INICIO = buildHoraBlocks('07:00', '17:00');
export const HORAS_FIN    = buildHoraBlocks('08:00', '18:00');

const COLORS = [
  '#e0f2fe', '#dcfce7', '#fef9c3', '#fce7f3', '#ede9fe',
  '#ffedd5', '#f0fdf4', '#e0e7ff', '#fef3c7', '#ecfeff',
];

export const getColor = (materiaId) => COLORS[(materiaId || 0) % COLORS.length];
