import { render, screen, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import WidgetResumenFinanciero from './WidgetResumenFinanciero';

afterEach(cleanup);
const penalidad = { id: 91, tipo: 'recargo_convenio', alumno_id: 1, alumno_nombre: 'Ana Pérez',
  concepto: 'Penalidad del convenio #7, período 1', monto_usd: '5.00', fecha_programada: '2026-07-20' };

describe('penalidades en el resumen financiero', () => {
  it('muestra la penalidad una vez y no ofrece reportarla como mensualidad', () => {
    render(<WidgetResumenFinanciero resumen={{ penalidades_convenio: [penalidad] }} tieneDeuda onPagar={vi.fn()} />);
    expect(screen.getAllByText(penalidad.concepto)).toHaveLength(1);
    expect(screen.getByText(/Generada el 20 de jul 2026/)).toBeTruthy();
    expect(screen.getByText(/1 concepto\./)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Reportar pago' })).toBeNull();
  });
  it('filtra la imputación estable por alumno sin repetirla entre hermanos', () => {
    render(<WidgetResumenFinanciero resumen={{ penalidades_convenio: [penalidad] }} tieneDeuda={false} alumnoId={2} />);
    expect(screen.queryByText(penalidad.concepto)).toBeNull();
  });
});
