import { describe, it, expect } from 'vitest';
import { calcAVEC } from './avec';

// Congela los resultados de calcAVEC para el mismo sueldo base de entrada.
// Objetivo: al simplificar la Configuración de Cesta Ticket (retirar la tabla
// global de sueldos por categoría), el sueldo base ahora se lee directo de la
// ficha del empleado en vez de derivarse de esa tabla — pero calcAVEC en sí
// no debe cambiar. Este test fija el neto/quincena para un sueldo base dado
// y debe seguir pasando exactamente igual antes y después de ese cambio.
describe('calcAVEC — no debe alterarse por la simplificación de Cesta Ticket', () => {
    it('docente D-III, convenio avec_ve: neto y quincena fijos para un sueldo base dado', () => {
        const sb = 10000;
        const resultado = calcAVEC(sb, 'D-III', 10, 2, 'LEM', 'avec_ve', {});

        // primaAnt: 10% (10 años * 1%) de 10000 = 1000
        expect(resultado.primaAnt).toBeCloseTo(1000, 2);
        // primaDoc/primaGeo: 5.5% de 10000 = 550 cada una (D-III)
        expect(resultado.primaDoc).toBeCloseTo(550, 2);
        expect(resultado.primaGeo).toBeCloseTo(550, 2);
        // primaPos: 30% (LEM) de 10000 = 3000
        expect(resultado.primaPos).toBeCloseTo(3000, 2);
        expect(resultado.primaAsis).toBeCloseTo(17.50, 2);
        expect(resultado.primaHijos).toBeCloseTo(25, 2); // 2 hijos * 12.50

        expect(resultado.totalAsig).toBeCloseTo(15142.50, 2);
        expect(resultado.sso).toBeCloseTo(26, 2); // tope SSO
        expect(resultado.spf).toBeCloseTo(75.7125, 2);
        expect(resultado.faov).toBeCloseTo(151.425, 2);
        expect(resultado.neto).toBeCloseTo(14889.3625, 2);
        expect(resultado.quincena).toBeCloseTo(7444.68125, 2);
    });

    it('convenio genérico (sin prima docente/geográfica): mismo sueldo base, otro neto', () => {
        const sb = 10000;
        const resultado = calcAVEC(sb, 'D-III', 10, 2, 'LEM', 'generico', {});

        expect(resultado.primaDoc).toBe(0);
        expect(resultado.primaGeo).toBe(0);
        expect(resultado.totalAsig).toBeCloseTo(14042.50, 2);
    });
});
