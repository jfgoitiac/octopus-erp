import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CobranzaInteligenteGestion from './CobranzaInteligenteGestion';

const m = vi.hoisted(() => ({
    bandeja: vi.fn(), accion: vi.fn(), pagos: vi.fn(), convenios: vi.fn(), crear: vi.fn(),
}));

vi.mock('../api/cobranza.service', () => ({
    getBandejaInteligente: (...a) => m.bandeja(...a),
    accionCicloInteligente: (...a) => m.accion(...a),
    getPagosRevisionInteligente: (...a) => m.pagos(...a),
    getConveniosInteligente: (...a) => m.convenios(...a),
    crearConvenioInteligente: (...a) => m.crear(...a),
    pagarCuotaConvenio: vi.fn(),
    cancelarConvenioInteligente: vi.fn(),
}));
vi.mock('../context/SedeContext', () => ({ useSede: () => ({ sedeActiva: { id: 1 }, sedes: [{ id: 1 }] }) }));
vi.mock('react-toastify', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const fila = {
    representante: { id: 7, nombre: 'Maria Perez', cedula: 'V1', telefono: '0412' },
    puntaje: 25, razones: [{ texto: 'Mora de 19 días', puntos: 19 }],
    saldo_total_usd: '50.00', dias_mora_max: 19, ciclos: [3, 4], estados: ['prioritaria'], responsable: null,
};

describe('CobranzaInteligenteGestion', () => {
    beforeEach(() => Object.values(m).forEach(f => f.mockReset()));

    it('muestra el puntaje con sus razones', async () => {
        m.bandeja.mockResolvedValue({ data: { count: 1, results: [fila] } });
        render(<CobranzaInteligenteGestion />);
        expect(await screen.findByText('Maria Perez')).toBeInTheDocument();
        expect(screen.getByText('25 pts')).toBeInTheDocument();
        expect(screen.getByText('Mora de 19 días (+19)')).toBeInTheDocument();
    });

    it('si está apagada (409) lo dice sin error', async () => {
        m.bandeja.mockRejectedValue({ response: { status: 409 } });
        render(<CobranzaInteligenteGestion />);
        expect(await screen.findByText(/está apagada/)).toBeInTheDocument();
    });

    it('registrar una acción llama a la API por cada deuda', async () => {
        m.bandeja.mockResolvedValue({ data: { count: 1, results: [fila] } });
        m.accion.mockResolvedValue({});
        render(<CobranzaInteligenteGestion />);
        await userEvent.click(await screen.findByText('Registrar acción'));
        await userEvent.click(screen.getByText('Registrar'));
        await waitFor(() => expect(m.accion).toHaveBeenCalledTimes(2));
        expect(m.accion).toHaveBeenCalledWith(3, expect.objectContaining({ accion: 'llamada' }));
    });

    it('el convenio parte con una cuota igual al saldo', async () => {
        m.bandeja.mockResolvedValue({ data: { count: 1, results: [fila] } });
        m.crear.mockResolvedValue({});
        render(<CobranzaInteligenteGestion />);
        await userEvent.click(await screen.findByText('Crear convenio'));
        expect(screen.getByLabelText('Monto cuota 1')).toHaveValue(50);
        await userEvent.type(screen.getByLabelText('Fecha cuota 1'), '2030-01-15');
        await userEvent.click(screen.getAllByRole('button', { name: 'Crear convenio' }).at(-1));
        await waitFor(() => expect(m.crear).toHaveBeenCalledWith(expect.objectContaining({
            representante_id: 7, ciclo_ids: [3, 4],
        })));
    });
});
