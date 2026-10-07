import { describe, it, expect } from 'vitest';
import { iniciales, primerSinMarcar, requiereObservacion, SALIDA_POR_ESTADO } from './paseLista.utils';
import { ESTADO } from '../../constants/asistencia';

describe('paseLista.utils', () => {
  it('iniciales toma las dos primeras palabras', () => {
    expect(iniciales('maría josé pérez')).toBe('MJ');
    expect(iniciales('  Ana  ')).toBe('A');
    expect(iniciales('')).toBe('?');
    expect(iniciales(undefined)).toBe('?');
  });

  it('primerSinMarcar devuelve el primer índice sin estado o -1', () => {
    expect(primerSinMarcar([{ estado: ESTADO.PRESENTE }, { estado: null }, { estado: null }])).toBe(1);
    expect(primerSinMarcar([{ estado: ESTADO.AUSENTE }])).toBe(-1);
    expect(primerSinMarcar([])).toBe(-1);
  });

  it('solo Ausente y Justificado piden observación', () => {
    expect(requiereObservacion(ESTADO.AUSENTE)).toBe(true);
    expect(requiereObservacion(ESTADO.JUSTIFICADO)).toBe(true);
    expect(requiereObservacion(ESTADO.PRESENTE)).toBe(false);
    expect(requiereObservacion(ESTADO.RETARDADO)).toBe(false);
  });

  it('cada estado tiene dirección de salida', () => {
    [ESTADO.PRESENTE, ESTADO.AUSENTE, ESTADO.JUSTIFICADO, ESTADO.RETARDADO]
      .forEach(e => expect(SALIDA_POR_ESTADO[e]).toBeTruthy());
  });
});
