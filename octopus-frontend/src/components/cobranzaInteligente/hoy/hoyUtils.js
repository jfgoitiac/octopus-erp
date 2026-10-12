import { formatDistanceToNow, parseISO, isValid } from 'date-fns';
import { es } from 'date-fns/locale';

const num = (v) => Number(v) || 0;

export const usd = (v) => `$${num(v).toFixed(2)}`;

/** "hace 2 días" a partir de un instante ISO; '' si no es válido. */
export const haceTiempo = (iso) => {
    if (!iso) return '';
    const d = parseISO(iso);
    return isValid(d) ? formatDistanceToNow(d, { addSuffix: true, locale: es }) : '';
};

export const ETIQUETA_ANTIGUEDAD = [
    ['por_vencer', 'Por vencer'], ['1_7', '1-7 días'], ['8_15', '8-15 días'], ['16_30', '16-30 días'], ['mas_30', 'Más de 30'],
];

export const ETIQUETA_TIPO = {
    caso_prioritario: 'Caso prioritario',
    promesa_vencida: 'Promesa vencida',
    pago_en_revision: 'Pago en revisión',
    envio_fallido: 'Envío fallido',
    sin_contacto: 'Sin contacto',
    conversacion_espera: 'Conversación en espera',
    conversacion_tomada: 'Conversación tomada',
    comprobante_whatsapp: 'Comprobante por WhatsApp',
};
