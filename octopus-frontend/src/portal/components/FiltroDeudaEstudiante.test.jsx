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
    expect(screen.getByText('2 conceptos vencidos')).toBeInTheDocument();
    expect(screen.getByText('Mateo González')).toBeInTheDocument();
    expect(screen.getByText('Al día')).toBeInTheDocument();
  });

  it('notifica el estudiante elegido', () => {
    const onChange = vi.fn();
    render(<FiltroDeudaEstudiante alumnos={alumnos} resumen={resumen} alumnoId={null} onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: /Sofía González/i }));
    expect(onChange).toHaveBeenCalledWith('1');
  });

  it('cuenta la inscripción del hijo como concepto vencido', () => {
    const conInscripcion = {
      ...resumen,
      deuda_por_alumno: [{ alumno_id: 1, deuda_usd: 70 }, { alumno_id: 2, deuda_usd: 35 }],
      otros_conceptos_pendientes: [{ id: 5, tipo: 'inscripcion', alumno_id: 2 }],
    };
    render(<FiltroDeudaEstudiante alumnos={alumnos} resumen={conInscripcion} alumnoId={null} onChange={() => {}} />);

    expect(screen.getByText('1 concepto vencido')).toBeInTheDocument();
    expect(screen.queryByText('Sin deuda vencida')).not.toBeInTheDocument();
  });

  it('avisa en la familia los cargos que no son de ningún hijo', () => {
    const conCargoFamiliar = {
      ...resumen,
      otros_conceptos_pendientes: [{ id: 7, tipo: 'proyecto_inversion', alumno_id: null }],
    };
    render(<FiltroDeudaEstudiante alumnos={alumnos} resumen={conCargoFamiliar} alumnoId={null} onChange={() => {}} />);

    expect(screen.getByText('2 estudiantes · incluye cargos familiares')).toBeInTheDocument();
  });

  it('vuelve a la familia y no se muestra con un solo estudiante', () => {
    const onChange = vi.fn();
    const { container, rerender } = render(
      <FiltroDeudaEstudiante alumnos={alumnos} resumen={resumen} alumnoId="1" onChange={onChange} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Toda la familia/i }));
    expect(onChange).toHaveBeenCalledWith(null);

    rerender(<FiltroDeudaEstudiante alumnos={[alumnos[0]]} resumen={resumen} alumnoId={null} onChange={onChange} />);
    expect(container).toBeEmptyDOMElement();
  });
});
