import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import TarjetasTable from './TarjetasTable';

const crearTarjetas = () => [
  ...Array.from({ length: 11 }, (_, indice) => ({
    id: indice + 1,
    titular_nombre: `Titular ${String(indice + 1).padStart(2, '0')}`,
    titular_tipo: 'alumno',
    alumno_grado_seccion: `${(indice % 6) + 1}° Grado A`,
    serial: `L005-${String(indice + 1).padStart(4, '0')}`,
    saldo: String(indice * 2),
    limite_credito: '5.00',
    estado: indice === 5 ? 'bloqueada' : 'activa',
  })),
  {
    id: 12,
    titular_nombre: null,
    titular_tipo: null,
    alumno_grado_seccion: null,
    serial: 'L005-0012',
    saldo: '0.00',
    limite_credito: '0.00',
    estado: 'sin_asignar',
  },
];

describe('TarjetasTable', () => {
  it('ordena las asignadas primero y pagina de diez en diez', async () => {
    const user = userEvent.setup();
    render(<TarjetasTable tarjetas={crearTarjetas()} cargando={false} onAjustarCredito={vi.fn()} />);

    expect(screen.getByText('Mostrando 1–10 de 12')).toBeInTheDocument();
    expect(screen.queryByText('— sin asignar —')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Página siguiente' }));

    expect(screen.getByText('Mostrando 11–12 de 12')).toBeInTheDocument();
    expect(screen.getByText('— sin asignar —')).toBeInTheDocument();
    expect(screen.getByText('L005-0012')).toBeInTheDocument();
  });

  it('busca por serial y muestra un estado vacío útil cuando no hay coincidencias', async () => {
    const user = userEvent.setup();
    render(<TarjetasTable tarjetas={crearTarjetas()} cargando={false} onAjustarCredito={vi.fn()} />);

    const buscador = screen.getByRole('searchbox', { name: 'Buscar tarjetas' });
    await user.type(buscador, 'L005-0012');

    expect(screen.getByText('— sin asignar —')).toBeInTheDocument();
    expect(screen.queryByText('Titular 01')).not.toBeInTheDocument();

    await user.clear(buscador);
    await user.type(buscador, 'serial inexistente');

    expect(screen.getByText('No hay tarjetas que coincidan')).toBeInTheDocument();
    expect(screen.getByText('Prueba con otra búsqueda o cambia el filtro.')).toBeInTheDocument();
  });

  it('filtra asignadas y sin asignar, reiniciando la página', async () => {
    const user = userEvent.setup();
    render(<TarjetasTable tarjetas={crearTarjetas()} cargando={false} onAjustarCredito={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Página siguiente' }));
    await user.selectOptions(screen.getByLabelText('Filtrar tarjetas'), 'sin_asignar');

    expect(screen.getByText('— sin asignar —')).toBeInTheDocument();
    expect(screen.queryByText('Titular 11')).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Filtrar tarjetas'), 'asignadas');
    const filas = screen.getAllByRole('row');
    expect(within(filas[1]).getByText('Titular 01')).toBeInTheDocument();
    expect(screen.queryByText('— sin asignar —')).not.toBeInTheDocument();
    expect(screen.getByText('Mostrando 1–10 de 11')).toBeInTheDocument();
  });

  it('permite ordenar por saldo de mayor a menor', async () => {
    const user = userEvent.setup();
    render(<TarjetasTable tarjetas={crearTarjetas()} cargando={false} onAjustarCredito={vi.fn()} />);

    await user.selectOptions(screen.getByLabelText('Ordenar tarjetas'), 'saldo');

    const filas = screen.getAllByRole('row');
    expect(within(filas[1]).getByText('Titular 11')).toBeInTheDocument();
  });
});
