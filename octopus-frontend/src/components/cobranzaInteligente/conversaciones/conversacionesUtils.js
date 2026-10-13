import { format, isSameDay, isThisYear, isValid, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';

export const RUTA_CONVERSACIONES = '/cobranza/inteligente/conversaciones';

export const FILTROS = [
    { valor: 'todas', etiqueta: 'Todas' },
    { valor: 'no_leidas', etiqueta: 'No leídas' },
    { valor: 'requieren_humano', etiqueta: 'Piden persona' },
    { valor: 'humano', etiqueta: 'Atendidas' },
    { valor: 'automatico', etiqueta: 'Automáticas' },
    { valor: 'sin_vincular', etiqueta: 'Sin vincular' },
];

export const ESTADOS_ENTREGA = {
    enviado: 'Enviado',
    entregado: 'Entregado',
    leido: 'Leído',
    fallido: 'No se pudo entregar',
};

export const TIPOS_ARCHIVO = 'image/jpeg,image/png,image/webp,application/pdf';
export const MAX_ARCHIVO_BYTES = 10 * 1024 * 1024;

export const aFecha = (iso) => {
    if (!iso) return null;
    const d = typeof iso === 'string' ? parseISO(iso) : iso;
    return isValid(d) ? d : null;
};

/** Nombre a mostrar: representante vinculado, nombre del perfil de WhatsApp o teléfono. */
export const nombreConversacion = (c) => c?.representante?.nombre || c?.nombre_contacto || c?.telefono || 'Contacto';

export const iniciales = (nombre) => {
    const partes = String(nombre || '').replace(/[^\p{L}\p{N}\s]/gu, '').trim().split(/\s+/).filter(Boolean);
    if (partes.length === 0) return '#';
    return (partes[0][0] + (partes[1]?.[0] || '')).toUpperCase();
};

/** Hora ("14:05") si es de hoy; si no, "12 oct" (con año si no es el actual). */
export const horaCorta = (iso, ahora = new Date()) => {
    const d = aFecha(iso);
    if (!d) return '';
    if (isSameDay(d, ahora)) return format(d, 'HH:mm', { locale: es });
    return format(d, isThisYear(d) ? 'd MMM' : 'd MMM yyyy', { locale: es });
};

/** Etiqueta del separador de día en el hilo: "Hoy", "Ayer" o "12 de octubre". */
export const etiquetaDia = (iso, ahora = new Date()) => {
    const d = aFecha(iso);
    if (!d) return '';
    if (isSameDay(d, ahora)) return 'Hoy';
    const ayer = new Date(ahora);
    ayer.setDate(ayer.getDate() - 1);
    if (isSameDay(d, ayer)) return 'Ayer';
    return format(d, isThisYear(d) ? "d 'de' MMMM" : "d 'de' MMMM yyyy", { locale: es });
};

export const horaMensaje = (iso) => {
    const d = aFecha(iso);
    return d ? format(d, 'HH:mm', { locale: es }) : '';
};

/** Segundos que le quedan a la ventana de 24 h (0 si está cerrada). Usa `expira_en` para una cuenta viva. */
export const segundosRestantes = (conv, ahoraMs = Date.now()) => {
    const v = conv?.ventana;
    if (!v?.abierta) return 0;
    const expira = aFecha(v.expira_en);
    if (expira) return Math.max(0, Math.floor((expira.getTime() - ahoraMs) / 1000));
    return Math.max(0, Number(v.segundos_restantes) || 0);
};

/** "5 h 12 min", "40 min" o "menos de 1 min". */
export const formatoRestante = (segundos) => {
    const min = Math.floor(Math.max(0, segundos) / 60);
    if (min < 1) return 'menos de 1 min';
    const h = Math.floor(min / 60);
    const m = min % 60;
    if (h === 0) return `${m} min`;
    return m === 0 ? `${h} h` : `${h} h ${m} min`;
};

const claveOrdenMensaje = (m) => [m.creado_en || '', typeof m.id === 'number' ? m.id : Number.MAX_SAFE_INTEGER];

export const ordenarMensajes = (lista) => [...lista].sort((a, b) => {
    const [ta, ia] = claveOrdenMensaje(a);
    const [tb, ib] = claveOrdenMensaje(b);
    if (ta !== tb) return ta < tb ? -1 : 1;
    return ia - ib;
});

export const ordenarConversaciones = (lista) =>
    [...lista].sort((a, b) => String(b.actualizado_en || '').localeCompare(String(a.actualizado_en || '')));

/** Fusiona `nuevas` en `actuales` por `id` (la repetida reemplaza). */
export const fusionarPorId = (actuales, nuevas) => {
    if (!nuevas?.length) return actuales;
    const mapa = new Map(actuales.map(x => [x.id, x]));
    nuevas.forEach(x => mapa.set(x.id, x));
    return [...mapa.values()];
};

/** Reglas del filtro aplicadas en cliente a filas que llegan por consulta incremental. */
export const coincideFiltro = (c, filtro) => {
    switch (filtro) {
        case 'no_leidas': return c.no_leidos > 0;
        case 'requieren_humano': return !!c.requiere_humano;
        case 'humano': return c.estado === 'humano';
        case 'automatico': return c.estado === 'automatico';
        case 'sin_vincular': return !c.representante;
        default: return true;
    }
};

export const textoUltimoMensaje = (c) => {
    const u = c?.ultimo_mensaje;
    if (!u) return 'Sin mensajes';
    const cuerpo = u.cuerpo || (u.tipo === 'imagen' ? '[Imagen]' : u.tipo === 'documento' ? '[Documento]' : '');
    return u.direccion === 'saliente' ? `Tú: ${cuerpo}` : cuerpo;
};

/** Mensaje de error legible de una respuesta de Axios del módulo. */
export const mensajeError = (err, defecto = 'No se pudo completar la acción. Intenta de nuevo.') =>
    err?.response?.data?.detail || defecto;

/** Texto que verá el cobrador en el hilo: la plantilla con los valores escritos en cada {{parámetro}}. */
export const armarCuerpo = (plantilla, valores) => {
    let texto = plantilla?.cuerpo || '';
    (plantilla?.orden_parametros || []).forEach((nombre, i) => {
        if (valores[i]) texto = texto.split(`{{${nombre}}}`).join(valores[i]);
    });
    return texto;
};

/** Estado de un comprobante recibido por WhatsApp (`estado_adjunto` del mensaje). */
export const ESTADOS_ADJUNTO = {
    pendiente: { etiqueta: 'Comprobante por asignar', color: 'var(--amber-ink)', fondo: 'var(--yellow-light)' },
    convertido: { etiqueta: 'Convertido en comprobante de pago', color: 'var(--green)', fondo: 'var(--ash-light)' },
    descartado: { etiqueta: 'Comprobante descartado', color: 'var(--jet-mid)', fondo: 'var(--ash-light)' },
};

export const METODOS_PAGO = [
    { valor: 'transferencia', etiqueta: 'Transferencia' },
    { valor: 'pago_movil', etiqueta: 'Pago móvil' },
    { valor: 'punto_de_venta', etiqueta: 'Punto de venta' },
    { valor: 'zelle', etiqueta: 'Zelle' },
    { valor: 'efectivo', etiqueta: 'Efectivo' },
    { valor: 'otro', etiqueta: 'Otro' },
];

export const MAX_MOTIVO_DESCARTE = 300;

/** "Resuelto el 12 de octubre a las 14:05" a partir de `payload.resuelto_en`; '' si falta o no es válido. */
export const textoResuelto = (iso) => {
    const d = aFecha(iso);
    return d ? format(d, "d 'de' MMMM 'a las' HH:mm", { locale: es }) : '';
};

/** Filas de un mensaje interactivo de lista (`payload.filas`), sólo las que tienen título. */
export const filasLista = (payload) =>
    (Array.isArray(payload?.filas) ? payload.filas : []).filter(f => f && f.title);
