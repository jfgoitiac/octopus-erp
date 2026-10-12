import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ModalConvenio } from './ModalConvenio';

const m = vi.hoisted(() => ({ crear: vi.fn() }));
vi.mock('../../../api/cobranza.service', () => ({ crearConvenioInteligente: (...a) => m.crear(...a) }));
vi.mock('react-toastify', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const fila = { representante: { id: 7, nombre: 'Maria Perez' }, saldo_total_usd: '50.00', ciclos: [3, 4] };

describe('ModalConvenio', () => {
    it('el convenio parte con una cuota igual al saldo', async () => {
        m.crear.mockResolvedValue({});
        render(<ModalConvenio fila={fila} onClose={vi.fn()} onHecho={vi.fn()} />);
        expect(screen.getByLabelText('Monto cuota 1')).toHaveValue(50);
        await userEvent.type(screen.getByLabelText('Fecha cuota 1'), '2030-01-15');
        await userEvent.click(screen.getAllByRole('button', { name: 'Crear convenio' }).at(-1));
        await waitFor(() => expect(m.crear).toHaveBeenCalledWith(expect.objectContaining({
            representante_id: 7, ciclo_ids: [3, 4],
        })));
    });
});
