import { describe, it, expect } from 'vitest';
import { avisosModoA, bloqueosModoA, interpretarErrorCobro } from './controlCobro';

const err = (status, data) => ({ response: { status, data } });

describe('controlCobro', () => {
    it('sin clave control (toggle apagado) devuelve vacío', () => {
        expect(avisosModoA({ mensaje: 'x' })).toEqual([]);
        expect(bloqueosModoA(undefined)).toEqual([]);
    });

    it('lee los avisos de modo A', () => {
        const preview = { control: { modo_a: { avisos: [{ codigo: 'baja_voluntaria', mensaje: 'm' }], bloqueos: [] } } };
        expect(avisosModoA(preview)).toHaveLength(1);
    });

    it('400 bloqueado se clasifica como bloqueo', () => {
        const r = interpretarErrorCobro(err(400, {
            error: 'Tiene baja', bloqueado: true, motivo: 'baja_voluntaria',
            bloqueos: [{ codigo: 'baja_voluntaria', mensaje: 'Tiene baja' }],
        }));
        expect(r.tipo).toBe('bloqueado');
        expect(r.bloqueos[0].codigo).toBe('baja_voluntaria');
    });

    it('409 con requiere_confirmacion se clasifica como confirmación', () => {
        const r = interpretarErrorCobro(err(409, {
            error: 'a', requiere_confirmacion: true, avisos: [{ codigo: 'cobro_automatico_hoy', mensaje: 'a' }],
        }));
        expect(r.tipo).toBe('confirmacion');
        expect(r.avisos).toHaveLength(1);
    });

    it('otros errores usan el mensaje del backend o el de defecto', () => {
        expect(interpretarErrorCobro(err(400, { error: 'Sin teléfono' })).mensaje).toBe('Sin teléfono');
        expect(interpretarErrorCobro({}, 'Falló').mensaje).toBe('Falló');
    });
});
