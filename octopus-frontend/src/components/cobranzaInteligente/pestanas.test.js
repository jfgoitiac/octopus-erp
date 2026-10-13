import { describe, it, expect } from 'vitest';
import { pestanasPorRol, rutaPestana, PESTANAS_COBRANZA } from './pestanas';

describe('pestanasPorRol', () => {
    it('el cajero ve Hoy, Cartera y Conversaciones', () => {
        expect(pestanasPorRol('cajero').map(p => p.id)).toEqual(['hoy', 'cartera', 'conversaciones']);
    });
    it('el director ve las cinco pestañas', () => {
        expect(pestanasPorRol('Director').map(p => p.id))
            .toEqual(['hoy', 'cartera', 'conversaciones', 'automatizaciones', 'reportes']);
    });
    it('un rol desconocido no ve ninguna', () => {
        expect(pestanasPorRol('docente')).toEqual([]);
    });
});

describe('rutaPestana', () => {
    it('devuelve la ruta declarada de la pestaña', () => {
        expect(rutaPestana('reportes')).toBe(PESTANAS_COBRANZA.find(p => p.id === 'reportes').to);
    });
    it('un id desconocido cae en la primera pestaña', () => {
        expect(rutaPestana('nada')).toBe(PESTANAS_COBRANZA[0].to);
    });
});
