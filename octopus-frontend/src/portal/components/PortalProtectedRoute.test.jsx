import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import PortalProtectedRoute from './PortalProtectedRoute';
import PortalLogin from '../pages/PortalLogin';
import { PortalAuthContext } from '../context/usePortalAuth';

vi.mock('../../context/useBranding', () => ({ useBranding: () => ({ nombreColegio: 'Colegio', logoUrl: '' }) }));
vi.mock('./BannerInstalarApp', () => ({ default: () => null }));
vi.mock('react-toastify', () => ({ toast: { warning: vi.fn(), error: vi.fn() } }));

const tokenValido = () => {
  const b64 = (o) => btoa(JSON.stringify(o)).replace(/=+$/, '');
  return `${b64({ alg: 'none' })}.${b64({ exp: Math.floor(Date.now() / 1000) + 3600 })}.x`;
};

const Destino = () => {
  const { pathname, search } = useLocation();
  return <p data-testid="destino">{pathname + search}</p>;
};

const montar = (url) => {
  const ctx = {
    loading: false,
    isAuthenticated: !!localStorage.getItem('portal_token'),
    login: vi.fn(async () => { localStorage.setItem('portal_token', tokenValido()); return { debeCambiarPassword: false }; }),
  };
  render(
    <PortalAuthContext.Provider value={ctx}>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path="/portal/login" element={<><PortalLogin /><Destino /></>} />
          <Route path="/portal" element={<PortalProtectedRoute><Destino /></PortalProtectedRoute>} />
        </Routes>
      </MemoryRouter>
    </PortalAuthContext.Provider>,
  );
  return ctx;
};

describe('PortalProtectedRoute con destino', () => {
  beforeEach(() => { localStorage.clear(); });

  it('redirige al login conservando /portal?pagar=1', () => {
    montar('/portal?pagar=1');
    expect(screen.getByTestId('destino').textContent)
      .toBe(`/portal/login?redirect=${encodeURIComponent('/portal?pagar=1')}`);
  });

  it('login -> vuelve a /portal?pagar=1', async () => {
    const ctx = montar('/portal?pagar=1');
    await userEvent.type(screen.getByLabelText(/cédula o correo/i), 'V-1');
    await userEvent.type(screen.getByLabelText(/^contraseña$/i), 'clave');
    await userEvent.click(screen.getByRole('button', { name: 'Ingresar' }));
    await waitFor(() => expect(screen.getByTestId('destino').textContent).toBe('/portal?pagar=1'));
    expect(ctx.login).toHaveBeenCalled();
  });

  it('ignora un redirect externo y va a /portal', async () => {
    montar(`/portal/login?redirect=${encodeURIComponent('https://evil.com')}`);
    await userEvent.type(screen.getByLabelText(/cédula o correo/i), 'V-1');
    await userEvent.type(screen.getByLabelText(/^contraseña$/i), 'clave');
    await userEvent.click(screen.getByRole('button', { name: 'Ingresar' }));
    await waitFor(() => expect(screen.getByTestId('destino').textContent).toBe('/portal'));
  });
});
