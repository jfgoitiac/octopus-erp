import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ComprobantePagoModal from './ComprobantePagoModal';

const getMetodosPago = vi.fn();

vi.mock('../api/portal.service', () => ({
  getMetodosPago: (...args) => getMetodosPago(...args),
  subirComprobante: vi.fn(),
}));

describe('ComprobantePagoModal', () => {
  beforeEach(() => {
    getMetodosPago.mockReset();
    getMetodosPago.mockResolvedValue({ data: [] });
  });

  it('espera la cotización vigente antes de mostrar o enviar montos', () => {
    render(
      <ComprobantePagoModal
        isOpen
        cotizando
        opciones={[{ id: 1, mes: 11, anio: 2026, mes_nombre: 'Noviembre', monto_total: '30.00' }]}
        mensualidadesInicialesIds={[1]}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByRole('status')).toHaveTextContent('Actualizando el monto pendiente…');
    expect(screen.queryByText('REF. 30,00')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /enviar comprobante/i })).not.toBeInTheDocument();
  });
});
