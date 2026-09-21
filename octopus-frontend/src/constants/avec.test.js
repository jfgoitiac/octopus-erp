import { describe, it, expect } from 'vitest';
import { calcAVEC } from './avec';
import { pctAntiguedad } from './convenios/avec_ve';

// Valores tomados de la NP-1 (I quincena agosto 2026, hoja NP1-DD + anexo NP-1).
// Cada fila: [sueldo base, años servicio, hijos, título, SSO, neto mensual, quincena].
// El título 'ESP'/'MSC' reproduce la compensación académica del Excel (30% / 35%).
const FILAS_NP1 = {
    'Andara (S/C, 30 años)':         [307.61, 30, 0, 'BACH', 19.16, 452.57, 226.29],
    'Arias (D-I, 2 años)':           [329.85,  2, 0, 'BACH', 16.80, 396.82, 198.41],
    'Arroyo (D-II, 5 años, 2 hij)':  [342.43,  5, 2, 'BACH', 18.82, 444.66, 222.33],
    'Boniel (D-IV, 14 años, 2 hij)': [377.94, 14, 2, 'BACH', 22.35, 528.03, 264.02],
    'Guanipa (D-III, 7 años, 1 hij)':[359.28,  7, 1, 'BACH', 19.51, 460.90, 230.45],
    'Sierra (S/C, 14 años)':         [230.90, 14, 0, 'BACH', 13.32, 314.60, 157.30],
    'Cardozo (D-VI, esp. 30%)':      [225.35, 26, 0, 'ESP',  16.93, 399.86, 199.93],
    'Martínez (D-V, maestría 35%)':  [404.92, 20, 1, 'MSC',  26.00, 725.46, 362.73],
};

describe('calcAVEC — coincide con la nómina NP-1 del Excel', () => {
    it.each(Object.entries(FILAS_NP1))('%s', (_nombre, [sb, anos, hijos, titulo, sso, neto, quincena]) => {
        const r = calcAVEC(sb, anos, hijos, titulo, 'avec_ve', {});
        expect(r.sso).toBeCloseTo(sso, 2);
        expect(r.neto).toBeCloseTo(neto, 2);
        expect(r.quincena).toBeCloseTo(quincena, 2);
    });

    it('prima docente y geográfica son 10% fijo, sin importar la categoría', () => {
        const r = calcAVEC(329.85, 0, 0, 'BACH', 'avec_ve', {});
        expect(r.primaDoc).toBeCloseTo(32.985, 3);
        expect(r.primaGeo).toBeCloseTo(32.985, 3);
    });

    it('SSO respeta el tope de 26.00 (5 salarios mínimos × 4%)', () => {
        const r = calcAVEC(450.70, 25, 2, 'ESP', 'avec_ve', {});
        expect(r.sso).toBeCloseTo(26, 2);
    });

    it('convenio genérico no aplica primas docente/geográfica', () => {
        const r = calcAVEC(10000, 10, 2, 'LEM', 'generico', {});
        expect(r.primaDoc).toBe(0);
        expect(r.primaGeo).toBe(0);
    });
});

// Primas según el sistema AVEC (sistavec docentes, septiembre 2026).
// Cada fila: [sueldo, años, hijos, postgrado, antigüedad, geográfica, compens. académica, por hijos].
const FILAS_SISTAVEC = {
    'Barrios (ESPE 30%)':        [450.70, 25, 2, 'ESPE', 135.21, 45.07, 135.21, 25.00],
    'Falcón (MAES 35%)':         [450.70, 36, 0, 'MAES', 135.21, 45.07, 157.75,  0.00],
    'Fontalba (ESPE, 21 años)':  [450.70, 21, 0, 'ESPE', 125.29, 45.07, 135.21,  0.00],
    'Prieto (MAES, 0 años)':     [329.85,  0, 1, 'MAES',   0.00, 32.99, 115.45, 12.50],
    'Pereira (NING, 10 años)':   [342.43, 10, 1, 'NING',  37.67, 34.24,   0.00, 12.50],
    'Herrera (NING, 6 años)':    [264.69,  6, 2, 'NING',  16.41, 26.47,   0.00, 25.00],
    'Miranda (parcial 10 h)':    [ 82.46,  9, 0, 'NING',   8.08,  8.25,   0.00,  0.00],
    'Arias (LEM sin postgrado)': [329.85,  2, 0, 'LEM',    6.60, 32.99,   0.00,  0.00],
};

describe('calcAVEC — primas coinciden con el reporte del sistema AVEC', () => {
    it.each(Object.entries(FILAS_SISTAVEC))('%s', (_n, [sb, anos, hijos, postgrado, ant, geo, comp, porHijos]) => {
        const r = calcAVEC(sb, anos, hijos, postgrado, 'avec_ve', {});
        expect(r.primaAnt).toBeCloseTo(ant, 2);
        expect(r.primaGeo).toBeCloseTo(geo, 2);
        expect(Math.abs(r.primaPos - comp)).toBeLessThanOrEqual(0.0051);
        expect(r.primaHijos).toBeCloseTo(porHijos, 2);
    });
});

describe('pctAntiguedad — escala AVEC (tope 30%)', () => {
    it.each([
        [0, 0], [1, 1], [2, 2], [5, 5], [6, 6.2], [7, 7.4], [8, 8.6], [9, 9.8],
        [10, 11], [14, 16.6], [20, 26], [21, 27.8], [22, 29.6], [23, 30], [30, 30],
    ])('%i años → %d%%', (anos, pct) => {
        expect(pctAntiguedad(anos) * 100).toBeCloseTo(pct, 6);
    });
});
