// Plugin de convenio AVEC (Venezuela) — Capa 2 del motor de nómina docente.
// Solo aplica cuando ConfiguracionSistema.convenio_nomina === 'avec_ve'.
// Un colegio con convenio_nomina === 'generico' no debe importar nada de este archivo.

export const CATEGORIAS_DOCENTE = ['D-I S/C', 'D-I', 'D-II', 'D-III', 'D-IV', 'D-V', 'D-VI'];

// 4B Prima Docente — % sobre sueldo base por categoría AVEC
export const PRIMA_DOCENTE_PCT = {
    'D-I S/C': 0.00,
    'D-I':     0.025,
    'D-II':    0.04,
    'D-III':   0.055,
    'D-IV':    0.07,
    'D-V':     0.085,
    'D-VI':    0.10,
};

// 4B/4C Prima Docente + Prima Geográfica.
// [DEUDA] 4C (primaGeo) se asume igual a 4B — verificar tabla MPPE vigente por zona
export function calcPrimaDocente(sueldoBase, categoria) {
    const sb       = parseFloat(sueldoBase) || 0;
    const pctDoc   = PRIMA_DOCENTE_PCT[categoria] ?? 0;
    const primaDoc = sb * pctDoc;
    const primaGeo = primaDoc;
    return { primaDoc, primaGeo };
}

// Sueldo base docente AVEC. Acepta sueldo_mensual (nuevo) o costo_hora (legado).
// sueldo_mensual ÷ horas_sem_referencia = costo_hora → × horas_semanales del empleado
export function calcSueldoBase(config, categoriaDocente, horasSemanales) {
    const catCfg = config.categorias?.[categoriaDocente] || {};
    let costoHora;
    if (parseFloat(catCfg.sueldo_mensual) > 0) {
        const horasRef = parseFloat(config.horas_sem_referencia) || 44;
        costoHora = parseFloat(catCfg.sueldo_mensual) / horasRef;
    } else {
        costoHora = parseFloat(catCfg.costo_hora) || 0;
    }
    return costoHora * (parseFloat(horasSemanales) || 0);
}

export const buildCategoriasDefault = () =>
    Object.fromEntries(CATEGORIAS_DOCENTE.map(c => [c, { sueldo_mensual: '' }]));
