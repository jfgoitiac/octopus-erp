import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import AuditoriaReportes from './AuditoriaReportes';

vi.mock('../components/ReporteResumenEjecutivo', () => ({ default: () => <div>Contenido resumen</div> }));
vi.mock('../components/ReporteVentas', () => ({ default: () => <div>Contenido ventas</div> }));
vi.mock('../components/ReporteExcepciones', () => ({ default: () => <div>Contenido excepciones</div> }));
vi.mock('../components/ReporteInventario', () => ({ default: () => <div>Contenido inventario</div> }));
vi.mock('../components/ReporteRentabilidad', () => ({ default: () => <div>Contenido rentabilidad</div> }));

const montar = (ruta = '/auditoria-cantina/reportes') => render(
  <MemoryRouter initialEntries={[ruta]}><AuditoriaReportes /></MemoryRouter>,
);

describe('AuditoriaReportes — pestañas', () => {
  it('Resumen ejecutivo es la primera pestaña y la predeterminada', () => {
    montar();
    const pestanas = screen.getAllByRole('tab').map((t) => t.textContent);
    expect(pestanas).toEqual(['Resumen ejecutivo', 'Ventas', 'Excepciones', 'Inventario', 'Rentabilidad']);
    expect(screen.getByRole('tab', { name: 'Resumen ejecutivo' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('Contenido resumen')).toBeInTheDocument();
  });

  it('las pestañas existentes siguen disponibles', async () => {
    montar();
    for (const [nombre, contenido] of [
      ['Ventas', 'Contenido ventas'], ['Excepciones', 'Contenido excepciones'],
      ['Inventario', 'Contenido inventario'], ['Rentabilidad', 'Contenido rentabilidad'],
    ]) {
      await userEvent.click(screen.getByRole('tab', { name: nombre }));
      expect(screen.getByText(contenido)).toBeInTheDocument();
    }
  });

  it('respeta ?tab= para abrir una pestaña directamente', () => {
    montar('/auditoria-cantina/reportes?tab=inventario');
    expect(screen.getByText('Contenido inventario')).toBeInTheDocument();
  });
});
