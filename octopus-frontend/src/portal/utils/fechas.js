import { format, parseISO, isValid } from 'date-fns';
import { es } from 'date-fns/locale';

// Fechas del portal. Se usa parseISO y no `new Date(str)`: con una fecha sin
// hora ("2026-10-31") `new Date` la interpreta en UTC y en Venezuela (UTC-4)
// se mostraba el día anterior. parseISO la toma como medianoche local.
export const fmtFecha = (valor, patron = "d 'de' MMM yyyy") => {
  if (!valor) return '—';
  const fecha = typeof valor === 'string' ? parseISO(valor) : valor;
  return isValid(fecha) ? format(fecha, patron, { locale: es }) : String(valor);
};

// Situación de una mensualidad en lenguaje simple: "12 días de mora" si ya
// venció, o "Vence el 31 de oct" si aún está en plazo (incluido el mes en
// curso, que el backend cuenta como pendiente pero con 0 días de mora).
export const textoVencimiento = (mensualidad) => {
  const dias = Number(mensualidad?.dias_mora || 0);
  if (dias > 0) return `${dias} día${dias === 1 ? '' : 's'} de mora`;
  if (mensualidad?.fecha_vencimiento) return `Vence el ${fmtFecha(mensualidad.fecha_vencimiento, "d 'de' MMM")}`;
  return 'Pendiente';
};
