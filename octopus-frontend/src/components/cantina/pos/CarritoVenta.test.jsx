import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import CarritoVenta from './CarritoVenta';

const propsBase = {
  items: [],
  onCambiarCantidad: vi.fn(),
  onQuitar: vi.fn(),
  totalUsd: 0,
  totalVes: 0,
  metodoPago: 'efectivo',
  onCambiarMetodo: vi.fn(),
  onCobrar: vi.fn(),
  cobrando: false,
  cobrarDisabled: true,
  cobrarDisabledMotivo: 'Agrega al menos un producto.',
};

describe('CarritoVenta', () => {
  it('explica el estado vacío y mantiene el cobro deshabilitado', () => {
    render(<CarritoVenta {...propsBase} />);

    expect(screen.getByText('El carrito está vacío')).toBeInTheDocument();
    expect(screen.getByText('Agrega al menos un producto.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cobrar $0.00' })).toBeDisabled();
  });

  it('separa los controles de cantidad, subtotal y eliminación', async () => {
    const user = userEvent.setup();
    const onCambiarCantidad = vi.fn();
    const onQuitar = vi.fn();
    const producto = { id: 17, nombre: 'Jugo natural de naranja grande', precio: '2.50' };

    render(
      <CarritoVenta
        {...propsBase}
        items={[{ producto, cantidad: 2 }]}
        onCambiarCantidad={onCambiarCantidad}
        onQuitar={onQuitar}
        totalUsd={5}
        totalVes={250}
        cobrarDisabled={false}
        cobrarDisabledMotivo=""
      />,
    );

    expect(screen.getByText('$5.00', { selector: 'article p' })).toBeInTheDocument();
    expect(screen.getByText('2', { selector: 'output' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Agregar una unidad de Jugo natural de naranja grande' }));
    expect(onCambiarCantidad).toHaveBeenCalledWith(17, 3);

    await user.click(screen.getByRole('button', { name: 'Quitar Jugo natural de naranja grande del carrito' }));
    expect(onQuitar).toHaveBeenCalledWith(17);
  });

  it('expone y cambia el método de pago seleccionado', async () => {
    const user = userEvent.setup();
    const onCambiarMetodo = vi.fn();
    render(<CarritoVenta {...propsBase} onCambiarMetodo={onCambiarMetodo} />);

    expect(screen.getByRole('button', { name: 'Efectivo USD' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: 'Pago móvil' }));
    expect(onCambiarMetodo).toHaveBeenCalledWith('pago_movil');
  });
});
