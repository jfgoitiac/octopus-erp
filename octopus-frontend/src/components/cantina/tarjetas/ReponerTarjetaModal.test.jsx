import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import ReponerTarjetaModal from './ReponerTarjetaModal';
import { buscarTarjetaSinAsignar, reponerTarjeta } from '../../../api/cantina.service';

vi.mock('../../../api/cantina.service', () => ({
  buscarTarjetaParaReponer: vi.fn(),
  buscarTarjetaSinAsignar: vi.fn(),
  reponerTarjeta: vi.fn(),
}));

describe('ReponerTarjetaModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('consume una tarjeta física sin asignar antes de confirmar', async () => {
    const user = userEvent.setup();
    buscarTarjetaSinAsignar.mockResolvedValue({
      data: { id: 87, serial: 'L004-0021', codigo: 'CANT-NUEVAAAAAA', estado: 'sin_asignar' },
    });
    reponerTarjeta.mockResolvedValue({
      data: { id: 15, serial: 'L004-0021', estado: 'activa', saldo: '12.50' },
    });

    render(
      <ReponerTarjetaModal
        tarjetaInicial={{ id: 15, serial: 'L001-0004', titular_nombre: 'Ana Pérez' }}
        onClose={vi.fn()}
        onRepuesta={vi.fn()}
      />,
    );

    await user.type(screen.getByLabelText('Tarjeta nueva sin asignar'), 'L004-0021');
    await user.click(screen.getByRole('button', { name: 'Buscar' }));

    expect(await screen.findByText('Lista para entregar')).toBeInTheDocument();
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: 'Confirmar reasignación' }));

    await waitFor(() => {
      expect(reponerTarjeta).toHaveBeenCalledWith(15, 'extravio', 87);
    });
    expect(await screen.findByText('Reasignación completada')).toBeInTheDocument();
  });
});
