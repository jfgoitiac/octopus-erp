import { beforeEach, describe, expect, it, vi } from 'vitest';

const { get, post, put, patch } = vi.hoisted(() => ({
  get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(),
}));

vi.mock('./apiClient', () => ({
  default: { get, post, put, patch, delete: vi.fn() },
}));

import {
  getAsistencia,
  getGradosSecciones,
  getMaterias,
  getPeriodosEscolares,
  saveAsistencia,
  asignarMateriasDocente,
  modificarMateriasDocente,
} from './academico.service';

describe('contrato académico normalizado', () => {
  beforeEach(() => {
    get.mockReset();
    post.mockReset();
    put.mockReset();
    patch.mockReset();
  });

  it('filtra períodos y secciones por sede y período', () => {
    getPeriodosEscolares({ sede: 3 });
    getGradosSecciones({ sede: 3, periodo_id: 8, activo: 'true' });

    expect(get).toHaveBeenNthCalledWith(1, 'academico/periodos-escolares/?sede=3', undefined);
    expect(get).toHaveBeenNthCalledWith(
      2,
      'academico/secciones/?sede=3&periodo_id=8&activo=true',
      undefined,
    );
  });

  it('prioriza seccion_id sin perder el filtro legacy de materias', () => {
    getMaterias({ seccion_id: 12, periodo_id: 8, sede: 3 });
    getMaterias('5to A');

    expect(get).toHaveBeenNthCalledWith(
      1,
      'academico/materias/?seccion_id=12&periodo_id=8&sede=3',
      undefined,
    );
    expect(get).toHaveBeenNthCalledWith(
      2,
      'academico/materias/?grado_seccion=5to+A',
      undefined,
    );
  });

  it('envía asistencia con contexto normalizado', () => {
    getAsistencia({ seccion_id: 12, periodo_id: 8, sede: 3 }, '2026-11-19');
    saveAsistencia(
      { seccion_id: 12, periodo_id: 8, sede: 3 },
      '2026-11-19',
      [{ alumno_id: 4, estado: 'presente' }],
    );

    expect(get).toHaveBeenCalledWith(
      'academico/asistencia/?seccion_id=12&periodo_id=8&sede=3&fecha=2026-11-19',
      { signal: undefined },
    );
    expect(post).toHaveBeenCalledWith('academico/asistencia/', {
      seccion_id: 12,
      periodo_id: 8,
      sede: 3,
      fecha: '2026-11-19',
      registros: [{ alumno_id: 4, estado: 'presente' }],
    });
  });

  it('distingue reemplazo total de cambios parciales de materias docentes', () => {
    asignarMateriasDocente(9, [1, 2]);
    modificarMateriasDocente(9, [3], [1]);

    expect(put).toHaveBeenCalledWith(
      'academico/docentes/9/asignar-materias/', { materias: [1, 2] },
    );
    expect(patch).toHaveBeenCalledWith(
      'academico/docentes/9/asignar-materias/', { agregar: [3], quitar: [1] },
    );
  });
});
