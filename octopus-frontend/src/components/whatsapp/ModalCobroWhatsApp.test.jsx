import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ModalCobroWhatsApp from './ModalCobroWhatsApp';

const { listarMock, previewMock, registrarMock } = vi.hoisted(() => ({
    listarMock: vi.fn(), previewMock: vi.fn(), registrarMock: vi.fn(),
}));

vi.mock('../../api/notificaciones.service', () => ({
    listarPlantillasWhatsApp: (...a) => listarMock(...a),
    previsualizarCobroWhatsApp: (...a) => previewMock(...a),
    registrarEnvioManualCobroWhatsApp: (...a) => registrarMock(...a),
}));
vi.mock('react-toastify', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));

const base = {
    mensaje: 'Hola', telefono: '+584141234567', telefono_valido: true, envio_reciente: false,
};
const aviso = { codigo: 'limite_semanal', mensaje: 'Ya alcanzó el tope semanal.' };
const rep = { cedula: 'V1', nombre: 'Maria', apellido: 'Perez' };

const montar = () => render(<ModalCobroWhatsApp open onClose={vi.fn()} representante={rep} />);
const botonEnviar = () => screen.findByRole('button', { name: /Enviar por WhatsApp/ });

describe('ModalCobroWhatsApp con control de envíos', () => {
    beforeEach(() => {
        listarMock.mockReset().mockResolvedValue({ data: [{ id: 1, nombre: 'P', activa: true, predeterminada: true }] });
        previewMock.mockReset();
        registrarMock.mockReset().mockResolvedValue({ data: {} });
        vi.spyOn(window, 'open').mockImplementation(() => null);
    });

    it('sin clave control el envío es directo, sin confirmación', async () => {
        previewMock.mockResolvedValue({ data: base });
        montar();
        await userEvent.click(await botonEnviar());
        await waitFor(() => expect(registrarMock).toHaveBeenCalled());
        expect(screen.queryByText('Confirmar envío de cobro')).not.toBeInTheDocument();
        expect(registrarMock.mock.calls[0][0].confirmar).toBe(false);
    });

    it('muestra los avisos y pide confirmación antes de abrir wa.me', async () => {
        previewMock.mockResolvedValue({
            data: {
                ...base,
                control: { activo: true, modo_a: { permitido: true, requiere_confirmacion: true, bloqueos: [], avisos: [aviso] } },
            },
        });
        montar();
        expect(await screen.findByText(aviso.mensaje)).toBeInTheDocument();
        await userEvent.click(await botonEnviar());
        expect(await screen.findByText('Confirmar envío de cobro')).toBeInTheDocument();
        expect(window.open).not.toHaveBeenCalled();
        await userEvent.click(screen.getByRole('button', { name: 'Enviar de todas formas' }));
        await waitFor(() => expect(registrarMock).toHaveBeenCalled());
        expect(window.open).toHaveBeenCalled();
        expect(registrarMock.mock.calls[0][0].confirmar).toBe(true);
    });

    it('un 409 con avisos tras registrar abre la confirmación', async () => {
        previewMock.mockResolvedValue({ data: base });
        registrarMock.mockRejectedValueOnce({
            response: { status: 409, data: { error: aviso.mensaje, requiere_confirmacion: true, avisos: [aviso] } },
        });
        montar();
        await userEvent.click(await botonEnviar());
        expect(await screen.findByText('Confirmar envío de cobro')).toBeInTheDocument();
    });
});
