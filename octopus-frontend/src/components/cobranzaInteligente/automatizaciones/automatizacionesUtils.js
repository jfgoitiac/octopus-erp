import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';

export const VARIABLES = ['{nombre}', '{saldo_usd}', '{saldo_bs}', '{alumnos}', '{link_portal}', '{datos_bancarios}'];

// Datos de ejemplo para la vista previa (los montos reales los calcula el servidor).
export const EJEMPLO = {
    nombre: 'María Pérez',
    saldo_usd: '50.00',
    saldo_bs: '2.250,00',
    alumnos: 'Luis Pérez (4.º A)',
    link_portal: 'https://portal.colegio.edu/portal',
    datos_bancarios: 'Banco Mercantil · Cta. 0105-0000-00-0000000000 · RIF J-00000000-0',
};

export const reemplazarVariables = (texto, datos = EJEMPLO) =>
    String(texto ?? '').replace(/\{(\w+)\}/g, (m, k) => (k in datos ? datos[k] : m));

export const ETAPAS = [
    { value: 'preventiva', label: 'Preventiva' },
    { value: 'temprana', label: 'Temprana' },
    { value: 'prioritaria', label: 'Prioritaria y crítica' },
];
export const CANALES = [
    { value: 'whatsapp', label: 'WhatsApp' },
    { value: 'email', label: 'Email' },
    { value: 'ambos', label: 'WhatsApp y email' },
    { value: 'interno', label: 'Interno' },
];
export const DESTINATARIOS = [
    { value: 'representante', label: 'Representante' },
    { value: 'responsable', label: 'Responsable' },
    { value: 'director', label: 'Director' },
];
export const etiqueta = (lista, valor) => lista.find(x => x.value === valor)?.label ?? valor;

// Textos base de cada plantilla del motor (octopus-api/cobranza/motor.py: _INTROS).
export const INTROS = {
    preventivo: 'Le recordamos que pronto vence el pago de:',
    vence_manana: 'Mañana vence el pago de:',
    vence_hoy: 'Hoy vence el pago de:',
    seguimiento_1: 'Notamos que sigue pendiente el pago de:',
    seguimiento_2: 'Le escribimos nuevamente: sigue pendiente el pago de:',
    prioritaria: 'Tenemos pendiente desde hace varios días el pago de:',
    critico_director: 'Caso con más de 30 días de mora:',
};
export const PLANTILLAS = Object.keys(INTROS);

/** Mensaje de ejemplo de una regla, con las variables ya reemplazadas. */
export const mensajeDeRegla = (regla) => {
    const intro = INTROS[regla?.plantilla] ?? 'Tiene pagos pendientes:';
    const base = regla?.destinatario === 'director'
        ? `Aviso a dirección. Representante: {nombre}. ${intro}\n• {alumnos}\n\nTotal: ${'$'}{saldo_usd} (Bs {saldo_bs})`
        : `Hola {nombre}, ${intro}\n• {alumnos}\n\nTotal: ${'$'}{saldo_usd} (Bs {saldo_bs})\n\nPuede pagar desde el portal: {link_portal}\nSi ya realizó el pago, ignore este mensaje.`;
    return reemplazarVariables(base);
};

// Mismas reglas que crea el motor por defecto (REGLAS_POR_DEFECTO). Solo lectura.
export const REGLAS_DEFECTO = [
    [-5, 'Recordatorio preventivo', 'preventiva', 'ambos', 'preventivo', 'representante'],
    [-1, 'Aviso de vencimiento cercano', 'preventiva', 'whatsapp', 'vence_manana', 'representante'],
    [0, 'Aviso de vencimiento', 'preventiva', 'ambos', 'vence_hoy', 'representante'],
    [3, 'Seguimiento cordial', 'temprana', 'whatsapp', 'seguimiento_1', 'representante'],
    [7, 'Segundo seguimiento', 'temprana', 'ambos', 'seguimiento_2', 'representante'],
    [15, 'Cobranza prioritaria', 'prioritaria', 'whatsapp', 'prioritaria', 'representante'],
    [30, 'Caso crítico: aviso al director', 'prioritaria', 'ambos', 'critico_director', 'director'],
].map(([dia_relativo, nombre, etapa, canal, plantilla, destinatario]) => (
    { id: `defecto-${dia_relativo}`, dia_relativo, nombre, etapa, canal, plantilla, destinatario, activa: true, saldo_minimo: '0.01' }
));

export const normalizarReglas = (data) => {
    const lista = Array.isArray(data) ? data : (data?.results ?? []);
    return [...lista].sort((a, b) => a.dia_relativo - b.dia_relativo);
};

/** La comparación A/B solo aplica a avisos de WhatsApp al representante (contrato Fase D §4). */
export const aplicaAB = (f) => ['whatsapp', 'ambos'].includes(f?.canal) && f?.destinatario === 'representante';
/** El recordatorio extra en −3 solo vale para avisos al representante que no sean internos (§2). */
export const aplicaExtra = (f) => f?.destinatario === 'representante' && f?.canal !== 'interno';

/** Valida en el cliente lo que el backend rechaza con 400; devuelve el mensaje o ''. */
export const validarRegla = (f) => {
    const a = String(f.plantilla_meta ?? '').trim();
    const b = String(f.plantilla_meta_b ?? '').trim();
    if (!String(f.nombre ?? '').trim()) return 'El nombre es obligatorio.';
    if (b && !a) return 'Para usar la variante B primero define la plantilla de Meta A.';
    if (a && b && a === b) return 'Las plantillas A y B deben ser distintas.';
    return '';
};

/** Cuerpo para POST/PATCH: solo campos editables (id, sede, heredada y ab_activo los ignora el backend). */
export const datosRegla = (f) => ({
    nombre: String(f.nombre).trim(),
    etapa: f.etapa,
    dia_relativo: Number(f.dia_relativo),
    canal: f.canal,
    plantilla: f.plantilla,
    plantilla_meta: String(f.plantilla_meta ?? '').trim(),
    plantilla_meta_b: String(f.plantilla_meta_b ?? '').trim(),
    saldo_minimo: f.saldo_minimo,
    destinatario: f.destinatario,
    activa: f.activa,
    recordatorio_extra_paga_tarde: aplicaExtra(f) && !!f.recordatorio_extra_paga_tarde,
});

export const etiquetaDia = (d) => (d === 0 ? 'Día 0' : d > 0 ? `+${d}` : `−${Math.abs(d)}`);
export const descripcionDia = (d) => (d === 0 ? 'El día del vencimiento'
    : d > 0 ? `${d} día${d === 1 ? '' : 's'} después del vencimiento`
        : `${Math.abs(d)} día${d === -1 ? '' : 's'} antes del vencimiento`);

export const MOTIVOS_OMISION = {
    baja_voluntaria: 'El representante pidió la baja',
    pago_en_revision: 'Tiene un pago en revisión',
    limite_semanal: 'Alcanzó el límite semanal de mensajes',
    cobro_manual_hoy: 'Ya se le cobró manualmente hoy',
    conversacion_humana: 'Conversación tomada por el cobrador',
    comprobante_pendiente: 'Comprobante por WhatsApp sin resolver',
};
export const ESTADOS_SIM = {
    saldria: { label: 'Saldría', color: 'var(--green)' },
    se_omitiria: { label: 'Se omitiría', color: 'var(--red)' },
    solo_simulado: { label: 'Solo simulado', color: 'var(--ash)' },
    ya_creado: { label: 'Ya creado', color: 'var(--pb)' },
};

export const fechaLarga = (iso) => {
    try { return format(parseISO(iso), "EEEE d 'de' MMMM 'de' yyyy", { locale: es }); } catch { return iso; }
};
export const hoyISO = () => format(new Date(), 'yyyy-MM-dd');
