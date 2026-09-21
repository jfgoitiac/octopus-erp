// Plugin de convenio AVEC (Venezuela) — Capa 2 del motor de nómina docente.
// Solo aplica cuando ConfiguracionSistema.convenio_nomina === 'avec_ve'.
// Un colegio con convenio_nomina === 'generico' no debe importar nada de este archivo.

export const CATEGORIAS_DOCENTE = ['D-I S/C', 'D-I', 'D-II', 'D-III', 'D-IV', 'D-V', 'D-VI'];

// 4B Prima aspecto propio del ejercicio docente y 4C Prima geográfica:
// ambas 10% fijo sobre el sueldo base, sin distinguir categoría (NP-1 AVEC).
export const PRIMA_DOCENTE_PCT    = 0.10;
export const PRIMA_GEOGRAFICA_PCT = 0.10;

export function calcPrimaDocente(sueldoBase) {
    const sb = parseFloat(sueldoBase) || 0;
    return { primaDoc: sb * PRIMA_DOCENTE_PCT, primaGeo: sb * PRIMA_GEOGRAFICA_PCT };
}

// 4A Prima por antigüedad AVEC: % escalonado por años de servicio, tope 30%.
// 1–5 años: +1.0 por año · 6–10: +1.2 · 11–15: +1.4 · 16–20: +1.6 · 21+: +1.8.
export function pctAntiguedad(anosServicio) {
    const anos = Math.max(parseInt(anosServicio) || 0, 0);
    const tramos = [[5, 1.0], [10, 1.2], [15, 1.4], [20, 1.6]];
    let pct = 0;
    let desde = 0;
    for (const [hasta, paso] of tramos) {
        pct += Math.max(Math.min(anos, hasta) - desde, 0) * paso;
        desde = hasta;
    }
    pct += Math.max(anos - desde, 0) * 1.8;
    return Math.min(pct, 30) / 100;
}

// 4D Compensación académica AVEC: depende solo del postgrado del docente
// (ESPE 30%, MAES 35%, DOCT 40%). Un título de pregrado (LEM, LEI, LIC, TSU…) no suma.
export function pctPostgrado(postgrado) {
    const key = (postgrado || '').toUpperCase().replace(/[^A-Z]/g, '');
    if (/^(ESP)/.test(key)) return 0.30;
    if (/^(MAE|MSC|MAG)/.test(key)) return 0.35;
    if (/^(DOC|DR|PHD)/.test(key)) return 0.40;
    return 0;
}

export function calcPrimaAntiguedad(sueldoBase, anosServicio) {
    return (parseFloat(sueldoBase) || 0) * pctAntiguedad(anosServicio);
}

