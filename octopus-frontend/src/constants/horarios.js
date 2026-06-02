export const DIA_MAP = { Lunes: 1, Martes: 2, 'Miércoles': 3, Jueves: 4, Viernes: 5 };
export const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'];

// 07:00 – 16:00  (hora de inicio de bloque)
export const HORAS_INICIO = Array.from({ length: 10 }, (_, i) =>
  `${String(i + 7).padStart(2, '0')}:00`
);

// 08:00 – 17:00  (hora de fin de bloque)
export const HORAS_FIN = Array.from({ length: 10 }, (_, i) =>
  `${String(i + 8).padStart(2, '0')}:00`
);

const COLORS = [
  '#e0f2fe', '#dcfce7', '#fef9c3', '#fce7f3', '#ede9fe',
  '#ffedd5', '#f0fdf4', '#e0e7ff', '#fef3c7', '#ecfeff',
];

export const getColor = (materiaId) => COLORS[(materiaId || 0) % COLORS.length];
