import { describe, expect, it } from 'vitest';
import {
  esResultadoProvisional,
  extraerCalificaciones,
  normalizarCalificacion,
  valorVisibleCalificacion,
} from './calificaciones';

describe('contrato canónico de calificaciones', () => {
  it('lee el resultado canónico anidado sin recalcular aprobación', () => {
    const fila = normalizarCalificacion({
      alumno_id: 7,
      resultado_calificacion: {
        fuente: 'plan',
        modalidad: 'numerica',
        estado: 'en_progreso',
        valor_provisional: '14.25',
        definitiva: null,
        aprobado: null,
      },
    });

    expect(fila.fuente).toBe('plan');
    expect(fila.aprobado).toBeNull();
    expect(valorVisibleCalificacion(fila)).toBe('14.25');
    expect(esResultadoProvisional(fila)).toBe(true);
  });

  it('prioriza la definitiva literal y respeta la aprobación del servidor', () => {
    const fila = normalizarCalificacion({
      estado: 'cerrado',
      definitiva_literal: 'B',
      aprobado: true,
    });

    expect(valorVisibleCalificacion(fila)).toBe('B');
    expect(fila.aprobado).toBe(true);
    expect(esResultadoProvisional(fila)).toBe(false);
  });

  it('mantiene como provisional una captura completa mientras el lapso está abierto', () => {
    const fila = normalizarCalificacion({
      estado: 'completo',
      valor_provisional: '18.00',
      definitiva: null,
      aprobado: null,
    });

    expect(valorVisibleCalificacion(fila)).toBe('18.00');
    expect(esResultadoProvisional(fila)).toBe(true);
  });

  it('acepta envelopes nuevos y arrays legacy', () => {
    const filas = [{ alumno_id: 1 }];
    expect(extraerCalificaciones({ resultados: filas })).toBe(filas);
    expect(extraerCalificaciones(filas)).toBe(filas);
  });
});

