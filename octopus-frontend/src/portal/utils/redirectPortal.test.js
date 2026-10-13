import { describe, it, expect } from 'vitest';
import { esDestinoPortalValido, destinoPortalSeguro, loginPortalConDestino } from './redirectPortal';

describe('redirectPortal', () => {
  it('acepta rutas internas /portal con query', () => {
    expect(esDestinoPortalValido('/portal?pagar=1')).toBe(true);
    expect(esDestinoPortalValido('/portal/historial?x=1#a')).toBe(true);
  });

  it.each([
    'https://evil.com', '//evil.com', '/\\evil.com', '/admin', '/portal-docente', '/portalx',
    '/portal/login', 'portal', '', null, undefined, '/portal\n//evil.com',
  ])('ignora destino no válido %s', (d) => {
    expect(esDestinoPortalValido(d)).toBe(false);
    expect(destinoPortalSeguro(d)).toBe('/portal');
  });

  it('arma la URL de login con el destino codificado', () => {
    expect(loginPortalConDestino({ pathname: '/portal', search: '?pagar=1' }))
      .toEqual({ pathname: '/portal/login', search: `?redirect=${encodeURIComponent('/portal?pagar=1')}` });
  });

  it('sin destino útil va al login limpio', () => {
    expect(loginPortalConDestino({ pathname: '/portal', search: '' })).toBe('/portal/login');
    expect(loginPortalConDestino({ pathname: '/otra', search: '' })).toBe('/portal/login');
  });
});
