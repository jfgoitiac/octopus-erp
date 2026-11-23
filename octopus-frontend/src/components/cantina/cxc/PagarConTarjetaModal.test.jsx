import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import PagarConTarjetaModal from './PagarConTarjetaModal';
import { listarTarjetasPagoDeuda, pagarDeudaConTarjeta } from '../../../api/cantina.service';

vi.mock('../../../api/cantina.service', () => ({
  listarTarjetasPagoDeuda: vi.fn(),
  pagarDeudaConTarjeta: vi.fn(),
}));

vi.mock('react-toastify', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

describe('PagarConTarjetaModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pagarDeudaConTarjeta.mockResolvedValue({ data: { pagado_usd: '2.50' } });
  });

  it('muestra el pago directo en USD y descuenta el monto exacto de la deuda', async () => {
    const user = userEvent.setup();
    listarTarjetasPagoDeuda.mockResolvedValue({
      data: [{ id: 7, alumno_nombre: 'Ana Pérez', serial: 'T-007', saldo: '10.00' }],
    });

    render(<PagarConTarjetaModal representanteId={15} deuda="2.50" onClose={vi.fn()} onPagado={vi.fn()} />);

    expect(await screen.findByText('Pago directo en USD.')).toBeInTheDocument();
    expect(screen.getByText(/la tasa BCV no altera el monto debitado/i)).toBeInTheDocument();
    expect(screen.getByText(/El recibo mostrará equivalente referencial en bolívares/i)).toBeInTheDocument();
    expect(screen.getByText('Deuda total USD')).toBeInTheDocument();
    expect(screen.getByText('Saldo disponible USD')).toBeInTheDocument();
    expect(screen.getByLabelText('Monto exacto a descontar (USD)')).toHaveValue(2.5);

    await user.click(screen.getByRole('button', { name: 'Confirmar pago' }));

    await waitFor(() => expect(pagarDeudaConTarjeta).toHaveBeenCalledWith(15, {
      tarjeta_id: 7,
      monto_usd: '2.50',
    }));
  });

  it('limita el descuento al saldo USD disponible cuando es menor que la deuda', async () => {
    listarTarjetasPagoDeuda.mockResolvedValue({
      data: [{ id: 8, alumno_nombre: 'Luis Pérez', serial: 'T-008', saldo: '1.25' }],
    });

    render(<PagarConTarjetaModal representanteId={16} deuda="2.50" onClose={vi.fn()} />);

    expect(await screen.findByLabelText('Monto exacto a descontar (USD)')).toHaveValue(1.25);
    expect(screen.getByText(/Se descontarán exactamente \$ 1,25 de la tarjeta/i)).toBeInTheDocument();
  });
});
