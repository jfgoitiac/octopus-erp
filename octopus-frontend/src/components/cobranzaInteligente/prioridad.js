/** Colores según el puntaje de prioridad de un caso de la bandeja. */
export const nivel = (puntaje) => {
    if (puntaje >= 60) return { label: 'Alta', color: 'var(--red)', fondo: 'var(--red-light)', avatar: '#9e2b25' };
    if (puntaje >= 35) return { label: 'Media', color: 'var(--orange)', fondo: 'var(--orange-light)', avatar: '#c2410c' };
    return { label: 'Baja', color: 'var(--amber-ink)', fondo: 'var(--yellow-light)', avatar: '#d97706' };
};

/* Estados del ciclo de cobranza, del más grave al más leve. */
export const ETAPAS_CICLO = [
    { clave: 'critica', label: 'Crítica', color: 'var(--red)', fondo: 'var(--red-light)' },
    { clave: 'prioritaria', label: 'Prioritaria', color: 'var(--orange)', fondo: 'var(--orange-light)' },
    { clave: 'seguimiento', label: 'Seguimiento', color: 'var(--amber-ink)', fondo: 'var(--yellow-light)' },
    { clave: 'vencida', label: 'Vencida', color: 'var(--yellow)', fondo: 'var(--yellow-light)' },
    { clave: 'preventiva', label: 'Preventiva', color: 'var(--teal)', fondo: 'var(--green-light)' },
    { clave: 'pausada', label: 'Pausada', color: 'var(--ash)', fondo: 'var(--ash-light)' },
];

/** La etapa más grave entre las deudas de un representante. */
export const etapaDe = (estados = []) => ETAPAS_CICLO.find(e => estados.includes(e.clave)) ?? null;
