export const NOMBRES_LAPSO = ['1er Lapso', '2do Lapso', '3er Lapso'];

export const LAPSO_VACIO = {
  nombre: '1er Lapso',
  periodo_escolar: '',
  fecha_inicio: '',
  fecha_fin: '',
  activo: true,
};

const CAMPOS_EVAL = ['evaluacion_1', 'evaluacion_2', 'evaluacion_3', 'evaluacion_4'];

export function calcDefinitiva(nota) {
  const vals = CAMPOS_EVAL
    .map(c => parseFloat(nota[c]))
    .filter(v => !isNaN(v) && v >= 0 && v <= 20);
  if (!vals.length) return '';
  return (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2);
}
