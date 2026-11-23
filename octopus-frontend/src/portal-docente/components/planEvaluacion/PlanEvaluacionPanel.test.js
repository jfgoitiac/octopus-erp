import { describe, expect, it } from 'vitest';
import { obtenerTotalCanonicoVisible } from './planEvaluacion.utils';

describe('total canónico del plan de evaluación', () => {
  it('formatea el total confirmado por el backend', () => {
    expect(obtenerTotalCanonicoVisible({ total_canonico: '18.5', pendiente: false })).toBe('18.50');
  });

  it('oculta el total cuando la fila tiene cambios sin guardar', () => {
    expect(obtenerTotalCanonicoVisible({ total_canonico: '18.5', pendiente: true })).toBeNull();
  });

  it('no inventa un total cuando el backend no lo produjo', () => {
    expect(obtenerTotalCanonicoVisible({ total_canonico: null, pendiente: false })).toBeNull();
  });
});
