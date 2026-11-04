import { render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import CantinaTarjetas from './CantinaTarjetas';
import { getTarjetas } from '../../api/cantina.service';

vi.mock('../../api/cantina.service', () => ({ getTarjetas: vi.fn() }));
vi.mock('../../components/cantina/tarjetas/GestionQrPanel', () => ({ default: () => <div /> }));
vi.mock('../../components/cantina/tarjetas/TarjetasTable', () => ({ default: () => <div /> }));
vi.mock('../../components/cantina/tarjetas/ConsultarSaldoModal', () => ({ default: () => null }));
vi.mock('../../components/cantina/tarjetas/GenerarLoteModal', () => ({ default: () => null }));
vi.mock('../../components/cantina/tarjetas/ReponerTarjetaModal', () => ({ default: () => null }));
vi.mock('../../components/cantina/tarjetas/ParametrosCreditoModal', () => ({ default: () => null }));
vi.mock('../../components/cantina/tarjetas/AjustarCreditoModal', () => ({ default: () => null }));

describe('CantinaTarjetas', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('resume el inventario completo en total, asignadas y sin asignar', async () => {
    getTarjetas.mockResolvedValue({
      data: [
        { id: 1, estado: 'activa' },
        { id: 2, estado: 'bloqueada' },
        { id: 3, estado: 'sin_asignar' },
      ],
    });

    render(<CantinaTarjetas />);

    await waitFor(() => expect(getTarjetas).toHaveBeenCalledTimes(1));
    const resumen = screen.getByLabelText('Resumen de tarjetas');
    expect(within(resumen).getByText('3')).toBeInTheDocument();
    expect(within(resumen).getByText('2')).toBeInTheDocument();
    expect(within(resumen).getByText('1')).toBeInTheDocument();
    expect(within(resumen).getAllByText('Asignadas')).toHaveLength(2);
    expect(within(resumen).getAllByText('Sin asignar')).toHaveLength(2);
  });
});
