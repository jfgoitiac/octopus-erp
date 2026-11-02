import { describe, it, expect, vi, beforeEach } from 'vitest';
import { cancelarPushDelDispositivo } from './useWebPush';

const m = vi.hoisted(() => ({ desuscribir: vi.fn(), fallar: false }));

vi.mock('../api/notificaciones.service', () => ({
  suscribirPush: vi.fn(),
  // La falla se simula fuera del spy: vitest rastrea las promesas que devuelve.
  desuscribirPush: (...a) => { m.desuscribir(...a); return m.fallar ? Promise.reject(new Error('red')) : Promise.resolve({}); },
}));
vi.mock('../../context/BrandingContext', () => ({ useBranding: () => ({}) }));

const instalarSuscripcion = (subscription) => {
  globalThis.Notification = {};
  window.PushManager = function PushManager() {};
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: { getRegistration: async () => ({ pushManager: { getSubscription: async () => subscription } }) },
  });
};

describe('cancelarPushDelDispositivo', () => {
  beforeEach(() => { m.desuscribir.mockReset(); m.fallar = false; });

  it('da de baja el endpoint con el token recibido y desuscribe el navegador', async () => {
    const subscription = { endpoint: 'https://push/ep', unsubscribe: vi.fn().mockResolvedValue(true) };
    instalarSuscripcion(subscription);
    await cancelarPushDelDispositivo('tok');
    expect(m.desuscribir).toHaveBeenCalledWith('https://push/ep', 'tok');
    expect(subscription.unsubscribe).toHaveBeenCalled();
  });

  it('si el backend falla, igual desuscribe el navegador', async () => {
    const subscription = { endpoint: 'e', unsubscribe: vi.fn().mockResolvedValue(true) };
    instalarSuscripcion(subscription);
    m.fallar = true;
    await cancelarPushDelDispositivo('tok');
    expect(subscription.unsubscribe).toHaveBeenCalled();
  });

  it('sin suscripción no llama al backend', async () => {
    instalarSuscripcion(null);
    await cancelarPushDelDispositivo('tok');
    expect(m.desuscribir).not.toHaveBeenCalled();
  });
});
