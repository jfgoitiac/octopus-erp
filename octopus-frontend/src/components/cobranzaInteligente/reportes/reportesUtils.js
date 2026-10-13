import { addWeeks, format, parseISO, isValid } from 'date-fns';
import { es } from 'date-fns/locale';

const num = (v) => {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : 0;
};

export const usd = (v) => `$${num(v).toFixed(2)}`;
export const pct = (v) => (v === null || v === undefined ? '—' : `${num(v).toFixed(1)}%`);

/** Probabilidad "0.25" -> "25%". */
export const probabilidadPct = (v) => `${Math.round(num(v) * 100)}%`;

const fecha = (iso) => {
    const d = typeof iso === 'string' ? parseISO(iso) : iso;
    return isValid(d) ? d : null;
};

/** "20 jul – 26 jul 2026" (o con ambos años si la semana cruza de año). */
export const rangoSemana = (semana) => {
    const d = fecha(semana?.desde);
    const h = fecha(semana?.hasta);
    if (!d || !h) return '';
    const mismoAnio = d.getFullYear() === h.getFullYear();
    return `${format(d, mismoAnio ? 'd MMM' : 'd MMM yyyy', { locale: es })} – ${format(h, 'd MMM yyyy', { locale: es })}`;
};

export const diaCorto = (iso) => {
    const d = fecha(iso);
    return d ? format(d, 'EEE d', { locale: es }) : iso;
};
export const fechaCorta = (iso) => {
    const d = fecha(iso);
    return d ? format(d, 'd MMM yyyy', { locale: es }) : iso;
};

/** Mueve una fecha ISO `n` semanas y devuelve ISO. */
export const moverSemana = (iso, n) => format(addWeeks(parseISO(iso), n), 'yyyy-MM-dd');

/**
 * Lectura del A/B tal como la entrega el backend (no se calcula ningún ganador aquí).
 * Devuelve { tono, texto }.
 */
export const lecturaAB = (fila) => {
    if (!fila.muestra_suficiente || !fila.ganadora) {
        return { tono: 'neutro', texto: 'Muestra insuficiente: aún no hay al menos 30 envíos medidos en cada variante. No se declara ganadora.' };
    }
    if (fila.ganadora === 'empate') {
        return { tono: 'neutro', texto: 'Empate: la diferencia es menor al mínimo configurado.' };
    }
    const dif = Math.abs(num(fila.diferencia_recuperado_pp)).toFixed(1);
    return { tono: 'ok', texto: `Ventaja orientativa de la variante ${fila.ganadora}: ${dif} puntos porcentuales más recuperado. No es una prueba estadística.` };
};
