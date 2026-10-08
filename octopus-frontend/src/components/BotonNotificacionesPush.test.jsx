import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import BotonNotificacionesPush from './BotonNotificacionesPush';

const m = vi.hoisted(() => ({ estado: vi.fn(), suscribir: vi.fn(), desuscribir: vi.fn(), sw: vi.fn() }));

vi.mock('../api/pushUsuario.service', () => ({
    getEstadoPushUsuario: (...a) => m.estado(...a),
    suscribirPushUsuario: (...a) => m.suscribir(...a),
    desuscribirPushUsuario: (...a) => m.desuscribir(...a),
}));
vi.mock('../portal/hooks/useWebPush', () => ({
    isPushSupported: () => true,
    urlBase64ToUint8Array: () => new Uint8Array([1]),
    ensureServiceWorkerReady: (...a) => m.sw(...a),
}));
vi.mock('react-toastify', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

describe('BotonNotificacionesPush', () => {
    beforeEach(() => {
        Object.values(m).forEach(f => f.mockReset());
        globalThis.Notification = { requestPermission: vi.fn().mockResolvedValue('granted') };
        m.sw.mockResolvedValue({
            pushManager: { getSubscription: async () => null, subscribe: async () => ({ endpoint: 'e' }) },
        });
    });

    it('no se muestra hasta conocer el estado', () => {
        m.estado.mockReturnValue(new Promise(() => {}));
        render(<BotonNotificacionesPush />);
        expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });

    it('activar pide permiso y registra la suscripción', async () => {
        m.estado.mockResolvedValue({ data: { activa: false, vapid_public_key: 'pub' } });
        m.suscribir.mockResolvedValue({});
        render(<BotonNotificacionesPush />);
        const boton = await screen.findByRole('button', { name: 'Activar notificaciones push' });
        await userEvent.click(boton);
        await waitFor(() => expect(m.suscribir).toHaveBeenCalledWith({ endpoint: 'e' }));
        expect(await screen.findByRole('button', { name: 'Desactivar notificaciones push' })).toHaveAttribute('aria-pressed', 'true');
    });

    it('sin clave VAPID no suscribe', async () => {
        m.estado.mockResolvedValue({ data: { activa: false, vapid_public_key: '' } });
        render(<BotonNotificacionesPush />);
        await userEvent.click(await screen.findByRole('button', { name: 'Activar notificaciones push' }));
        await waitFor(() => expect(globalThis.Notification.requestPermission).toHaveBeenCalled());
        expect(m.suscribir).not.toHaveBeenCalled();
    });
});
