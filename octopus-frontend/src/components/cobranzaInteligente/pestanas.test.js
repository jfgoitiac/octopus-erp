import { describe, it, expect } from 'vitest';
import { pestanasPorRol } from './pestanas';

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
