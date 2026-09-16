import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Horarios from './Horarios';

// Auditoría 2026-09-15 — rediseño del módulo Horarios (paquetes + bloques).
//
// El módulo ya no opera sobre un grado suelto con horas fijas de 1h: primero
// selecciona un "paquete de horario" (?paquete=<id> en la URL) y luego un
// grado dentro de ese paquete; la grilla sale de los BloqueHorario reales
// del paquete (GET .../bloques/), no de un rango de horas calculado en el
// cliente. Este test cubre el camino feliz: con un paquete y un bloque ya
// existentes, la clase asignada a ese bloque debe aparecer en su celda.
vi.mock('../api/apiClient', () => {
  const get = vi.fn((url) => {
    if (url.startsWith('academico/paquetes-horario/1/grados/')) {
      return Promise.resolve({ data: [{ id: 1, grado_seccion: '5to A' }] });
    }
    if (url.startsWith('academico/paquetes-horario/1/bloques/')) {
      return Promise.resolve({
        data: [{ id: 100, dia_semana: 'lunes', orden: 1, hora_inicio: '07:00', hora_fin: '08:00', tipo: 'clase' }],
      });
    }
    if (url.startsWith('academico/paquetes-horario/')) {
      return Promise.resolve({
        data: [{ id: 1, nombre: 'Horario Primaria', periodo_escolar: '2026-2027', sede: 1, estado: 'borrador', grados: [{ id: 1, grado_seccion: '5to A' }] }],
      });
    }
    if (url.startsWith('academico/horarios/')) {
      // Forma real devuelta por HorariosView.get filtrado por paquete+grado.
      return Promise.resolve({
        data: [{
          id: 1,
          materia: { id: 10, nombre: 'Matemáticas' },
          dia_semana: 'lunes',
          dia_semana_label: 'Lunes',
          hora_inicio: '07:00',
          hora_fin: '08:00',
          aula: 'Aula 1',
          bloque_id: 100,
          pineado: false,
        }],
      });
    }
    if (url.startsWith('academico/materias/')) {
      return Promise.resolve({
        data: [{ id: 10, nombre: 'Matemáticas', horas_academicas: 5 }],
      });
    }
    return Promise.resolve({ data: {} });
  });
  return { default: { get, post: vi.fn(), put: vi.fn(), delete: vi.fn() }, API_BASE: 'http://test' };
});

const renderHorarios = () => render(
  <MemoryRouter initialEntries={['/horarios?paquete=1']}>
    <Horarios />
  </MemoryRouter>
);

describe('Horarios — selección de paquete + grado y grilla por bloques', () => {
  it('muestra en la grilla una clase devuelta por el backend para el grado seleccionado', async () => {
    renderHorarios();

    const select = await screen.findByDisplayValue('Seleccionar...');
    fireEvent.change(select, { target: { value: '5to A' } });

    // La clase debe aparecer en su celda (bloque de lunes 07:00) con su aula.
    // (el nombre de la materia también aparece en PanelMaterias, así que se
    // ubica la celda por su aria-label, que es específico de la grilla).
    expect(await screen.findByLabelText('Editar Matemáticas')).toBeInTheDocument();
    expect(screen.getByText('Aula 1')).toBeInTheDocument();
  });
});
