import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ConfiguracionCobranzaInteligente from './ConfiguracionCobranzaInteligente';

const { getMock, patchMock, sedeState } = vi.hoisted(() => ({
    getMock: vi.fn(),
    patchMock: vi.fn(),
    sedeState: { sedeActiva: { id: 1, nombre: 'Sede Norte' }, sedes: [{ id: 1, nombre: 'Sede Norte' }] },
}));

vi.mock('../api/cobranza.service', () => ({
    getCobranzaInteligente: (...a) => getMock(...a),
    actualizarCobranzaInteligente: (...a) => patchMock(...a),
}));
vi.mock('../context/SedeContext', () => ({ useSede: () => sedeState }));
vi.mock('react-toastify', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const estado = (extra = {}) => ({
    data: {
        sede: 1, activo: false, modo_sombra: true, etapas_envio_activas: [],
        corte_global: false, efectivo: false, activado_por: null, activado_en: null,
        ...extra,
    },
});

describe('ConfiguracionCobranzaInteligente', () => {
    beforeEach(() => {
        getMock.mockReset();
        patchMock.mockReset();
        sedeState.sedeActiva = { id: 1, nombre: 'Sede Norte' };
        sedeState.sedes = [{ id: 1, nombre: 'Sede Norte' }];
    });

    it('viene apagada y no muestra modo sombra ni etapas', async () => {
        getMock.mockResolvedValue(estado());
        render(<ConfiguracionCobranzaInteligente />);
        expect(await screen.findByText('Apagada')).toBeInTheDocument();
        expect(screen.getByRole('switch', { name: 'Cobranza Inteligente' })).toHaveAttribute('aria-checked', 'false');
        expect(screen.queryByText('Modo sombra')).not.toBeInTheDocument();
        expect(getMock).toHaveBeenCalledWith(1, expect.anything());
    });

    it('encender pide confirmación y recién entonces llama a la API', async () => {
        getMock.mockResolvedValue(estado());
        patchMock.mockResolvedValue(estado({ activo: true, efectivo: true }));
        const user = userEvent.setup();
        render(<ConfiguracionCobranzaInteligente />);

        await user.click(await screen.findByRole('switch', { name: 'Cobranza Inteligente' }));
        expect(patchMock).not.toHaveBeenCalled();
        expect(screen.getByRole('dialog')).toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: 'Encender' }));
        await waitFor(() => expect(patchMock).toHaveBeenCalledWith(1, { activo: true }));
        expect(await screen.findByText('Modo sombra')).toBeInTheDocument();
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('apagar envía el motivo escrito', async () => {
        getMock.mockResolvedValue(estado({ activo: true, efectivo: true }));
        patchMock.mockResolvedValue(estado());
        const user = userEvent.setup();
        render(<ConfiguracionCobranzaInteligente />);

        await user.click(await screen.findByRole('switch', { name: 'Cobranza Inteligente' }));
        await user.type(screen.getByLabelText('Motivo (opcional)'), 'pausa de vacaciones');
        await user.click(screen.getByRole('button', { name: 'Apagar' }));
        await waitFor(() => expect(patchMock).toHaveBeenCalledWith(1, { activo: false, motivo: 'pausa de vacaciones' }));
    });

    it('cancelar el modal no cambia nada', async () => {
        getMock.mockResolvedValue(estado());
        const user = userEvent.setup();
        render(<ConfiguracionCobranzaInteligente />);
        await user.click(await screen.findByRole('switch', { name: 'Cobranza Inteligente' }));
        await user.click(screen.getByRole('button', { name: 'Cancelar' }));
        expect(patchMock).not.toHaveBeenCalled();
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('con varias sedes y ninguna elegida pide seleccionar una y no consulta', async () => {
        sedeState.sedeActiva = null;
        sedeState.sedes = [{ id: 1, nombre: 'Sede Norte' }, { id: 2, nombre: 'Sede Sur' }];
        render(<ConfiguracionCobranzaInteligente />);
        expect(await screen.findByText(/Selecciona una sede/)).toBeInTheDocument();
        expect(getMock).not.toHaveBeenCalled();
    });

    it('avisa cuando hay corte global', async () => {
        getMock.mockResolvedValue(estado({ activo: true, corte_global: true, efectivo: false }));
        render(<ConfiguracionCobranzaInteligente />);
        expect(await screen.findByText(/Corte global activo/)).toBeInTheDocument();
    });
});
