import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PagarCuentaCantinaModal from './PagarCuentaCantinaModal';
import { getTarjetasPagoCuentaCantina, pagarCuentaCantinaConTarjeta } from '../api/portal.service';

vi.mock('../api/portal.service', () => ({
  getTarjetasPagoCuentaCantina: vi.fn(),
  pagarCuentaCantinaConTarjeta: vi.fn(),
}));
vi.mock('react-toastify', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));

describe('PagarCuentaCantinaModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pagarCuentaCantinaConTarjeta.mockResolvedValue({ data: { pagado_usd: '2.50' } });
  });

  it('paga en USD sin enviar un representante y notifica para refrescar', async () => {
    const user = userEvent.setup();
    const onPagado = vi.fn();
    getTarjetasPagoCuentaCantina.mockResolvedValue({ data: [{ id: 9, alumno_nombre: 'Ana Pérez', serial: 'T-9', saldo: '8.00' }] });
    render(<PagarCuentaCantinaModal open deuda="2.50" onClose={vi.fn()} onPagado={onPagado} />);

    expect(await screen.findByLabelText('Monto a abonar (USD)')).toHaveValue(2.5);
    expect(screen.getByText(/La tasa BCV no cambia el monto debitado/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Confirmar pago' }));

    await waitFor(() => expect(pagarCuentaCantinaConTarjeta).toHaveBeenCalledWith({ tarjeta_id: 9, monto_usd: '2.50' }));
    expect(onPagado).toHaveBeenCalledWith({ pagado_usd: '2.50' });
  });

  it('permite un pago parcial menor que la deuda', async () => {
    const user = userEvent.setup();
    getTarjetasPagoCuentaCantina.mockResolvedValue({ data: [{ id: 10, alumno_nombre: 'Luis Pérez', serial: 'T-10', saldo: '1.25' }] });
    render(<PagarCuentaCantinaModal open deuda="4.00" onClose={vi.fn()} />);

    const campo = await screen.findByLabelText('Monto a abonar (USD)');
    expect(campo).toHaveValue(1.25);
    await user.click(screen.getByRole('button', { name: 'Confirmar pago' }));
    await waitFor(() => expect(pagarCuentaCantinaConTarjeta).toHaveBeenCalledWith({ tarjeta_id: 10, monto_usd: '1.25' }));
  });
});
