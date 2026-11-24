import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getPlanEvaluacion, getNotasPlan } = vi.hoisted(() => ({
  getPlanEvaluacion: vi.fn(),
  getNotasPlan: vi.fn(),
}));

vi.mock('../api/planEvaluacion.service', () => ({
  getPlanEvaluacion,
  getNotasPlan,
  guardarPlanEvaluacion: vi.fn(),
  guardarNotasPlan: vi.fn(),
}));

vi.mock('react-toastify', () => ({
  toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

import { useDocentePlanEvaluacion } from './useDocentePlanEvaluacion';

const diferida = () => {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};

describe('useDocentePlanEvaluacion', () => {
  beforeEach(() => {
    getPlanEvaluacion.mockReset();
    getNotasPlan.mockReset();
    getNotasPlan.mockResolvedValue({ data: { alumnos: [] } });
  });

  it('limpia el plan anterior mientras carga un lapso diferente', async () => {
    getPlanEvaluacion.mockResolvedValueOnce({ data: { id: 1, materia_id: 4, lapso_id: 1, bloques: [] } });
    const segundaCarga = diferida();
    getPlanEvaluacion.mockReturnValueOnce(segundaCarga.promise);

    const { result, rerender } = renderHook(
      ({ lapsoId }) => useDocentePlanEvaluacion(4, lapsoId),
      { initialProps: { lapsoId: 1 } },
    );
    await waitFor(() => expect(result.current.plan?.lapso_id).toBe(1));

    rerender({ lapsoId: 2 });
    await waitFor(() => expect(result.current.plan).toBeNull());
    expect(getNotasPlan).not.toHaveBeenCalledWith(4, 2, expect.anything());

    await act(async () => {
      segundaCarga.resolve({ data: { id: 2, materia_id: 4, lapso_id: 2, bloques: [] } });
      await segundaCarga.promise;
    });
    await waitFor(() => expect(result.current.plan?.lapso_id).toBe(2));
  });
});
