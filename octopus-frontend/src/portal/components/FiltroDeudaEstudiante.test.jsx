import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import FiltroDeudaEstudiante from './FiltroDeudaEstudiante';

const alumnos = [
  { id: 1, nombre: 'Sofía', apellido: 'González' },
  { id: 2, nombre: 'Mateo', apellido: 'González' },
];

const resumen = {
  total_deuda_usd: 70,
  deuda_por_alumno: [
    { alumno_id: 1, deuda_usd: 70 },
    { alumno_id: 2, deuda_usd: 0 },
  ],
  mensualidades_vencidas: [
    { id: 10, alumno_id: 1 },
    { id: 11, alumno_id: 1 },
  ],
};

describe('FiltroDeudaEstudiante', () => {
  it('muestra el total familiar y el desglose de cada estudiante', () => {
    render(<FiltroDeudaEstudiante alumnos={alumnos} resumen={resumen} alumnoId={null} onChange={() => {}} />);

    expect(screen.getByText('Toda la familia')).toBeInTheDocument();
    expect(screen.getByText('Sofía González')).toBeInTheDocument();
    expect(screen.getByText('2 mensualidades pendientes')).toBeInTheDocument();
    expect(screen.getByText('Mateo González')).toBeInTheDocument();
    expect(screen.getByText('Al día')).toBeInTheDocument();
  });

  it('notifica el estudiante elegido', () => {
    const onChange = vi.fn();
    render(<FiltroDeudaEstudiante alumnos={alumnos} resumen={resumen} alumnoId={null} onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: /Sofía González/i }));
    expect(onChange).toHaveBeenCalledWith('1');
  });
});
