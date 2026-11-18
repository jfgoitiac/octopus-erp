import { beforeEach, describe, expect, it, vi } from 'vitest';

const { patch, post } = vi.hoisted(() => ({ patch: vi.fn(), post: vi.fn() }));

vi.mock('../../api/apiClient', () => ({
  default: { patch, post, get: vi.fn() },
}));

import { guardarPlanEvaluacion } from './planEvaluacion.service';

describe('guardarPlanEvaluacion', () => {
  beforeEach(() => {
    patch.mockReset();
    post.mockReset();
  });

  it('envía la versión esperada al actualizar para proteger cambios concurrentes', () => {
    guardarPlanEvaluacion({
      id: 9,
      materia_id: 4,
      lapso_id: 2,
      expected_version: 7,
      bloques: [{ id: 1, nombre: 'Contenido', items: [] }],
    });

    expect(patch).toHaveBeenCalledWith(
      'academico/docente/plan-evaluacion/?materia_id=4&lapso_id=2',
      {
        expected_version: 7,
        bloques: [{ id: 1, nombre: 'Contenido', items: [] }],
      },
    );
  });

  it('no envía expected_version al crear un plan', () => {
    guardarPlanEvaluacion({ materia_id: 4, lapso_id: 2, bloques: [] });
    expect(post).toHaveBeenCalledWith(
      'academico/docente/plan-evaluacion/?materia_id=4&lapso_id=2',
      { bloques: [] },
    );
  });
});
