import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import CobranzaStep1 from './CobranzaStep1';

afterEach(cleanup);
it('presenta la penalidad separada del total seleccionado y enlaza su aplicación', () => {
  const alumno = { id: 1, nombre: 'Ana', penalidades_convenio: [
    { id: 91, descripcion: 'Penalidad del convenio #7, período 1', monto_usd: '5.00', fecha_programada: '2026-07-20' },
  ] };
  render(<MemoryRouter><CobranzaStep1 cedula="123" buscarAlumno={vi.fn()} representanteNombre="María Pérez"
    alumnosRep={[alumno]} alumnosSeleccionados={[1]} datosAlumnos={{ 1: alumno }} seleccion={{ 1: {} }}
    cuotasProyectoInversion={[]} selectedProyectos={[]} montosParcialesProyectos={{}} tasa={40}
    totalGenUSD={0} totalGenVES={0} haySeleccion={false} setStep={vi.fn()} /></MemoryRouter>);
  expect(screen.getAllByText('Penalidad del convenio #7, período 1')).toHaveLength(1);
  expect(screen.getByText(/Se cobran por separado de las mensualidades/)).toBeTruthy();
  expect(screen.getByRole('link', { name: 'Ir a Convenios' }).getAttribute('href')).toContain('tab=convenios');
  expect(screen.queryByLabelText('Penalidad del convenio #7, período 1')).toBeNull();
});
