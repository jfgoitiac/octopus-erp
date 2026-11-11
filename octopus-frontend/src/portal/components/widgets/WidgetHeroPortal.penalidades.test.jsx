import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import WidgetHeroPortal from './WidgetHeroPortal';
import FiltroDeudaEstudiante from '../FiltroDeudaEstudiante';

afterEach(cleanup);
it('la deuda por penalidades no se confunde con comprobantes en revisión', () => {
  render(<WidgetHeroPortal resumen={{ total_deuda_usd: 5, penalidades_convenio: [{ id: 1 }] }} />);
  expect(screen.getByText(/coordina estos conceptos con administración/)).toBeTruthy();
  expect(screen.queryByText('Tus comprobantes están en revisión.')).toBeNull();
});
it('el filtro cuenta la penalidad como un concepto vencido del alumno', () => {
  render(<FiltroDeudaEstudiante alumnos={[{ id: 1, nombre: 'Ana', apellido: 'Pérez' }, { id: 2, nombre: 'Luis', apellido: 'Pérez' }]}
    resumen={{ total_deuda_usd: 5, deuda_por_alumno: [{ alumno_id: 1, deuda_usd: 5 }], penalidades_convenio: [{ id: 1, alumno_id: 1 }] }}
    alumnoId={null} onChange={() => {}} />);
  expect(screen.getByRole('button', { name: /Ana Pérez/ }).textContent).toContain('1 concepto vencido');
});
