import { beforeEach, describe, expect, it, vi } from 'vitest';

const { get, post } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));

vi.mock('../../api/apiClient', () => ({
  default: { get, post, delete: vi.fn() },
}));

import { getAsistencia, saveAsistencia } from './academico.service';

describe('contrato de asistencia del portal docente', () => {
  beforeEach(() => {
    get.mockReset();
    post.mockReset();
  });

  it('conserva la jornada y versión al leer y guardar', () => {
    const contexto = { grado_seccion: '3A', jornada_id: 7, version: 4 };
    getAsistencia(contexto, '2026-10-07');
    saveAsistencia(contexto, '2026-10-07', [{ alumno_id: 1, estado: 'P' }]);

    expect(get).toHaveBeenCalledWith(
      'academico/asistencia/?grado_seccion=3A&jornada_id=7&version=4&fecha=2026-10-07',
      { signal: undefined },
    );
    expect(post).toHaveBeenCalledWith('academico/asistencia/', {
      ...contexto,
      fecha: '2026-10-07',
      registros: [{ alumno_id: 1, estado: 'P' }],
    });
  });
});
