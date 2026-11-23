import { describe, expect, it } from 'vitest';
import { construirTablaBoletin } from './boletinPdf';

describe('construirTablaBoletin', () => {
  it('omite Eval 1–4 cuando todas las materias usan el plan de evaluación', () => {
    const tabla = construirTablaBoletin([{
      materia_nombre: 'Ciencias',
      resultado: {
        fuente: 'plan', modalidad: 'numerica', estado: 'en_progreso',
        progreso: { evaluados: 2, esperados: 4, porcentaje: 50 },
        valor_provisional: '12.00',
      },
    }]);

    expect(tabla.head).toEqual(['Materia', 'Progreso', 'Resultado', 'Estado']);
    expect(tabla.body[0]).toEqual(['Ciencias', '2/4 (50%)', '12.00 (provisional)', 'Pendiente']);
  });

  it('conserva Eval 1–4 para boletines legacy', () => {
    const tabla = construirTablaBoletin([{
      materia_nombre: 'Matemáticas', evaluacion_1: '15.00',
      resultado: { fuente: 'legacy', estado: 'cerrado', definitiva: '15.00', aprobado: true },
    }]);

    expect(tabla.head).toEqual([
      'Materia', 'Eval 1', 'Eval 2', 'Eval 3', 'Eval 4', 'Resultado', 'Estado',
    ]);
    expect(tabla.body[0]).toEqual([
      'Matemáticas', '15.00', '—', '—', '—', '15.00', 'Aprobado',
    ]);
  });
});
