import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import CobranzaInteligenteGestion from './CobranzaInteligenteGestion';

const m = vi.hoisted(() => ({
    bandeja: vi.fn(), accion: vi.fn(), pagos: vi.fn(), convenios: vi.fn(), crear: vi.fn(), detener: vi.fn(), aplicar: vi.fn(),
}));

vi.mock('../api/cobranza.service', () => ({
    getBandejaInteligente: (...a) => m.bandeja(...a),
    accionCicloInteligente: (...a) => m.accion(...a),
    getPagosRevisionInteligente: (...a) => m.pagos(...a),
    getConveniosInteligente: (...a) => m.convenios(...a),
    crearConvenioInteligente: (...a) => m.crear(...a),
    pagarCuotaConvenio: vi.fn(),
    cancelarConvenioInteligente: vi.fn(),
    detenerRecargosConvenioInteligente: (...a) => m.detener(...a),
    aplicarPagoRecargoConvenio: (...a) => m.aplicar(...a),
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

    it('aplica un ingreso de caja a una penalidad y conserva el modal si la API falla', async () => {
        m.bandeja.mockResolvedValue({ data: { results: [] } });
        m.convenios.mockResolvedValue({ data: { results: [{
            id: 9, estado: 'incumplido', cuotas: [], total_recargos_pendientes_usd: '5.00',
            recargos: [{ id: 33, numero_periodo: 1, fecha_programada: '2026-07-20', saldo_base_usd: '50.00', monto_recargo_usd: '5.00', estado: 'pendiente' }],
        }] } });
        m.aplicar.mockRejectedValueOnce({ response: { data: { detail: 'Importe incorrecto' } } }).mockResolvedValueOnce({});
        render(<CobranzaInteligenteGestion />, { wrapper: MemoryRouter });
        await userEvent.click(screen.getByRole('tab', { name: 'Convenios' }));
        await userEvent.click(await screen.findByRole('button', { name: 'Aplicar pago de caja' }));
        const confirmar = screen.getByRole('button', { name: 'Aplicar pago', exact: true });
        expect(confirmar).toBeDisabled();
        await userEvent.type(screen.getByLabelText('ID del pago de caja'), '123');
        await userEvent.click(confirmar);
        await waitFor(() => expect(m.aplicar).toHaveBeenCalledWith(33, '123'));
        expect(screen.getByRole('dialog')).toBeInTheDocument();
        await userEvent.click(screen.getByRole('button', { name: 'Aplicar pago', exact: true }));
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    });

    it('muestra el puntaje con sus razones', async () => {
        m.bandeja.mockResolvedValue({ data: { count: 1, results: [fila] } });
        render(<CobranzaInteligenteGestion />, { wrapper: MemoryRouter });
        expect(await screen.findByText('Maria Perez')).toBeInTheDocument();
        expect(screen.getByText('25 pts')).toBeInTheDocument();
        expect(screen.getByText('Mora de 19 días (+19)')).toBeInTheDocument();
    });

    it('si está apagada (409) lo dice sin error', async () => {
        m.bandeja.mockRejectedValue({ response: { status: 409 } });
        render(<CobranzaInteligenteGestion />, { wrapper: MemoryRouter });
        expect(await screen.findByText(/está apagada/)).toBeInTheDocument();
    });

    it('registrar una acción llama a la API por cada deuda', async () => {
        m.bandeja.mockResolvedValue({ data: { count: 1, results: [fila] } });
        m.accion.mockResolvedValue({});
        render(<CobranzaInteligenteGestion />, { wrapper: MemoryRouter });
        await userEvent.click(await screen.findByText('Registrar acción'));
        await userEvent.click(screen.getByText('Registrar'));
        await waitFor(() => expect(m.accion).toHaveBeenCalledTimes(2));
        expect(m.accion).toHaveBeenCalledWith(3, expect.objectContaining({ accion: 'llamada' }));
    });

    it('el convenio parte con una cuota igual al saldo', async () => {
        m.bandeja.mockResolvedValue({ data: { count: 1, results: [{ ...fila, saldo_total_usd: '65.00', saldo_principal_usd: '50.00' }] } });
        m.crear.mockResolvedValue({});
        render(<CobranzaInteligenteGestion />, { wrapper: MemoryRouter });
        await userEvent.click(await screen.findByText('Crear convenio'));
        expect(screen.getByLabelText('Monto cuota 1')).toHaveValue(50);
        await userEvent.type(screen.getByLabelText('Fecha cuota 1'), '2030-01-15');
        await userEvent.click(screen.getAllByRole('button', { name: 'Crear convenio' }).at(-1));
        await waitFor(() => expect(m.crear).toHaveBeenCalledWith(expect.objectContaining({
            representante_id: 7, ciclo_ids: [3, 4],
        })));
    });

    it('permite configurar exoneración y recargo porcentual sin interés compuesto', async () => {
        m.bandeja.mockResolvedValue({ data: { count: 1, results: [fila] } });
        render(<CobranzaInteligenteGestion />, { wrapper: MemoryRouter });
        await userEvent.click(await screen.findByText('Crear convenio'));
        await userEvent.click(screen.getByText('Exonerar recargos normales mientras esté vigente'));
        await userEvent.click(screen.getByText('Aplicar recargo si se incumple'));
        await userEvent.selectOptions(screen.getByLabelText('Modo'), 'porcentaje');
        await userEvent.type(screen.getByLabelText('Valor (%)'), '10');
        expect(screen.getByText(/no hay interés compuesto/i)).toBeInTheDocument();
        expect(screen.getByText(/primer cargo al incumplir: \$5.00/i)).toBeInTheDocument();
    });

    it('un pago en revisión sin deuda vencida no ofrece acciones sobre ciclos inexistentes', async () => {
        m.bandeja.mockResolvedValue({ data: { count: 1, results: [{
            ...fila,
            puntaje: 10,
            razones: [{ texto: 'Pago en revisión hace más de 3 días', puntos: 10 }],
            saldo_total_usd: '0.00',
            dias_mora_max: 0,
            ciclos: [],
            estados: [],
            accion_sugerida: { codigo: 'revisar_pago', texto: 'Revisar el pago en revisión' },
        }] } });

        render(<CobranzaInteligenteGestion />, { wrapper: MemoryRouter });

        expect(await screen.findByText('Revisar el pago en revisión')).toBeInTheDocument();
        expect(screen.queryByText('Registrar acción')).not.toBeInTheDocument();
        expect(screen.queryByText('Crear convenio')).not.toBeInTheDocument();
    });
});
