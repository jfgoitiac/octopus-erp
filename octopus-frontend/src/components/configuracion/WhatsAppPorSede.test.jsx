import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import WhatsAppPorSede from './WhatsAppPorSede';
import * as servicio from '../../services/whatsappSedes';
import { armarPayloadSede } from '../../hooks/useWhatsAppSedes';

vi.mock('react-toastify', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('../../services/whatsappSedes');

const hereda = (id, nombre) => ({
    sede: { id, nombre }, activo: false, numero_visible: '', meta_whatsapp_phone_id: '',
    meta_whatsapp_token: '', meta_waba_id: '', meta_app_secret: '', meta_webhook_verify_token: '',
    usa_configuracion_general: true,
    efectiva: { origen: 'general', phone_id: '999', numero_visible: '', proveedor: 'meta' },
});
const propia = (id, nombre) => ({
    ...hereda(id, nombre), activo: true, numero_visible: '+58 412 5551111',
    meta_whatsapp_phone_id: '555111', meta_whatsapp_token: '••••1234', meta_app_secret: '••••9876',
    usa_configuracion_general: false,
    efectiva: { origen: 'sede', phone_id: '555111', numero_visible: '+58 412 5551111', proveedor: 'meta' },
});

describe('armarPayloadSede', () => {
    it('no reenvía secretos enmascarados ni vacíos, y sí los nuevos', () => {
        const base = { activo: true, numero_visible: 'x', meta_whatsapp_phone_id: '1', meta_waba_id: '',
            meta_webhook_verify_token: '' };
        expect(armarPayloadSede({ ...base, meta_whatsapp_token: '••••1234', meta_app_secret: '' }))
            .not.toHaveProperty('meta_whatsapp_token');
        const nuevo = armarPayloadSede({ ...base, meta_whatsapp_token: 'nuevo', meta_app_secret: '••••9' });
        expect(nuevo.meta_whatsapp_token).toBe('nuevo');
        expect(nuevo).not.toHaveProperty('meta_app_secret');
    });
});

describe('WhatsAppPorSede', () => {
    beforeEach(() => vi.clearAllMocks());

    it('con una sola sede no muestra nada', async () => {
        servicio.listarWhatsAppSedes.mockResolvedValue([hereda(1, 'Norte')]);
        const { container } = render(<WhatsAppPorSede />);
        await waitFor(() => expect(servicio.listarWhatsAppSedes).toHaveBeenCalled());
        await waitFor(() => expect(container).toBeEmptyDOMElement());
    });

    it('indica que la sede usa la configuración general cuando hereda', async () => {
        servicio.listarWhatsAppSedes.mockResolvedValue([hereda(1, 'Norte'), propia(2, 'Sur')]);
        render(<WhatsAppPorSede />);
        expect(await screen.findByText(/usa la configuración general/)).toBeInTheDocument();
        expect(screen.getByRole('option', { name: /Norte \(configuración general\)/ })).toBeInTheDocument();
        expect(screen.getByRole('option', { name: /Sur \(número propio\)/ })).toBeInTheDocument();
        expect(screen.queryByText(/Volver a la configuración general/)).not.toBeInTheDocument();
    });

    it('al elegir una sede con número propio muestra sus campos con secretos enmascarados', async () => {
        servicio.listarWhatsAppSedes.mockResolvedValue([hereda(1, 'Norte'), propia(2, 'Sur')]);
        render(<WhatsAppPorSede />);
        await screen.findByText(/usa la configuración general/);
        await userEvent.selectOptions(screen.getByLabelText('Sede'), '2');
        expect(await screen.findByText(/escribe y recibe por/)).toBeInTheDocument();
        expect(screen.getByLabelText('Phone Number ID')).toHaveValue('555111');
        expect(screen.getByLabelText('Token de acceso (Meta)')).toHaveValue('••••1234');
        expect(screen.getByRole('button', { name: /Volver a la configuración general/ })).toBeInTheDocument();
    });

    it('guarda enviando solo el secreto que se escribió', async () => {
        servicio.listarWhatsAppSedes.mockResolvedValue([hereda(1, 'Norte'), propia(2, 'Sur')]);
        servicio.guardarWhatsAppSede.mockResolvedValue(propia(2, 'Sur'));
        render(<WhatsAppPorSede />);
        await screen.findByText(/usa la configuración general/);
        await userEvent.selectOptions(screen.getByLabelText('Sede'), '2');
        await userEvent.type(await screen.findByLabelText('Phone Number ID'), '7');
        await userEvent.click(screen.getByRole('button', { name: /Guardar WhatsApp de la sede/ }));
        await waitFor(() => expect(servicio.guardarWhatsAppSede).toHaveBeenCalled());
        const [id, payload] = servicio.guardarWhatsAppSede.mock.calls[0];
        expect(id).toBe(2);
        expect(payload.meta_whatsapp_phone_id).toBe('5551117');
        expect(payload).not.toHaveProperty('meta_whatsapp_token');
        expect(payload).not.toHaveProperty('meta_app_secret');
    });

    it('volver a la general pide confirmación en un modal y llama a quitar', async () => {
        servicio.listarWhatsAppSedes.mockResolvedValue([hereda(1, 'Norte'), propia(2, 'Sur')]);
        servicio.quitarWhatsAppSede.mockResolvedValue(hereda(2, 'Sur'));
        render(<WhatsAppPorSede />);
        await screen.findByText(/usa la configuración general/);
        await userEvent.selectOptions(screen.getByLabelText('Sede'), '2');
        await userEvent.click(await screen.findByRole('button', { name: /Volver a la configuración general/ }));
        expect(servicio.quitarWhatsAppSede).not.toHaveBeenCalled();
        await userEvent.click(screen.getByRole('button', { name: /Quitar el número propio/ }));
        await waitFor(() => expect(servicio.quitarWhatsAppSede).toHaveBeenCalledWith(2));
        expect(await screen.findByText(/usa la configuración general/)).toBeInTheDocument();
    });

    it('prueba el envío con la sede elegida', async () => {
        servicio.listarWhatsAppSedes.mockResolvedValue([hereda(1, 'Norte'), propia(2, 'Sur')]);
        servicio.probarWhatsAppSede.mockResolvedValue({ resultados: { whatsapp: 'enviado' } });
        render(<WhatsAppPorSede />);
        await screen.findByText(/usa la configuración general/);
        await userEvent.selectOptions(screen.getByLabelText('Sede'), '2');
        await userEvent.type(await screen.findByLabelText('Número destino de la prueba'), '04121234567');
        await userEvent.click(screen.getByRole('button', { name: /Probar con esta sede/ }));
        await waitFor(() => expect(servicio.probarWhatsAppSede).toHaveBeenCalledWith(2, '04121234567'));
    });
});
