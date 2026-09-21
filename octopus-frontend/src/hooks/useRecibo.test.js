import { describe, it, expect, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useRecibo } from './useRecibo';

vi.mock('../utils/logosInstitucionales', () => ({
  getLogosInstitucionales: () => Promise.resolve({}),
}));
vi.mock('../constants/avec', async (orig) => ({
  ...(await orig()),
  loadCestaConfig: () => Promise.resolve({}),
  loadConceptosUniversales: () => Promise.resolve({}),
}));

// Caso real de la NP-1 (agosto 2026): sueldo 329,85 · 2 años · sin hijos → neto 396,82.
describe('useRecibo — llena asignaciones y retenciones a partir del sueldo', () => {
  it('calcula otras asignaciones, FAOV, SSO, SPF y neto', async () => {
    const { result } = renderHook(() => useRecibo());

    act(() => {
      result.current.setInfoField('sueldoBase', '329.85');
      result.current.setInfoField('anosServicio', '2');
      result.current.setInfoField('numeroHijos', '0');
    });

    await waitFor(() => expect(result.current.asignaciones[1].value).not.toBe(''));

    const { asignaciones, retenciones, calcs } = result.current;
    expect(asignaciones[0].value).toBe('329.85');
    expect(asignaciones[1].value).toBe('90.07');
    expect(retenciones.map(r => r.value).slice(0, 3)).toEqual(['4.20', '16.80', '2.10']);
    expect(calcs.netoDepositar).toBeCloseTo(396.82, 1);
  });
});
