import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import PortalDashboard from './PortalDashboard';
import { PortalAuthContext } from '../context/usePortalAuth';

const m = vi.hoisted(() => ({ dashboard: vi.fn(), toastInfo: vi.fn(), toastError: vi.fn() }));

vi.mock('../api/portal.service', () => ({ getDashboard: (...a) => m.dashboard(...a) }));
vi.mock('react-toastify', () => ({ toast: { info: (...a) => m.toastInfo(...a), error: (...a) => m.toastError(...a) } }));
vi.mock('../context/useAlumnoActivo', () => ({
  useAlumnoActivo: () => ({ alumnoActivo: null, setAlumnoActivo: vi.fn(), sincronizarConLista: vi.fn() }),
}));
vi.mock('../hooks/usePortalHeroExtra', () => ({
  usePortalHeroExtra: () => ({ avisosSinLeer: 0, alertaRendimiento: [], loadingAvisos: false, loadingRendimiento: false }),
}));
vi.mock('../components/EstudianteSelector', () => ({ default: () => null }));
vi.mock('../components/ComprobantePagoModal', () => ({
  default: ({ isOpen, mensualidad }) => (isOpen ? <div role="dialog">Modal pago {mensualidad?.id}</div> : null),
}));
vi.mock('../components/widgets/WidgetHeroPortal', () => ({ default: () => null }));
vi.mock('../components/widgets/WidgetAccionesRapidas', () => ({ default: () => null }));
vi.mock('../components/widgets/WidgetResumenFinanciero', () => ({ default: () => null }));
vi.mock('../components/widgets/WidgetProximosVencimientos', () => ({ default: () => null }));
vi.mock('../components/widgets/WidgetUltimosPagos', () => ({ default: () => null }));
vi.mock('../components/widgets/WidgetFamiliaHoy', () => ({ default: () => null }));

const Ubicacion = () => <p data-testid="ubicacion">{useLocation().search}</p>;
const montar = (url) => render(
  <PortalAuthContext.Provider value={{ user: { nombre: 'Maria' } }}>
    <MemoryRouter initialEntries={[url]}>
      <Routes><Route path="/portal" element={<><PortalDashboard /><Ubicacion /></>} /></Routes>
    </MemoryRouter>
  </PortalAuthContext.Provider>,
);
const respuesta = (vencidas) => ({
  data: { alumnos: [], ultimos_pagos: [], resumen_financiero: { total_deuda_usd: '50.00', mensualidades_vencidas: vencidas } },
});

describe('PortalDashboard ?pagar=1', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('abre el modal de pago y limpia el parámetro', async () => {
    m.dashboard.mockResolvedValue(respuesta([{ id: 5 }]));
    montar('/portal?pagar=1&x=2');
    expect(await screen.findByRole('dialog')).toHaveTextContent('Modal pago 5');
    await waitFor(() => expect(screen.getByTestId('ubicacion').textContent).toBe('?x=2'));
  });

  it('sin el parámetro no abre el modal', async () => {
    m.dashboard.mockResolvedValue(respuesta([{ id: 5 }]));
    montar('/portal');
    expect((await screen.findAllByText('Pagar por transferencia')).length).toBeGreaterThan(0);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('sin mensualidades vencidas avisa en vez de abrir el modal y también limpia el parámetro', async () => {
    m.dashboard.mockResolvedValue(respuesta([]));
    montar('/portal?pagar=1');
    await screen.findAllByText('Pagar por transferencia');
    expect(m.toastInfo).toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();
    await waitFor(() => expect(screen.getByTestId('ubicacion').textContent).toBe(''));
  });
});
