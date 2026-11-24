import { describe, expect, it } from 'vitest';
import {
  construirPayloadPlan,
  fechaFueraDelLapso,
  fechaInicialParaLapso,
  obtenerTotalCanonicoVisible,
} from './planEvaluacion.utils';

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

describe('preparación del plan de evaluación', () => {
  it('conserva el valor máximo de los ítems en modo promedio', () => {
    const [bloque] = construirPayloadPlan([{
      id: 'tmp-bloque', nombre: 'Contenido', modo: 'promedio', total_puntos: '10',
      items: [{ id: 'tmp-item', nombre: 'Examen', fecha: '2025-10-10', valor_maximo: '20' }],
    }], false);

    expect(bloque.items[0].valor_maximo).toBe(20);
    expect(bloque.items[0]).not.toHaveProperty('id');
  });

  it('elige el inicio del lapso cuando la fecha actual queda fuera', () => {
    expect(fechaInicialParaLapso('2026-11-23', '2025-09-01', '2025-12-15')).toBe('2025-09-01');
    expect(fechaFueraDelLapso('2026-11-23', '2025-09-01', '2025-12-15')).toBe(true);
  });
});
