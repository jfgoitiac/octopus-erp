import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import GrupoMensualidadesVencidas from './GrupoMensualidadesVencidas';

const mensualidades = [
  {
    id: 10,
    mes_nombre: 'Octubre',
    anio: 2026,
    alumno_nombre: 'Ana Pérez',
    dias_mora: 20,
    monto_total: '40.00',
  },
  {
    id: 11,
    mes_nombre: 'Octubre',
    anio: 2026,
    alumno_nombre: 'Luis Pérez',
    dias_mora: 20,
    monto_total: '35.00',
  },
];

describe('GrupoMensualidadesVencidas', () => {
  it('permite seleccionar todo el mes', () => {
    const onToggleGrupo = vi.fn();
    render(
      <GrupoMensualidadesVencidas
        titulo="Octubre 2026"
        mensualidades={mensualidades}
        seleccionadas={new Set()}
        onToggle={() => {}}
        onToggleGrupo={onToggleGrupo}
        tasaBcv={{ valor: '40.00' }}
        variosAlumnos
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Seleccionar todo Octubre 2026' }));
    expect(onToggleGrupo).toHaveBeenCalledWith(mensualidades, true);
  });

  it('expone cada mensualidad como checkbox accesible', () => {
    const onToggle = vi.fn();
    render(
      <GrupoMensualidadesVencidas
        titulo="Octubre 2026"
        mensualidades={mensualidades}
        seleccionadas={new Set([10])}
        onToggle={onToggle}
        onToggleGrupo={() => {}}
        tasaBcv={null}
        variosAlumnos
      />,
    );

    const ana = screen.getByRole('checkbox', { name: /Ana Pérez/i });
    expect(ana).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(screen.getByRole('checkbox', { name: /Luis Pérez/i }));
    expect(onToggle).toHaveBeenCalledWith(11);
  });

  it('explica por qué se rechazó el comprobante anterior', () => {
    render(
      <GrupoMensualidadesVencidas
        titulo="Octubre 2026"
        mensualidades={mensualidades}
        seleccionadas={new Set()}
        onToggle={() => {}}
        onToggleGrupo={() => {}}
        tasaBcv={null}
        comprobantePorMensualidad={{
          11: { estatus: 'rechazado', observaciones: 'La imagen no se distingue.' },
        }}
      />,
    );

    expect(screen.getByText(/La imagen no se distingue/)).toBeInTheDocument();
  });
});
